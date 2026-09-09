'use server'

/**
 * Session management: publish, block, delete.
 *
 * These four actions are the whole of "sessions can be set from the admin
 * page". A session that does not exist here cannot be booked, so this file is
 * the supply side of the entire product.
 *
 * Three rules, each of which has a reason rather than a preference behind it:
 *
 *   1. EVERY action re-checks the session. Middleware guards navigations, but a
 *      server action is a POST to the same route tree; its action id is a
 *      public endpoint the moment the form is served, and it must not trust the
 *      page that rendered it to have been guarded.
 *
 *   2. EVERY action validates with zod before touching Prisma, and reports back
 *      through a redirect query flag rather than returned state — so the page
 *      stays a server component and a browser with JavaScript off still lands
 *      on a readable message.
 *
 *   3. Deleting a session that somebody has booked is the worst thing this page
 *      could do, so the delete takes the SAME row lock the booking transaction
 *      takes (SELECT ... FOR UPDATE) before it looks for bookings. A delete
 *      racing a booking then queues behind it and refuses, instead of reading
 *      "no bookings" a millisecond before one is committed.
 *
 * Times are entered as an IST calendar date plus an IST wall-clock time and
 * converted to an instant exactly once, in istInstant(). Nothing here reads the
 * server's local zone.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'
import { istInstant, type SessionErrorCode, type SessionNoticeCode } from '@/components/admin/shell'

const SESSIONS_PATH = '/admin/sessions'

/** Guard rails on the bulk create. A runaway range is a mistake, not a feature. */
const MAX_BULK_SESSIONS = 500
const MAX_TIMES_PER_DAY = 12
const MAX_RANGE_DAYS = 366

const MIN_DURATION_MINUTES = 5
const MAX_DURATION_MINUTES = 480
const MAX_LABEL_LENGTH = 80

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

/* ────────────────────────────── validation ─────────────────────────────── */

const dayKeySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const durationSchema = z.coerce
  .number()
  .int()
  .min(MIN_DURATION_MINUTES)
  .max(MAX_DURATION_MINUTES)

const labelSchema = z.string().trim().max(MAX_LABEL_LENGTH)

const slotIdSchema = z.string().trim().min(1).max(64)

const createSessionSchema = z
  .object({
    date: dayKeySchema,
    time: timeSchema,
    durationMinutes: durationSchema,
    label: labelSchema,
  })
  .strict()

const createRangeSchema = z
  .object({
    from: dayKeySchema,
    to: dayKeySchema,
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
    times: z.array(timeSchema).min(1).max(MAX_TIMES_PER_DAY),
    durationMinutes: durationSchema,
    label: labelSchema,
  })
  .strict()

const toggleSchema = z
  .object({
    slotId: slotIdSchema,
    next: z.enum(['AVAILABLE', 'BLOCKED']),
  })
  .strict()

const deleteSchema = z.object({ slotId: slotIdSchema }).strict()

/* ──────────────────────────────── helpers ──────────────────────────────── */

function readString(formData: FormData, field: string): string {
  const value = formData.get(field)
  return typeof value === 'string' ? value : ''
}

function readStringList(formData: FormData, field: string): string[] {
  return formData.getAll(field).filter((value): value is string => typeof value === 'string')
}

/** "11:00, 14:00 , 16:00" -> ['11:00','14:00','16:00'], de-duplicated. */
function parseTimeList(raw: string): string[] {
  const seen = new Set<string>()
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim()
    if (trimmed.length > 0) seen.add(trimmed)
  }
  return Array.from(seen)
}

/**
 * Which of the object's fields failed, as an error code the page has copy for.
 * The bulk form has two fields whose message must be specific — an empty
 * weekday set and an unparseable time list are ordinary mistakes, and "check
 * everything" is a useless thing to tell someone about either.
 */
function codeForIssue(error: z.ZodError): SessionErrorCode {
  const field = error.issues[0]?.path[0]
  if (field === 'weekdays') return 'weekdays'
  if (field === 'times') return 'times'
  return 'invalid'
}

function fail(code: SessionErrorCode): never {
  redirect(`${SESSIONS_PATH}?error=${code}`)
}

function succeed(code: SessionNoticeCode, counts?: { created: number; skipped: number }): never {
  revalidatePath(SESSIONS_PATH)
  revalidatePath('/admin')
  const query = new URLSearchParams({ ok: code })
  if (counts) {
    query.set('n', String(counts.created))
    query.set('skipped', String(counts.skipped))
  }
  redirect(`${SESSIONS_PATH}?${query.toString()}`)
}

/**
 * The unique index on Slot.startsAt is the reason two admins cannot publish the
 * same session twice. Surfacing it as a Prisma stack trace would be a bug
 * report; surfacing it as one sentence is a working form.
 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** Every IST calendar day from `from` to `to` inclusive, or null if inverted. */
function eachDayKey(from: string, to: string): string[] | null {
  // Anchored at UTC noon so adding exactly 24h can never land on the previous
  // or next calendar date, whatever the runtime's zone.
  const start = Date.parse(`${from}T12:00:00.000Z`)
  const end = Date.parse(`${to}T12:00:00.000Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (end < start) return null

  const days: string[] = []
  for (let time = start; time <= end; time += MS_PER_DAY) {
    days.push(new Date(time).toISOString().slice(0, 10))
    if (days.length > MAX_RANGE_DAYS) return days
  }
  return days
}

/** Day of week for a calendar date, 0 = Sunday. Zone-free: it is a date, not an instant. */
function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T12:00:00.000Z`).getUTCDay()
}

/* ─────────────────────────────── the actions ───────────────────────────── */

/** Publish one session. */
export async function createSessionAction(formData: FormData): Promise<void> {
  await requireSession()

  const parsed = createSessionSchema.safeParse({
    date: readString(formData, 'date'),
    time: readString(formData, 'time'),
    durationMinutes: readString(formData, 'durationMinutes'),
    label: readString(formData, 'label'),
  })

  if (!parsed.success) fail('invalid')

  const { date, time, durationMinutes, label } = parsed.data

  // Rejects 2026-02-30 rather than letting Date roll it forward to 2 March.
  const startsAt = istInstant(date, time)
  if (!startsAt) fail('invalid')
  if (startsAt.getTime() <= Date.now()) fail('past')

  const endsAt = new Date(startsAt.getTime() + durationMinutes * MS_PER_MINUTE)

  let outcome: SessionErrorCode | null = null
  try {
    await prisma.slot.create({
      data: { startsAt, endsAt, label: label.length > 0 ? label : null },
    })
  } catch (error) {
    outcome = isUniqueViolation(error) ? 'duplicate' : 'generic'
  }

  // redirect() throws to unwind, so it happens outside the try or the catch
  // above would swallow the redirect and render nothing.
  if (outcome) fail(outcome)
  succeed('created', { created: 1, skipped: 0 })
}

/**
 * Publish a whole range at once: pick weekdays, pick start times, pick a date
 * range. Doing this one row at a time for three months is not a workflow.
 *
 * Duplicates are skipped rather than fatal — republishing a range after adding
 * one more time of day is the normal way this form gets used, and failing the
 * whole batch on the first collision would make that impossible.
 */
export async function createSessionRangeAction(formData: FormData): Promise<void> {
  await requireSession()

  const parsed = createRangeSchema.safeParse({
    from: readString(formData, 'from'),
    to: readString(formData, 'to'),
    weekdays: readStringList(formData, 'weekday'),
    times: parseTimeList(readString(formData, 'times')),
    durationMinutes: readString(formData, 'durationMinutes'),
    label: readString(formData, 'label'),
  })

  if (!parsed.success) fail(codeForIssue(parsed.error))

  const { from, to, weekdays, times, durationMinutes, label } = parsed.data

  const days = eachDayKey(from, to)
  if (!days) fail('range')
  if (days.length > MAX_RANGE_DAYS) fail('rangeTooLong')

  const wanted = new Set(weekdays)
  const matchingDays = days.filter((day) => wanted.has(weekdayOf(day)))
  if (matchingDays.length * times.length > MAX_BULK_SESSIONS) fail('tooMany')

  const now = Date.now()
  const rows: { startsAt: Date; endsAt: Date; label: string | null }[] = []
  let skipped = 0

  for (const day of matchingDays) {
    for (const time of times) {
      const startsAt = istInstant(day, time)
      // A date the calendar does not have, or a time already gone: counted as
      // skipped so the admin is told how many of their grid actually landed.
      if (!startsAt || startsAt.getTime() <= now) {
        skipped += 1
        continue
      }
      rows.push({
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMinutes * MS_PER_MINUTE),
        label: label.length > 0 ? label : null,
      })
    }
  }

  if (rows.length === 0) fail('nothingCreated')

  let created = 0
  let errored = false
  try {
    // skipDuplicates leans on the unique index on startsAt: Postgres decides
    // which rows are new, in one statement, under the same concurrency
    // guarantees a single insert gets.
    const result = await prisma.slot.createMany({ data: rows, skipDuplicates: true })
    created = result.count
  } catch {
    errored = true
  }

  if (errored) fail('generic')
  if (created === 0) fail('nothingCreated')

  succeed('created', { created, skipped: skipped + (rows.length - created) })
}

/**
 * AVAILABLE <-> BLOCKED, and nothing else.
 *
 * The flip is an updateMany whose WHERE names the status it expects, so it is
 * atomic: a BOOKED session can never be blocked out from under its booking,
 * whatever the page was showing when the button was rendered. A zero-row result
 * is then re-read once, purely to say WHY nothing happened.
 */
export async function setSessionStatusAction(formData: FormData): Promise<void> {
  await requireSession()

  const parsed = toggleSchema.safeParse({
    slotId: readString(formData, 'slotId'),
    next: readString(formData, 'next'),
  })

  if (!parsed.success) fail('invalid')

  const { slotId, next } = parsed.data
  const expected = next === 'BLOCKED' ? 'AVAILABLE' : 'BLOCKED'

  let changed = 0
  let errored = false
  try {
    const result = await prisma.slot.updateMany({
      where: { id: slotId, status: expected },
      data: { status: next },
    })
    changed = result.count
  } catch {
    errored = true
  }

  if (errored) fail('generic')

  if (changed === 0) {
    const current = await prisma.slot.findUnique({ where: { id: slotId }, select: { status: true } })
    if (!current) fail('notFound')
    if (current.status === 'BOOKED') fail('booked')
    // Already in the state that was asked for — somebody else got there first,
    // or a stale page was submitted twice. Report the end state, not an error.
    succeed(next === 'BLOCKED' ? 'blocked' : 'unblocked')
  }

  succeed(next === 'BLOCKED' ? 'blocked' : 'unblocked')
}

/**
 * Delete a session, but only one nobody has booked.
 *
 * The row lock is the point. Booking.slotId also carries a restricting foreign
 * key, so the database would refuse this anyway — but a raw FK violation is an
 * unreadable 500, and the lock lets us answer the actual question ("who has
 * it?") with a sentence instead.
 */
export async function deleteSessionAction(formData: FormData): Promise<void> {
  await requireSession()

  const parsed = deleteSchema.safeParse({ slotId: readString(formData, 'slotId') })
  if (!parsed.success) fail('invalid')

  const { slotId } = parsed.data

  let outcome: SessionErrorCode | null = null
  try {
    await prisma.$transaction(async (tx) => {
      // The same lock lockSlotForBooking() takes. A booking committing right
      // now holds it, so we queue behind that commit and then see its booking.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE
      `
      if (locked.length === 0) {
        outcome = 'notFound'
        return
      }

      const bookings = await tx.booking.findMany({ where: { slotId }, select: { status: true } })
      if (bookings.some((booking) => booking.status === 'CONFIRMED')) {
        outcome = 'booked'
        return
      }
      if (bookings.length > 0) {
        // Cancelled or completed bookings still reference this row. Deleting it
        // would erase the record of a call that happened.
        outcome = 'hasHistory'
        return
      }

      await tx.slot.delete({ where: { id: slotId } })
    })
  } catch {
    outcome = 'generic'
  }

  if (outcome) fail(outcome)
  succeed('deleted')
}

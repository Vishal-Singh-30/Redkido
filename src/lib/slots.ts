/**
 * Sessions: what is open, and the lock that stops two people taking the same one.
 *
 * A session is a Slot an admin published. There is no catalogue, no price and
 * no duration to choose — a session IS a start and an end.
 *
 * ── THE RACE DID NOT GO AWAY WITH THE PAYMENT ───────────────────────────────
 * Calls are free now, so there is no 15-minute hold and no PENDING checkout to
 * expire. What survives is the thing holds were protecting: two visitors can
 * still click the same time in the same second. The whole of that protection is
 * one row lock,
 *
 *     SELECT id, status, "startsAt" FROM "Slot" WHERE id = $1 FOR UPDATE
 *
 * taken INSIDE the booking transaction. A read-then-write check outside a
 * transaction reads AVAILABLE in eight concurrent requests before any of them
 * writes, and three of them go on to book the same two sessions. Postgres row
 * locks serialise those eight requests through the row: the first commits the
 * flip to BOOKED, the rest wake up, re-read the status they were blocked on,
 * and fail with SlotUnavailableError.
 *
 * Behind that, a partial unique index on Booking(slotId) WHERE status =
 * 'CONFIRMED' makes the database refuse a double-book even if this file is
 * wrong.
 *
 * ── EVERY DATE HERE IS ASIA/KOLKATA ─────────────────────────────────────────
 * Days are bucketed in IST, never in the server's zone. A 23:30 IST session is
 * Wednesday for the supplier and must read as Wednesday for a visitor in London
 * too — and on a UTC server, `startsAt.toISOString().slice(0, 10)` files it
 * under Tuesday. So the IST day boundaries are computed from the zone itself
 * (see startOfSessionDay), and nothing in this file slices an ISO string.
 */

import { Prisma } from '@/generated/prisma/client'
import type { Slot, SlotStatus } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/** Sessions are published in the supplier's working timezone, not the viewer's. */
export const SLOT_TIME_ZONE = 'Asia/Kolkata'
/** Machine locale for session labels; not user-facing copy. */
export const SLOT_LOCALE = 'en-IN'

/** How far ahead the picker looks by default. */
const DEFAULT_DAYS_AHEAD = 60
/** Defensive caps. A picker never needs more than this, and a runaway query is worse than a short list. */
const MAX_WINDOW_ROWS = 2_000
const MAX_SESSIONS_PER_DAY = 48

const MS_PER_DAY = 86_400_000

/** "2026-04-14". The only date format that crosses this module's boundaries. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type SlotUnavailableReason = 'NOT_FOUND' | 'TAKEN' | 'PAST'

/**
 * Thrown from inside the booking transaction, which rolls the whole thing back.
 * `code` is machine-readable so /api/book can answer 409 and the picker can
 * refresh that day and say so plainly instead of showing a generic failure.
 */
export class SlotUnavailableError extends Error {
  readonly code = 'SLOT_UNAVAILABLE'
  readonly slotId: string
  readonly reason: SlotUnavailableReason

  constructor(slotId: string, reason: SlotUnavailableReason) {
    super(`Slot ${slotId} is not bookable (${reason})`)
    this.name = 'SlotUnavailableError'
    this.reason = reason
    this.slotId = slotId
  }
}

export function isSlotUnavailableError(error: unknown): error is SlotUnavailableError {
  return error instanceof SlotUnavailableError
}

/**
 * One bookable session, ready to render.
 *
 * Dates are ISO strings and every label is already formatted, so the same
 * object crosses the server-component boundary and the /api/slots JSON boundary
 * unchanged — and no client component has to ship an Intl formatter or know
 * what timezone the business runs in.
 *
 *   date   the IST calendar day this session belongs to, "2026-04-14"
 *   time   "10:00 – 10:45 am", the clock range only
 *   label  the full human range, including the day and the zone
 *   title  the admin's optional cosmetic name for the session, or null
 */
export type AvailableSlot = {
  readonly id: string
  readonly startsAt: string
  readonly endsAt: string
  readonly date: string
  readonly time: string
  readonly label: string
  readonly title: string | null
}

/**
 * One day in the strip, with its labels already formatted and its session count.
 *
 * The count is what puts the dots on a day chip, so the strip can show the shape
 * of the diary without the client fetching all sixty days of sessions up front.
 */
export type AvailableDay = {
  readonly date: string
  readonly count: number
  /** "Tue" */
  readonly weekday: string
  /** "14" */
  readonly dayNumber: string
  /** "Apr" */
  readonly month: string
  /** "Tuesday, 14 April" */
  readonly full: string
}

/* ─────────────────────────── zone arithmetic ────────────────────────────── */

/**
 * The instant's civil fields AS SEEN IN a timezone. `hourCycle: 'h23'` is
 * deliberate: with hour12:false some ICU versions render midnight as "24",
 * which would push the offset out by a day.
 */
const zonedPartsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SLOT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

type CivilFields = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function civilFieldsOf(instant: Date): CivilFields {
  const parts = zonedPartsFormat.formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0'
    return Number.parseInt(value, 10)
  }
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  }
}

/** Milliseconds the zone is ahead of UTC at a given instant. IST: +19_800_000. */
function zoneOffsetMs(instant: Date): number {
  const civil = civilFieldsOf(instant)
  const asIfUtc = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
  )
  return asIfUtc - instant.getTime()
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** The IST calendar date an instant falls on, "2026-04-14". */
export function sessionDateOf(instant: Date): string {
  const civil = civilFieldsOf(instant)
  return `${civil.year}-${pad(civil.month)}-${pad(civil.day)}`
}

/** True for a well-formed, real "YYYY-MM-DD". Rejects "2026-02-31". */
export function isSessionDate(value: string): boolean {
  return startOfSessionDay(value) !== null
}

/**
 * The UTC instant at which an IST calendar day begins.
 *
 * The wall clock is first read as if it were UTC and then corrected by the zone
 * offset at that instant; the offset is re-read once at the corrected instant so
 * a day that begins on a DST transition still lands on its true start. IST has
 * no DST and the second read never differs, but the correction costs nothing and
 * the function is then right for any zone this code is ever pointed at.
 *
 * Returns null for a malformed or impossible date, which is what makes it the
 * validator for a `?date=` query parameter as well.
 */
export function startOfSessionDay(date: string): Date | null {
  if (!DATE_PATTERN.test(date)) return null

  const year = Number.parseInt(date.slice(0, 4), 10)
  const month = Number.parseInt(date.slice(5, 7), 10)
  const day = Number.parseInt(date.slice(8, 10), 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const wallClockAsUtc = Date.UTC(year, month - 1, day)
  const firstGuess = new Date(wallClockAsUtc - zoneOffsetMs(new Date(wallClockAsUtc)))
  const corrected = new Date(wallClockAsUtc - zoneOffsetMs(firstGuess))

  // Round-trip: "2026-02-31" rolls forward in Date.UTC and comes back as March.
  return sessionDateOf(corrected) === date ? corrected : null
}

/** "2026-04-14" + 1 -> "2026-04-15". Calendar arithmetic, no zone involved. */
function shiftSessionDate(date: string, days: number): string {
  const shifted = new Date(
    Date.UTC(
      Number.parseInt(date.slice(0, 4), 10),
      Number.parseInt(date.slice(5, 7), 10) - 1,
      Number.parseInt(date.slice(8, 10), 10),
    ) +
      days * MS_PER_DAY,
  )
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/* ──────────────────────────────  labels  ────────────────────────────────── */

const fullLabelFormat = new Intl.DateTimeFormat(SLOT_LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SLOT_TIME_ZONE,
  timeZoneName: 'short',
})

const timeFormat = new Intl.DateTimeFormat(SLOT_LOCALE, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: SLOT_TIME_ZONE,
})

/**
 * "Tue, 14 Apr, 10:00 – 10:45 am GMT+5:30". The timezone name comes from Intl
 * rather than a hardcoded "IST" so a viewer in another zone is never misled.
 */
export function formatSlotLabel(startsAt: Date, endsAt: Date): string {
  try {
    return fullLabelFormat.formatRange(startsAt, endsAt)
  } catch {
    // formatRange throws when the range is inverted. A bad row must not take
    // the whole picker down with it.
    return `${fullLabelFormat.format(startsAt)} – ${fullLabelFormat.format(endsAt)}`
  }
}

/** The same label for a single instant, when no end time is available. */
export function formatSlotStart(startsAt: Date): string {
  return fullLabelFormat.format(startsAt)
}

/**
 * "10:00 – 10:45 am" — the clock range only; the day is established by the
 * heading above the list.
 *
 * formatRange collapses the shared meridiem, which is why it is preferred, but
 * only while both ends fall on the same IST day: once a session crosses
 * midnight formatRange prints both calendar dates, which reads as a bug under a
 * heading that already names the day.
 */
function formatTimeRange(startsAt: Date, endsAt: Date): string {
  try {
    if (sessionDateOf(startsAt) === sessionDateOf(endsAt)) {
      return timeFormat.formatRange(startsAt, endsAt)
    }
  } catch {
    // Fall through to the two-format form, which cannot throw on valid dates.
  }
  return `${timeFormat.format(startsAt)} – ${timeFormat.format(endsAt)}`
}

const weekdayFormat = new Intl.DateTimeFormat(SLOT_LOCALE, { weekday: 'short', timeZone: 'UTC' })
const dayNumberFormat = new Intl.DateTimeFormat(SLOT_LOCALE, { day: 'numeric', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat(SLOT_LOCALE, { month: 'short', timeZone: 'UTC' })
const fullDayFormat = new Intl.DateTimeFormat(SLOT_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/**
 * Labels for one day chip.
 *
 * The key is already an IST calendar date, so it is read at UTC midnight and
 * formatted in UTC: that returns the date's own parts verbatim, with no second
 * zone conversion to get wrong. Converting it to IST here would be the bug,
 * not the fix.
 */
function toAvailableDay(date: string, count: number): AvailableDay {
  const asUtcMidnight = new Date(`${date}T00:00:00Z`)
  return {
    date,
    count,
    weekday: weekdayFormat.format(asUtcMidnight),
    dayNumber: dayNumberFormat.format(asUtcMidnight),
    month: monthFormat.format(asUtcMidnight),
    full: fullDayFormat.format(asUtcMidnight),
  }
}

function toAvailableSlot(row: {
  id: string
  startsAt: Date
  endsAt: Date
  label: string | null
}): AvailableSlot {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    date: sessionDateOf(row.startsAt),
    time: formatTimeRange(row.startsAt, row.endsAt),
    label: formatSlotLabel(row.startsAt, row.endsAt),
    title: row.label,
  }
}

/* ────────────────────────────── availability ────────────────────────────── */

/**
 * The days that have at least one future AVAILABLE session, ascending, with a
 * count for each.
 *
 * One query for the whole window, bucketed in IST here rather than in SQL:
 * Prisma stores DateTime as `timestamp` without a zone, so a Postgres-side
 * `AT TIME ZONE` would need two conversions to be right and would put a second
 * copy of the timezone rule in a place nobody tests.
 */
/**
 * Wraps a read of the sessions table so that a database problem degrades to
 * "nothing on offer" instead of a 500.
 *
 * /book is the page a visitor lands on to give you their business, and it
 * already renders a proper empty state with a contact fallback. Showing that is
 * strictly better than the error boundary, which is what an unreachable
 * database produced in production — the deployed site had no DATABASE_URL, and
 * every read threw.
 *
 * This only guards READS. The booking write is NOT wrapped: if the database is
 * unreachable at the moment someone submits, they must be told it failed, never
 * shown a confirmation for a booking that does not exist.
 *
 * Marker: grep SESSIONS_READ_FAILED to find these in the logs.
 */
async function readSessions<T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch (error) {
    console.error(`[slots] SESSIONS_READ_FAILED ${what} — serving an empty list`, error)
    return fallback
  }
}

export async function listAvailableDays(
  daysAhead: number = DEFAULT_DAYS_AHEAD,
): Promise<AvailableDay[]> {
  const now = new Date()
  const horizon = Math.min(Math.max(Math.trunc(daysAhead), 1), 365)
  const windowEnd = startOfSessionDay(shiftSessionDate(sessionDateOf(now), horizon + 1))

  const rows = await readSessions(
    'listAvailableDays',
    () =>
      prisma.slot.findMany({
        where: {
          status: 'AVAILABLE',
          startsAt: { gt: now, ...(windowEnd === null ? {} : { lt: windowEnd }) },
        },
        orderBy: { startsAt: 'asc' },
        take: MAX_WINDOW_ROWS,
        select: { startsAt: true },
      }),
    [] as { startsAt: Date }[],
  )

  // Insertion order is the query's order, which is chronological, so the Map
  // hands the days back already sorted.
  const counts = new Map<string, number>()
  for (const row of rows) {
    const date = sessionDateOf(row.startsAt)
    counts.set(date, (counts.get(date) ?? 0) + 1)
  }

  return [...counts.entries()].map(([date, count]) => toAvailableDay(date, count))
}

/**
 * The IST calendar dates that have at least one future AVAILABLE session,
 * ascending, as "YYYY-MM-DD" strings.
 */
export async function listAvailableDates(
  daysAhead: number = DEFAULT_DAYS_AHEAD,
): Promise<string[]> {
  return (await listAvailableDays(daysAhead)).map((day) => day.date)
}

/**
 * Every future AVAILABLE session on one IST calendar day, ascending.
 *
 * The day's bounds are resolved from the zone (see startOfSessionDay), and the
 * `gt: now` clause is separate from them so that today's list drops the times
 * that have already started while a future day keeps a session at 00:00 IST.
 *
 * An unparseable date is an empty list rather than a throw: it arrives from a
 * query string, and a hand-edited URL should show "nothing on that day", not a
 * 500.
 */
export async function listSessionsForDate(date: string): Promise<AvailableSlot[]> {
  const dayStart = startOfSessionDay(date)
  if (dayStart === null) return []

  const dayEnd = startOfSessionDay(shiftSessionDate(date, 1))
  if (dayEnd === null) return []

  const rows = await readSessions(
    `listSessionsForDate(${date})`,
    () =>
      prisma.slot.findMany({
        where: {
          status: 'AVAILABLE',
          AND: [
            { startsAt: { gte: dayStart } },
            { startsAt: { lt: dayEnd } },
            { startsAt: { gt: new Date() } },
          ],
        },
        orderBy: { startsAt: 'asc' },
        take: MAX_SESSIONS_PER_DAY,
        select: { id: true, startsAt: true, endsAt: true, label: true },
      }),
    [] as { id: string; startsAt: Date; endsAt: Date; label: string | null }[],
  )

  return rows.map(toAvailableSlot)
}

/* ──────────────────────────────── the lock ──────────────────────────────── */

type LockedSlotRow = {
  id: string
  status: SlotStatus
  startsAt: Date
}

/**
 * Locks one session row for the rest of the transaction and asserts it is still
 * bookable.
 *
 * Must be called with the `tx` handed to prisma.$transaction — the lock lives
 * exactly as long as that transaction, and taking it on the base client would
 * release it on the next statement, which is the same as not taking it.
 *
 * The raw SELECT ... FOR UPDATE is not an optimisation. Prisma has no
 * first-class pessimistic lock, and `findUnique` + `update` is precisely the
 * read-then-write race this exists to close.
 *
 * Throws SlotUnavailableError — never returns a falsy value — so a caller
 * cannot forget to check the result.
 */
export async function lockSlotForBooking(
  tx: Prisma.TransactionClient,
  slotId: string,
): Promise<Slot> {
  const locked = await tx.$queryRaw<LockedSlotRow[]>`
    SELECT id, status, "startsAt" FROM "Slot" WHERE id = ${slotId} FOR UPDATE
  `

  const row = locked[0]
  if (row === undefined) throw new SlotUnavailableError(slotId, 'NOT_FOUND')
  if (row.status !== 'AVAILABLE') throw new SlotUnavailableError(slotId, 'TAKEN')

  /**
   * A session that has already started cannot be booked, however available the
   * row says it is. The picker filters these out, but a form left open over
   * lunch posts a slotId that was fine when the page loaded.
   */
  if (new Date(row.startsAt).getTime() <= Date.now()) {
    throw new SlotUnavailableError(slotId, 'PAST')
  }

  // Safe: we hold the row lock, so nothing can change this session until commit.
  return tx.slot.findUniqueOrThrow({ where: { id: slotId } })
}

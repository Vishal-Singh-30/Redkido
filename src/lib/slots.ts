/**
 * Slot availability.
 *
 * Consultancy has no capacity count. The constraint is binary — "this slot is
 * taken" — so the whole of overselling protection is one row lock:
 *
 *     SELECT id, status FROM "Slot" WHERE id = $1 FOR UPDATE
 *
 * taken INSIDE the checkout transaction. A read-then-write check outside a
 * transaction reads AVAILABLE in eight concurrent requests before any of them
 * writes, and three of them go on to sell the same two slots. Postgres row
 * locks serialise those eight requests through the row: the first commits the
 * flip to BOOKED, the rest wake up, re-read the status they were blocked on,
 * and fail with SlotUnavailableError.
 */

import { Prisma } from '@/generated/prisma/client'
import type { Slot, SlotStatus } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/** Slots are published in the supplier's working timezone, not the viewer's. */
export const SLOT_TIME_ZONE = 'Asia/Kolkata'
/** Machine locale for slot labels; not user-facing copy. */
export const SLOT_LOCALE = 'en-IN'

/** How many upcoming slots a picker ever needs to show at once. */
const SLOT_PAGE_SIZE = 60

export type SlotUnavailableReason = 'NOT_FOUND' | 'TAKEN'

/**
 * Thrown from inside the checkout transaction, which rolls the whole thing
 * back. `code` is machine-readable so the API can answer 409 and the UI can
 * refresh its grid instead of showing a generic failure.
 */
export class SlotUnavailableError extends Error {
  readonly code = 'SLOT_UNAVAILABLE'
  readonly slotId: string
  readonly reason: SlotUnavailableReason

  constructor(slotId: string, reason: SlotUnavailableReason) {
    super(`Slot ${slotId} is not bookable (${reason})`)
    this.name = 'SlotUnavailableError'
    this.slotId = slotId
    this.reason = reason
  }
}

export function isSlotUnavailableError(error: unknown): error is SlotUnavailableError {
  return error instanceof SlotUnavailableError
}

/**
 * Serialisable slot for the picker. Dates are ISO strings so the same object
 * crosses the server-component boundary and the /api/slots JSON boundary
 * unchanged, and `label` is formatted here so no client component has to know
 * about timezones.
 */
export type AvailableSlot = {
  readonly id: string
  readonly startsAt: string
  readonly endsAt: string
  readonly label: string
  readonly consultationTypeId: string | null
}

const slotLabelFormat = new Intl.DateTimeFormat(SLOT_LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SLOT_TIME_ZONE,
  timeZoneName: 'short',
})

/**
 * "Tue, 14 Apr, 10:00 – 10:45 am GMT+5:30". The timezone name comes from Intl
 * rather than a hardcoded "IST" so a viewer in another zone is never misled.
 */
export function formatSlotLabel(startsAt: Date, endsAt: Date): string {
  return slotLabelFormat.formatRange(startsAt, endsAt)
}

function toAvailableSlot(slot: {
  id: string
  startsAt: Date
  endsAt: Date
  consultationTypeId: string | null
}): AvailableSlot {
  return {
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    label: formatSlotLabel(slot.startsAt, slot.endsAt),
    consultationTypeId: slot.consultationTypeId,
  }
}

/**
 * Future, bookable slots, soonest first.
 *
 * "Bookable" is AVAILABLE, plus HELD slots whose hold has lapsed. A HELD slot
 * belongs to a PENDING booking only until that booking's holdExpiresAt; past
 * it the slot returns to the market. Without this, every abandoned Razorpay
 * modal would permanently delete a slot from the calendar.
 *
 * When a consultation type is given, slots dedicated to it are returned along
 * with the unassigned ones (`consultationTypeId` NULL), which are open to any
 * type in the catalogue. BLOCKED and BOOKED rows never appear.
 */
export async function listAvailableSlots(consultationTypeId?: string): Promise<AvailableSlot[]> {
  const candidates = await prisma.slot.findMany({
    where: {
      status: { in: ['AVAILABLE', 'HELD'] },
      startsAt: { gt: new Date() },
      ...(consultationTypeId === undefined
        ? {}
        : { OR: [{ consultationTypeId }, { consultationTypeId: null }] }),
    },
    orderBy: { startsAt: 'asc' },
    take: SLOT_PAGE_SIZE,
    select: { id: true, startsAt: true, endsAt: true, consultationTypeId: true, status: true },
  })

  const heldIds = candidates.filter((s) => s.status === 'HELD').map((s) => s.id)

  // Which of those holds are still live? Anything else is reclaimable.
  const liveHolds =
    heldIds.length === 0
      ? []
      : await prisma.booking.findMany({
          where: {
            slotId: { in: heldIds },
            status: 'PENDING',
            OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: new Date() } }],
          },
          select: { slotId: true },
        })

  const blocked = new Set(liveHolds.map((b) => b.slotId))

  return candidates.filter((s) => !blocked.has(s.id)).map(toAvailableSlot)
}

type LockedSlotRow = {
  id: string
  status: SlotStatus
}

/**
 * Locks one slot row for the rest of the transaction and asserts it is still
 * bookable.
 *
 * Must be called with the `tx` handed to prisma.$transaction — the lock lives
 * exactly as long as that transaction, and taking it on the base client would
 * release it on the next statement, which is the same as not taking it.
 *
 * The raw SELECT ... FOR UPDATE is not an optimisation. Prisma has no
 * first-class pessimistic lock, and `findUnique` + `update` is precisely the
 * read-then-write race this exists to close.
 */
export async function lockSlotForBooking(
  tx: Prisma.TransactionClient,
  slotId: string,
): Promise<Slot> {
  const locked = await tx.$queryRaw<LockedSlotRow[]>`
    SELECT id, status FROM "Slot" WHERE id = ${slotId} FOR UPDATE
  `

  const row = locked[0]
  if (row === undefined) throw new SlotUnavailableError(slotId, 'NOT_FOUND')
  if (row.status === 'BOOKED' || row.status === 'BLOCKED') {
    throw new SlotUnavailableError(slotId, 'TAKEN')
  }

  if (row.status === 'HELD') {
    // We hold the slot's row lock, so this count cannot change under us.
    const live = await tx.booking.count({
      where: {
        slotId,
        status: 'PENDING',
        OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: new Date() } }],
      },
    })
    if (live > 0) throw new SlotUnavailableError(slotId, 'TAKEN')

    // Every hold on this slot has lapsed. Retire those bookings so they stop
    // appearing as open checkouts.
    //
    // Their Razorpay orders may still be payable — Razorpay does not close an
    // order when the customer walks away. If one of them is captured later,
    // the webhook's re-acquisition step finds the slot gone and flags the
    // booking with slotConflict rather than silently double-booking it. The
    // money is never dropped; a human reschedules.
    await tx.booking.updateMany({
      where: { slotId, status: 'PENDING' },
      data: { status: 'CANCELLED', holdExpiresAt: null },
    })
  }

  // Safe: we hold the row lock, so nothing can change this slot until commit.
  return tx.slot.findUniqueOrThrow({ where: { id: slotId } })
}

/**
 * Re-acquire a slot at capture time, when the money has already moved.
 *
 * Returns true if this booking legitimately owns the slot. Returns false when
 * another PAID booking got there first — in which case the caller must still
 * mark the booking PAID (the payment is real) but flag it for a human.
 */
export async function reacquireSlotForPaidBooking(
  tx: Prisma.TransactionClient,
  slotId: string,
  bookingId: string,
): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE`

  const paidElsewhere = await tx.booking.count({
    where: { slotId, status: 'PAID', id: { not: bookingId } },
  })
  if (paidElsewhere > 0) return false

  await tx.slot.update({ where: { id: slotId }, data: { status: 'BOOKED' } })
  return true
}

/** How long a PENDING checkout may hold a slot before it returns to the market. */
export const SLOT_HOLD_MINUTES = 15

export function holdExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + SLOT_HOLD_MINUTES * 60_000)
}

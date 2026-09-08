/**
 * Funnel 2 — start a paid consultation checkout.
 *
 * ── WHAT THE BROWSER MAY DECIDE ─────────────────────────────────────────────
 * Which consultation, which slot, who it is for, and where they are billed.
 * That is all. There is no price in the request body — `bookingInput` is
 * `.strict()`, so a body carrying one is REJECTED rather than ignored — and the
 * amount charged is resolved here by quoteConsultation(), the same resolver the
 * consultation page renders from. The advertised figure and the charged figure
 * are therefore one value read twice, not two values that happen to agree.
 *
 * ── THE ORDERING TRADE-OFF (deliberate; the alternatives are worse) ──────────
 * Creating a Razorpay order is network I/O and can take seconds. Holding an
 * open Postgres transaction — and, with DATABASE_POOL_MAX=1, THE connection —
 * across that call would serialise every other request behind a third-party
 * API. So the transaction does the minimum:
 *
 *      BEGIN
 *        SELECT ... FOR UPDATE on the slot     (the whole of oversell protection)
 *        INSERT Lead, INSERT Booking (PENDING)
 *        UPDATE Slot -> BOOKED
 *      COMMIT
 *      -- then, outside: createOrder(), then patch razorpayOrderId
 *
 * The cost of that choice: `Booking.razorpayOrderId` is NOT NULL and UNIQUE, so
 * the row is inserted with a random `pending_<uuid>` placeholder that is
 * replaced by the real order id a moment later. The placeholder is unique, it
 * can never collide with a Razorpay id, and it makes an un-patched row obvious
 * in the database.
 *
 * If order creation then fails, the compensating write rolls the slot back to
 * AVAILABLE and marks the booking FAILED, so a gateway outage costs one dead
 * booking row rather than a slot that is silently unsellable forever.
 *
 * The rejected alternative — create the order first, then take the lock — makes
 * the failure mode a paid-for order against a slot somebody else just took,
 * which is a refund conversation instead of a retry.
 */

import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { quoteConsultation } from '@/lib/pricing'
import { createOrder, getRazorpayKeyId } from '@/lib/razorpay'
import { lockSlotForBooking, isSlotUnavailableError, holdExpiryFrom } from '@/lib/slots'
import { bookingInput, toFieldErrors } from '@/lib/validation'

/** node:crypto and the Prisma driver adapter both need the Node runtime. */
export const runtime = 'nodejs'
/** Checkout must never be cached or statically evaluated. */
export const dynamic = 'force-dynamic'

const LOG = '[api:checkout]'

/** Recorded on the Lead so the admin can tell the two funnels apart. */
const LEAD_SOURCE = 'website:consultation-checkout'

/**
 * Interactive transaction budget. Nothing inside it does I/O beyond Postgres,
 * so this is generous; it exists to bound a lock wait, not to permit slow work.
 */
const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const

/** Machine codes the booking form maps to copy from src/content/forms.ts. */
const CODE = {
  invalidBody: 'INVALID_BODY',
  validation: 'VALIDATION',
  consultationUnavailable: 'CONSULTATION_UNAVAILABLE',
  slotUnavailable: 'SLOT_UNAVAILABLE',
  slotInPast: 'SLOT_IN_PAST',
  paymentUnavailable: 'PAYMENT_UNAVAILABLE',
  orderFailed: 'ORDER_FAILED',
  serverError: 'SERVER_ERROR',
} as const

/**
 * Raised inside the transaction when the row lock succeeded — the slot is
 * AVAILABLE — but the slot still cannot be sold for this request.
 * `PAST` and `TAKEN` are different messages to the client, so they stay apart.
 */
class SlotNotSellableError extends Error {
  readonly slotId: string
  readonly reason: 'PAST' | 'TAKEN'

  constructor(slotId: string, reason: 'PAST' | 'TAKEN') {
    super(`Slot ${slotId} cannot be sold (${reason})`)
    this.name = 'SlotNotSellableError'
    this.slotId = slotId
    this.reason = reason
  }
}

/**
 * Hands the slot back and closes the booking out after the gateway refused to
 * create an order. Conditional on both sides: a slot is only released while it
 * is still BOOKED, and a booking is only failed while it is still unpaid, so a
 * webhook that raced in first is never overwritten.
 */
async function rollbackBooking(bookingId: string, slotId: string): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.booking.updateMany({
        where: { id: bookingId, paidAt: null },
        data: { status: 'FAILED' },
      }),
      prisma.slot.updateMany({
        where: { id: slotId, status: 'BOOKED' },
        data: { status: 'AVAILABLE' },
      }),
    ])
    console.info(`${LOG} booking=${bookingId} rolled back; slot=${slotId} released`)
  } catch (error) {
    // Alert on this: the slot is now held by a booking that will never be paid.
    console.error(`${LOG} booking=${bookingId} ROLLBACK FAILED for slot=${slotId}`, error)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: CODE.invalidBody }, { status: 400 })
  }

  const parsed = bookingInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: CODE.validation, fieldErrors: toFieldErrors(parsed.error) },
      { status: 400 },
    )
  }
  const input = parsed.data

  /**
   * Checked before anything is written. Without a key id the browser cannot
   * open Checkout, and a booking created here would hold a slot against a
   * payment that can never start.
   */
  const keyId = getRazorpayKeyId()
  if (keyId === null) {
    console.error(`${LOG} refused: Razorpay is not configured`)
    return NextResponse.json({ ok: false, code: CODE.paymentUnavailable }, { status: 503 })
  }

  /**
   * THE price. Read from the ConsultationType row by the shared resolver; the
   * client's state and GSTIN steer only the place of supply (which tax heads
   * apply), never the total.
   */
  const quote = await quoteConsultation({
    slug: input.consultationSlug,
    clientStateCode: input.clientStateCode,
    clientGstin: input.clientGstin,
  })
  if (quote === null) {
    return NextResponse.json({ ok: false, code: CODE.consultationUnavailable }, { status: 404 })
  }
  const { consultation, gst } = quote

  let bookingId: string
  try {
    bookingId = await prisma.$transaction(async (tx) => {
      // 1. The lock. Everything after this line is protected by it.
      const slot = await lockSlotForBooking(tx, input.slotId)

      // 2. A slot that has already started cannot be sold, whatever its status.
      if (slot.startsAt.getTime() <= Date.now()) throw new SlotNotSellableError(slot.id, 'PAST')

      // 3. A slot dedicated to another consultation type is not this product.
      //    Unassigned slots (NULL) are open to anything in the catalogue.
      if (slot.consultationTypeId !== null && slot.consultationTypeId !== consultation.id) {
        throw new SlotNotSellableError(slot.id, 'TAKEN')
      }

      /**
       * 4. No cleanup of earlier bookings on this slot, deliberately.
       *
       *    A previous attempt is never deleted. Razorpay does not close an
       *    order when a payment fails or the customer walks away, so that
       *    order stays payable — deleting its booking would leave a later
       *    capture with nothing to attach to, and the payment orphaned.
       *
       *    lockSlotForBooking() has already established that this slot is
       *    claimable: it is AVAILABLE, or it was HELD by bookings whose holds
       *    have all lapsed (which it retired to CANCELLED under the row lock).
       *    A stale order that is captured after that point is caught at
       *    capture time and flagged with slotConflict, never silently
       *    double-booked.
       *
       *    Their LEADS are kept regardless. Somebody whose payment failed is
       *    exactly the person the owner should call.
       */

      // 5. Lead + Booking, with the GST breakdown copied verbatim from the quote.
      const lead = await tx.lead.create({
        data: {
          kind: 'CONSULTATION',
          name: input.name,
          email: input.email,
          phone: input.phone,
          company: input.company ?? null,
          message: input.message ?? null,
          source: LEAD_SOURCE,
        },
      })

      const booking = await tx.booking.create({
        data: {
          leadId: lead.id,
          slotId: slot.id,
          consultationTypeId: consultation.id,
          status: 'PENDING',
          totalPaise: gst.totalPaise,
          taxablePaise: gst.taxablePaise,
          cgstPaise: gst.cgstPaise,
          sgstPaise: gst.sgstPaise,
          igstPaise: gst.igstPaise,
          gstRatePercent: gst.gstRatePercent,
          sacCode: gst.sacCode,
          placeOfSupplyStateCode: gst.placeOfSupplyStateCode,
          clientStateCode: input.clientStateCode ?? null,
          clientGstin: input.clientGstin ?? null,
          isInterState: gst.isInterState,
          // Placeholder — replaced with the real order id immediately after
          // this transaction commits. See the header comment.
          razorpayOrderId: `pending_${randomUUID()}`,
          // The slot is reserved for this long, not forever. An abandoned
          // checkout must not delete a sellable slot from the calendar.
          holdExpiresAt: holdExpiryFrom(new Date()),
        },
        select: { id: true },
      })

      // 6. HELD, not BOOKED, inside the same transaction as the booking that
      //    owns it. It becomes BOOKED only when the payment is captured.
      await tx.slot.update({ where: { id: slot.id }, data: { status: 'HELD' } })

      return booking.id
    }, TX_OPTIONS)
  } catch (error) {
    if (isSlotUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: CODE.slotUnavailable, slotId: error.slotId },
        { status: 409 },
      )
    }
    if (error instanceof SlotNotSellableError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.reason === 'PAST' ? CODE.slotInPast : CODE.slotUnavailable,
          slotId: error.slotId,
        },
        { status: 409 },
      )
    }
    console.error(`${LOG} failed to reserve slot=${input.slotId}`, error)
    return NextResponse.json({ ok: false, code: CODE.serverError }, { status: 500 })
  }

  // ── Committed. The slot is ours; now the network call. ─────────────────────
  try {
    const order = await createOrder({
      amountPaise: gst.totalPaise,
      receipt: bookingId,
      notes: {
        bookingId,
        consultationSlug: consultation.slug,
        slotId: input.slotId,
      },
    })

    /**
     * The gateway echoes the amount back. A disagreement means the order the
     * client is about to pay is not the order we priced, so nothing is patched
     * and the booking is rolled back rather than left pointing at it.
     */
    if (order.amountPaise !== gst.totalPaise) {
      console.error(
        `${LOG} booking=${bookingId} AMOUNT MISMATCH order=${order.id} ` +
          `gateway=${order.amountPaise}p quoted=${gst.totalPaise}p`,
      )
      await rollbackBooking(bookingId, input.slotId)
      return NextResponse.json({ ok: false, code: CODE.orderFailed }, { status: 502 })
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { razorpayOrderId: order.id },
    })

    console.info(`${LOG} booking=${bookingId} order=${order.id} amount=${gst.totalPaise}p`)

    /**
     * Everything the browser needs to open Checkout and nothing else. The
     * amount is echoed for display only — it is already fixed in the Razorpay
     * order and in the Booking row, so a tampered value in the browser changes
     * what the user sees and not a paisa of what is charged.
     */
    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
        amountPaise: gst.totalPaise,
        currency: order.currency,
        keyId,
        bookingId,
        prefill: {
          name: input.name,
          email: input.email,
          contact: input.phone,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    console.error(`${LOG} booking=${bookingId} order creation failed`, error)
    await rollbackBooking(bookingId, input.slotId)
    return NextResponse.json({ ok: false, code: CODE.orderFailed }, { status: 502 })
  }
}

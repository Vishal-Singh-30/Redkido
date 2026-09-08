/**
 * Razorpay webhook receiver.
 *
 * Two rules govern every line below, and both were learned expensively:
 *
 * 1. The HMAC covers the EXACT BYTES Razorpay sent. `request.text()` first,
 *    always; `request.json()` would parse and re-serialise the body and every
 *    signature would fail. JSON.parse only runs AFTER the signature verifies.
 *
 * 2. Answer 2xx to every delivery whose signature is valid — events we do not
 *    handle, events whose business logic fails, unexpected throws, all of them.
 *    A non-2xx makes Razorpay retry for ~24h and then DISABLE the endpoint
 *    outright, which silently breaks every future payment. The one and only
 *    400 is an absent or invalid signature, because that is the one case that
 *    is not a real Razorpay delivery.
 *
 *    The cost of that rule: a database outage makes deliveries look accepted
 *    while nothing is written. Every such failure is logged with the
 *    UNEXPECTED marker below and must be alerted on.
 */

import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { fulfilBooking } from '@/lib/fulfilment'
import { prisma } from '@/lib/prisma'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { reacquireSlotForPaidBooking } from '@/lib/slots'

/** node:crypto and the Prisma driver adapter both need the Node runtime. */
export const runtime = 'nodejs'
/** A webhook must never be cached or statically evaluated. */
export const dynamic = 'force-dynamic'

const LOG = '[razorpay:webhook]'

const SIGNATURE_HEADER = 'x-razorpay-signature'
const EVENT_ID_HEADER = 'x-razorpay-event-id'

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002'

/** Stored on the WebhookEvent row when Razorpay sends no usable `event` name. */
const UNKNOWN_EVENT = 'unknown'

const EVENT_PAYMENT_CAPTURED = 'payment.captured'
const EVENT_ORDER_PAID = 'order.paid'
const EVENT_PAYMENT_FAILED = 'payment.failed'

/**
 * Deliberately permissive: every field optional, unknown keys stripped. Razorpay
 * adds fields over time and a strict schema would reject real deliveries. The
 * full untouched body is stored on the WebhookEvent row regardless.
 */
const paymentEntitySchema = z.object({
  id: z.string().optional(),
  order_id: z.string().nullish(),
  amount: z.number().int().optional(),
  status: z.string().optional(),
  error_code: z.string().nullish(),
  error_description: z.string().nullish(),
  error_reason: z.string().nullish(),
})

const orderEntitySchema = z.object({
  id: z.string().optional(),
  amount: z.number().int().optional(),
  status: z.string().optional(),
})

const webhookSchema = z.object({
  event: z.string().optional(),
  payload: z
    .object({
      payment: z.object({ entity: paymentEntitySchema }).optional(),
      order: z.object({ entity: orderEntitySchema }).optional(),
    })
    .optional(),
})

type PaymentEntity = z.infer<typeof paymentEntitySchema>
type OrderEntity = z.infer<typeof orderEntitySchema>
type WebhookEnvelope = z.infer<typeof webhookSchema>

/**
 * Machine-to-machine acknowledgement. Razorpay only reads the HTTP status, so
 * this body is protocol, not user-facing copy.
 */
function ack(outcome: string): NextResponse {
  return NextResponse.json({ received: true, outcome }, { status: 200 })
}

/** The only non-2xx this endpoint may ever return. */
function rejectUnsigned(): NextResponse {
  return NextResponse.json({ received: false, outcome: 'invalid_signature' }, { status: 400 })
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * JSON.parse yields `unknown`; a Prisma Json column takes InputJsonValue. The
 * assertion is confined to this helper, where the input is genuinely unknown.
 */
function toJsonColumn(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

/**
 * Duck-typed rather than `instanceof Prisma.PrismaClientKnownRequestError`: the
 * driver adapter can hand back a structurally identical error from a different
 * module instance, and the error code is the actual contract.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  )
}

/**
 * A stable id for this delivery, so a retry is recognised as the same event.
 * Header first; then the documented fallback of payment id + event name; then
 * the order id; and finally a digest of the body, which is still deterministic
 * across retries of an identical payload.
 */
function deriveEventId(
  header: string | null,
  event: string,
  payment: PaymentEntity | undefined,
  order: OrderEntity | undefined,
  raw: string,
): string {
  const fromHeader = header?.trim()
  if (fromHeader) return fromHeader
  if (payment?.id) return `${payment.id}.${event}`
  if (order?.id) return `${order.id}.${event}`
  return `sha256.${createHash('sha256').update(raw, 'utf8').digest('hex')}`
}

async function markProcessed(eventId: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { eventId },
    data: { processedAt: new Date() },
  })
}

/**
 * payment.captured / order.paid.
 *
 * The PAID transition is claimed with a conditional write. The browser callback
 * route races this handler for the same booking, and exactly one of them wins:
 *   UPDATE "Booking" SET status='PAID', paidAt=now(), razorpayPaymentId=$1
 *   WHERE "razorpayOrderId"=$2 AND "paidAt" IS NULL
 * Losing is a normal outcome, not an error.
 */
async function handlePaid(
  event: string,
  payment: PaymentEntity | undefined,
  order: OrderEntity | undefined,
): Promise<void> {
  const orderId = payment?.order_id ?? order?.id ?? null
  if (!orderId) {
    console.warn(`${LOG} ${event} carried no order id; nothing to reconcile`)
    return
  }

  const booking = await prisma.booking.findUnique({
    where: { razorpayOrderId: orderId },
  })
  if (!booking) {
    console.warn(`${LOG} ${event} for unknown order ${orderId}; ignoring`)
    return
  }

  /**
   * The gateway payload is NEVER the source of truth for money. A disagreement
   * is logged for a human and the booking is left exactly as priced.
   */
  const reportedPaise = payment?.amount ?? order?.amount ?? null
  if (reportedPaise !== null && reportedPaise !== booking.totalPaise) {
    console.error(
      `${LOG} AMOUNT MISMATCH booking=${booking.id} order=${orderId} ` +
        `gateway=${reportedPaise}p booking=${booking.totalPaise}p — booking NOT modified`,
    )
  }

  const amountMismatch = reportedPaise !== null && reportedPaise !== booking.totalPaise

  /**
   * The PAID claim and the slot re-acquisition happen in ONE transaction.
   *
   * A Razorpay order stays payable after a failed attempt, and a lapsed hold
   * may have handed this slot to somebody else in the meantime. So ownership is
   * re-established here, under the slot's row lock, at the moment the money
   * actually lands — not assumed from what checkout wrote minutes ago.
   */
  const outcome = await prisma.$transaction(async (tx) => {
    const claim = await tx.booking.updateMany({
      where: { razorpayOrderId: orderId, paidAt: null },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        // undefined leaves the column untouched; order.paid can arrive without a
        // payment entity, and we must not blank an id the callback already stored.
        razorpayPaymentId: payment?.id,
        // The hold has served its purpose; the booking is paid.
        holdExpiresAt: null,
      },
    })

    const ownsSlot = await reacquireSlotForPaidBooking(tx, booking.slotId, booking.id)

    if (!ownsSlot) {
      // Another PAID booking already owns this slot. The payment is real, so
      // the booking stays PAID — but it is flagged rather than double-booked,
      // and a human reschedules or refunds.
      await tx.booking.updateMany({
        where: { id: booking.id, slotConflict: false },
        data: { slotConflict: true },
      })
    }

    return { claimed: claim.count > 0, ownsSlot }
  })

  if (outcome.claimed) {
    console.info(`${LOG} ${event} booking=${booking.id}: claimed PAID transition`)
  } else {
    console.info(
      `${LOG} ${event} booking=${booking.id}: PAID transition already claimed ` +
        `(browser callback won the race)`,
    )
  }

  if (!outcome.ownsSlot) {
    console.error(
      `${LOG} SLOT CONFLICT booking=${booking.id} slot=${booking.slotId} — paid, ` +
        `but the slot was already sold. Flagged for manual reschedule.`,
    )
  }

  /**
   * Fulfilment (invoice number, then the confirmation email) is idempotent —
   * each side effect is claimed with UPDATE ... WHERE <col> IS NULL — so it is
   * called whether or not this handler won the race. On the loser it no-ops,
   * and it is the safety net for a winner that crashed part-way through.
   *
   * The confirmation is withheld in the two cases where sending it would state
   * something untrue: the slot is not actually ours, or the gateway charged an
   * amount we did not price. The invoice and the owner alert still happen.
   */
  const hold = !outcome.ownsSlot
    ? { reason: `slot ${booking.slotId} was already sold to another paid booking` }
    : amountMismatch
      ? { reason: `gateway amount ${reportedPaise}p != booking ${booking.totalPaise}p` }
      : undefined

  await fulfilBooking(booking.id, { hold })
}

/**
 * payment.failed — mark the booking FAILED and hand the slot back.
 *
 * Both writes are conditional. A booking that is no longer PENDING is left
 * alone, and a slot is only released while it is still BOOKED: un-booking a
 * paid slot would double-sell a consultation.
 */
async function handleFailed(payment: PaymentEntity | undefined): Promise<void> {
  const orderId = payment?.order_id ?? null
  if (!orderId) {
    console.warn(`${LOG} ${EVENT_PAYMENT_FAILED} carried no order id; nothing to reconcile`)
    return
  }

  const booking = await prisma.booking.findUnique({
    where: { razorpayOrderId: orderId },
  })
  if (!booking) {
    console.warn(`${LOG} ${EVENT_PAYMENT_FAILED} for unknown order ${orderId}; ignoring`)
    return
  }

  const reason = payment?.error_description ?? payment?.error_code ?? null
  console.info(
    `${LOG} ${EVENT_PAYMENT_FAILED} booking=${booking.id} order=${orderId} reason=${reason ?? 'none given'}`,
  )

  const marked = await prisma.booking.updateMany({
    where: { razorpayOrderId: orderId, status: 'PENDING', paidAt: null },
    data: { status: 'FAILED' },
  })

  if (marked.count === 0) {
    console.info(
      `${LOG} booking=${booking.id} is no longer PENDING; leaving it and its slot untouched`,
    )
    return
  }

  /**
   * The slot is NOT released here, deliberately.
   *
   * payment.failed is not terminal for the order. Razorpay keeps the order
   * payable, and the customer is very often still sitting in the same Checkout
   * modal about to retry with a different method. Freeing the slot on the first
   * decline let a second customer buy it, and then the retry succeeded — two
   * paid bookings, one slot.
   *
   * Instead the hold simply stops being renewed: holdExpiresAt is left as it
   * was, so the slot returns to the market by itself once the window lapses
   * (see lockSlotForBooking). If the original order is captured after that, the
   * capture path re-acquires the slot and flags slotConflict rather than
   * double-booking. Nothing is stranded and nothing is oversold.
   */
  console.info(
    `${LOG} booking=${booking.id} marked FAILED; slot=${booking.slotId} left on its ` +
      `existing hold, which expires on its own (order may still be retried)`,
  )
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. The exact bytes Razorpay signed. Never request.json() here.
    const raw = await request.text()

    // 2. Signature. The only path that may answer non-2xx.
    const signature = request.headers.get(SIGNATURE_HEADER)
    if (!signature || !verifyWebhookSignature(raw, signature)) {
      console.warn(`${LOG} rejected: absent or invalid ${SIGNATURE_HEADER}`)
      return rejectUnsigned()
    }

    // 3. Only now is it safe to parse. Past this point the delivery is genuine,
    //    so every exit is a 200.
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      console.error(`${LOG} signed body is not valid JSON`, error)
      return ack('unparseable')
    }

    if (!isJsonObject(parsed)) {
      console.error(`${LOG} signed body is not a JSON object`)
      return ack('unparseable')
    }

    const view = webhookSchema.safeParse(parsed)
    if (!view.success) {
      console.error(`${LOG} signed body did not match the expected envelope`, view.error)
    }
    // Every field is optional, so an unrecognisable envelope degrades to "no
    // usable fields" rather than dropping a genuine delivery on the floor.
    const envelope: WebhookEnvelope = view.success ? view.data : {}
    const event = envelope.event ?? UNKNOWN_EVENT
    const payment = envelope.payload?.payment?.entity
    const order = envelope.payload?.order?.entity

    // 4. Idempotency. Razorpay retries, and the retry must be a no-op.
    const eventId = deriveEventId(
      request.headers.get(EVENT_ID_HEADER),
      event,
      payment,
      order,
      raw,
    )

    /**
     * The dedup claim is COMPLETION-based, not existence-based.
     *
     * The row is written before dispatch, so a delivery that was killed
     * mid-handler — a lambda timeout while Resend was slow, say — leaves a row
     * behind with processedAt still NULL. Treating the mere existence of that
     * row as "already seen" made Razorpay's retry a no-op and dropped the
     * event permanently: the booking never got its invoice or its confirmation,
     * and nothing else in the system would ever retry it.
     *
     * So a collision short-circuits ONLY when the earlier attempt actually
     * finished. Otherwise we fall through and run the handler again, which is
     * safe because every downstream write is a conditional claim
     * (UPDATE ... WHERE <col> IS NULL) and no-ops if it already happened.
     */
    try {
      await prisma.webhookEvent.create({
        data: { eventId, event, payload: toJsonColumn(parsed) },
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error

      const previous = await prisma.webhookEvent.findUnique({
        where: { eventId },
        select: { processedAt: true },
      })

      if (previous?.processedAt != null) {
        console.info(`${LOG} duplicate delivery ${eventId} (${event}); already processed`)
        return ack('duplicate')
      }

      console.warn(
        `${LOG} redelivery of ${eventId} (${event}) whose previous attempt never ` +
          `completed; reprocessing`,
      )
    }

    // 5. Dispatch. Unhandled events are recorded, acknowledged and dropped.
    switch (event) {
      case EVENT_PAYMENT_CAPTURED:
      case EVENT_ORDER_PAID:
        await handlePaid(event, payment, order)
        break
      case EVENT_PAYMENT_FAILED:
        await handleFailed(payment)
        break
      default:
        console.info(`${LOG} no handler for event ${event} (${eventId}); acknowledged`)
        break
    }

    // 6. Close the row out. A row left with processedAt NULL is the signal that
    //    a delivery arrived and its handler threw.
    await markProcessed(eventId)

    return ack('processed')
  } catch (error) {
    // The signature already proved this was Razorpay, so it still gets a 200 —
    // anything else costs the endpoint. Alert on this line.
    console.error(`${LOG} UNEXPECTED failure while handling a signed delivery`, error)
    return ack('error')
  }
}

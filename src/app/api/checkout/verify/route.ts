/**
 * The browser callback from Razorpay Checkout.
 *
 * This is the FAST path to a confirmed booking: the user is staring at a
 * spinner and the webhook may still be seconds away. It is not the AUTHORITATIVE
 * path — the webhook is, because it arrives even when the user closes the tab,
 * loses signal, or has an extension that eats the callback.
 *
 * So both paths do exactly the same two things, in the same way:
 *
 *   1. claim the PAID transition with one conditional write —
 *      UPDATE "Booking" SET status='PAID', paidAt=now() ... WHERE paidAt IS NULL
 *   2. call fulfilBooking(), which claims each side effect the same way.
 *
 * Whichever arrives second finds `count === 0` and does nothing. LOSING THAT
 * RACE IS A NORMAL 200. Reporting it as an error would mean telling a client
 * whose payment went through, whose slot is held and whose invoice is issued
 * that something went wrong.
 *
 * The signature is what makes any of this safe to act on. Everything in the
 * body is attacker-controllable, so nothing is written until
 * HMAC-SHA256("<order_id>|<payment_id>") verifies against the API key secret.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { fulfilBooking } from '@/lib/fulfilment'
import { prisma } from '@/lib/prisma'
import { verifyPaymentSignature } from '@/lib/razorpay'

/** node:crypto (through the razorpay adapter) and Prisma need the Node runtime. */
export const runtime = 'nodejs'
/** A payment callback must never be cached or statically evaluated. */
export const dynamic = 'force-dynamic'

const LOG = '[api:checkout:verify]'

/** Machine codes the booking form maps to copy from src/content/forms.ts. */
const CODE = {
  invalidBody: 'INVALID_BODY',
  validation: 'VALIDATION',
  signatureInvalid: 'SIGNATURE_INVALID',
  bookingNotFound: 'BOOKING_NOT_FOUND',
} as const

/**
 * Exactly the three fields Razorpay Checkout hands its `handler`, under their
 * own snake_case names, plus the booking id we issued so a mismatch is visible.
 * Strict, like every other input schema here: there is no amount in this body
 * and an unexpected key is an error rather than something to shrug at.
 */
const verifyInput = z
  .object({
    razorpay_order_id: z.string().trim().min(1).max(128),
    razorpay_payment_id: z.string().trim().min(1).max(128),
    razorpay_signature: z.string().trim().min(1).max(256),
    bookingId: z.string().trim().min(1).max(64).optional(),
  })
  .strict()

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: CODE.invalidBody }, { status: 400 })
  }

  const parsed = verifyInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: CODE.validation }, { status: 400 })
  }

  const orderId = parsed.data.razorpay_order_id
  const paymentId = parsed.data.razorpay_payment_id
  const signature = parsed.data.razorpay_signature

  // Nothing below this line runs on an unsigned payload.
  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    console.warn(`${LOG} rejected: bad signature for order=${orderId} payment=${paymentId}`)
    return NextResponse.json({ ok: false, code: CODE.signatureInvalid }, { status: 400 })
  }

  const booking = await prisma.booking.findUnique({
    where: { razorpayOrderId: orderId },
    select: { id: true, slotId: true },
  })
  if (booking === null) {
    console.error(`${LOG} verified signature for unknown order=${orderId}`)
    return NextResponse.json({ ok: false, code: CODE.bookingNotFound }, { status: 404 })
  }

  if (parsed.data.bookingId !== undefined && parsed.data.bookingId !== booking.id) {
    // Not fatal — the order id is the authority — but worth seeing in the logs.
    console.warn(
      `${LOG} booking id mismatch: body=${parsed.data.bookingId} order=${orderId} resolves to ${booking.id}`,
    )
  }

  /**
   * The same conditional claim the webhook makes. `count === 0` means the
   * webhook got here first, which changes nothing about the outcome.
   */
  let claimed = false
  try {
    const claim = await prisma.booking.updateMany({
      where: { razorpayOrderId: orderId, paidAt: null },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    })
    claimed = claim.count === 1
    console.info(
      claimed
        ? `${LOG} booking=${booking.id} claimed PAID transition`
        : `${LOG} booking=${booking.id} PAID already claimed (webhook won the race)`,
    )
  } catch (error) {
    /**
     * The signature proved the payment is genuine and the money has already
     * moved, so this is not the client's problem to solve on a confirmation
     * screen. It is logged for a human and left to the webhook, which retries
     * for hours. Alert on this line.
     */
    console.error(`${LOG} booking=${booking.id} PAID CLAIM FAILED after a valid signature`, error)
  }

  /**
   * Called whether or not this request won the claim: fulfilment is idempotent,
   * it no-ops for the loser, and it is the safety net for a winner that died
   * part-way through. It never throws.
   */
  await fulfilBooking(booking.id)

  return NextResponse.json(
    { ok: true, bookingId: booking.id, status: 'PAID', claimed },
    { status: 200 },
  )
}

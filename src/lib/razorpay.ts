/**
 * Razorpay gateway adapter.
 *
 * This module knows about orders, payments and signatures. NOTHING ELSE.
 * No Prisma, no bookings, no slots, no leads, no email — callers compose those
 * around it. Keeping it that narrow is what makes it safe to reuse from the
 * checkout route, the browser-callback route, the webhook and any admin action.
 *
 * MONEY: every amount here is an INTEGER NUMBER OF PAISE. Razorpay's own unit is
 * the currency subunit — paise for INR — so amounts pass straight through. There
 * is deliberately no `* 100` and no `/ 100` anywhere in this file, and there
 * never should be: one stray conversion here is a 100x overcharge in production.
 *
 * SERVER ONLY. It reads secrets from process.env and imports node:crypto, so it
 * must never be pulled into a client component. `getRazorpayKeyId()` exists so a
 * server component or route can hand the PUBLIC key id down to the browser.
 */

import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import Razorpay from 'razorpay'
import { assertPaise, type Paise } from '@/lib/money'

/** ISO 4217 code. Razorpay charges in the subunit of this currency, i.e. paise. */
const CURRENCY = 'INR'

/** Razorpay rejects a receipt longer than this. */
const RECEIPT_MAX_LENGTH = 40

const ENV_KEY_ID = 'RAZORPAY_KEY_ID'
/** Some deployments only publish the key id under the NEXT_PUBLIC_ name. */
const ENV_PUBLIC_KEY_ID = 'NEXT_PUBLIC_RAZORPAY_KEY_ID'
const ENV_KEY_SECRET = 'RAZORPAY_KEY_SECRET'
/**
 * A DIFFERENT secret from the API key secret. It is configured per webhook
 * endpoint in the Razorpay dashboard, and signing webhooks with the API key
 * secret is the single most common reason "every delivery fails verification".
 */
const ENV_WEBHOOK_SECRET = 'RAZORPAY_WEBHOOK_SECRET'

/** Reads an env var, treating unset, empty and whitespace-only as absent. */
function readEnv(name: string): string | null {
  const value = process.env[name]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * The SDK client is built lazily and memoised. Constructing it at module load
 * would throw during `next build` on any machine without the keys — including
 * CI and preview deploys — and take the whole build down with it.
 */
let cachedClient: Razorpay | null = null

function getClient(): Razorpay {
  if (cachedClient) return cachedClient

  const keyId = readEnv(ENV_KEY_ID) ?? readEnv(ENV_PUBLIC_KEY_ID)
  const keySecret = readEnv(ENV_KEY_SECRET)
  if (!keyId || !keySecret) {
    throw new Error(
      `Razorpay is not configured: ${ENV_KEY_ID} and ${ENV_KEY_SECRET} must both be set`,
    )
  }

  cachedClient = new Razorpay({ key_id: keyId, key_secret: keySecret })
  return cachedClient
}

/**
 * Constant-time comparison of two hex digests.
 *
 * node:crypto's timingSafeEqual THROWS when the buffers differ in length, so the
 * length is checked first — a signature of the wrong length is simply wrong, not
 * an exception. Comparing the hex text (utf8) rather than decoded bytes also
 * means a malformed hex string cannot silently collapse into a shorter buffer.
 */
function safeEqual(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'utf8')
  const provided = Buffer.from(providedHex.trim(), 'utf8')
  if (expected.length === 0 || provided.length === 0) return false
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

/**
 * Razorpay returns amounts as an integer number of paise, occasionally
 * JSON-encoded as a string. Parsed on an integer-only path — never parseFloat,
 * which would quietly introduce a binary float into a money value.
 */
function toIntegerPaise(value: number | string, label: string): Paise {
  if (typeof value === 'number') return assertPaise(value, label)
  const text = value.trim()
  if (!/^\d+$/.test(text)) {
    throw new Error(`${label} is not an integer number of paise: ${value}`)
  }
  return assertPaise(Number(text), label)
}

/** True when both halves of the API credential are present. */
export function isRazorpayConfigured(): boolean {
  const keyId = readEnv(ENV_KEY_ID) ?? readEnv(ENV_PUBLIC_KEY_ID)
  return keyId !== null && readEnv(ENV_KEY_SECRET) !== null
}

/**
 * The PUBLIC key id, safe to send to the browser for Razorpay Checkout.
 * Null when unconfigured, so the caller can degrade instead of crashing.
 */
export function getRazorpayKeyId(): string | null {
  return readEnv(ENV_KEY_ID) ?? readEnv(ENV_PUBLIC_KEY_ID)
}

/**
 * Creates a Razorpay order. `amountPaise` is sent verbatim as `amount`.
 * `receipt` is our own reference (the booking id); Razorpay caps it at 40 chars.
 */
export async function createOrder(input: {
  amountPaise: number
  receipt: string
  notes?: Record<string, string>
}): Promise<{ id: string; amountPaise: Paise; currency: string }> {
  const amountPaise = assertPaise(input.amountPaise, 'createOrder: amountPaise')
  if (amountPaise <= 0) {
    throw new Error('createOrder: amountPaise must be greater than zero')
  }

  const receipt = input.receipt.trim()
  if (receipt.length === 0) {
    throw new Error('createOrder: receipt is required')
  }
  if (receipt.length > RECEIPT_MAX_LENGTH) {
    throw new Error(
      `createOrder: receipt exceeds the Razorpay ${RECEIPT_MAX_LENGTH}-character limit: ${receipt}`,
    )
  }

  const order = await getClient().orders.create({
    // Paise in, paise out. Do not scale.
    amount: amountPaise,
    currency: CURRENCY,
    receipt,
    notes: input.notes,
  })

  return {
    id: order.id,
    amountPaise: toIntegerPaise(order.amount, 'createOrder: order.amount'),
    currency: order.currency.length > 0 ? order.currency : CURRENCY,
  }
}

/**
 * Verifies the signature the browser hands back from Razorpay Checkout:
 * HMAC-SHA256("<order_id>|<payment_id>") keyed with the API KEY SECRET.
 */
export function verifyPaymentSignature(input: {
  orderId: string
  paymentId: string
  signature: string
}): boolean {
  const secret = readEnv(ENV_KEY_SECRET)
  if (!secret) {
    console.error(
      `[razorpay] ${ENV_KEY_SECRET} is not set — every payment signature will be rejected`,
    )
    return false
  }
  if (input.orderId.length === 0 || input.paymentId.length === 0) return false

  const expected = createHmac('sha256', secret)
    .update(`${input.orderId}|${input.paymentId}`, 'utf8')
    .digest('hex')

  return safeEqual(expected, input.signature)
}

/**
 * Verifies a webhook delivery: HMAC-SHA256 over the EXACT raw request body,
 * keyed with the WEBHOOK secret (not the API key secret).
 *
 * `rawBody` must be the untouched string from `request.text()`. Re-serialising a
 * parsed object changes key order and whitespace, and every signature then fails.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = readEnv(ENV_WEBHOOK_SECRET)
  if (!secret) {
    console.error(
      `[razorpay] ${ENV_WEBHOOK_SECRET} is not set — every webhook delivery will be rejected`,
    )
    return false
  }

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  return safeEqual(expected, signature)
}

/** Fetches a payment from the gateway — the only trustworthy view of its state. */
export async function fetchPayment(paymentId: string) {
  return getClient().payments.fetch(paymentId)
}

/** Refunds a payment. Omit `amountPaise` for a full refund; it is paise, unscaled. */
export async function refundPayment(paymentId: string, amountPaise?: number) {
  if (amountPaise === undefined) {
    return getClient().payments.refund(paymentId, {})
  }

  const amount = assertPaise(amountPaise, 'refundPayment: amountPaise')
  if (amount <= 0) {
    throw new Error('refundPayment: amountPaise must be greater than zero')
  }
  return getClient().payments.refund(paymentId, { amount })
}

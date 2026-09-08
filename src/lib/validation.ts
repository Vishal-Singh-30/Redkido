/**
 * Request schemas for the two public funnels.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STRUCTURAL RULE — read this before adding a field.
 *
 * Neither schema has a price, amount, total, currency or GST field of any kind,
 * and both are `.strict()`, so an unexpected key is a validation ERROR rather
 * than a silently ignored one.
 *
 * The difference matters. A non-strict schema that "just ignores" an
 * `amountPaise` in the body is one careless refactor — one `...body` spread,
 * one `Object.assign`, one helpful `data: { ...parsed, ...body }` — away from
 * trusting a number the browser chose. Strict mode means that refactor cannot
 * quietly start working: the payload is rejected at the door and the attempt
 * shows up as a 400 in the logs instead of as a ₹1 booking.
 *
 * The server is the only thing that may ever know a price. It comes from
 * ConsultationType.pricePaise through src/lib/pricing.ts, never from a request
 * body. The compile-time assertions at the bottom of this file keep the
 * inferred types money-free.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every message here is read from src/content/forms.ts, so the schema and the
 * text rendered under the input are the same string, and neither this file nor
 * a form component owns a word of copy.
 */

import { z } from 'zod'
import { bookingForm, enquiryForm } from '@/content/forms'
import { GST_STATE_CODES, isValidGstin, normalizeGstin, normalizeStateCode } from '@/lib/tax'

const NAME_MIN = 2
const NAME_MAX = 120
const EMAIL_MAX = 254
const COMPANY_MAX = 120
const MESSAGE_MIN = 10
const MESSAGE_MAX = 4000
const HONEYPOT_MAX = 200
const ID_MAX = 64
const SLUG_MAX = 120

/** Digits, spaces and the usual dialling punctuation. Not an E.164 assertion. */
const PHONE_PATTERN = /^[0-9+\-()\s]{6,20}$/

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * An HTML form posts "" for an untouched optional input. Normalising it to
 * `undefined` keeps empty strings out of nullable columns, so "no company" is
 * NULL in the database rather than a blank the admin list has to special-case.
 */
function optionalText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, { error: tooLong })
    .optional()
    .transform((value) => (value === undefined || value.length === 0 ? undefined : value))
}

function nameField(copy: { required: string; tooShort: string; tooLong: string }) {
  return z
    .string()
    .trim()
    .min(1, { error: copy.required })
    .min(NAME_MIN, { error: copy.tooShort })
    .max(NAME_MAX, { error: copy.tooLong })
}

function emailField(copy: { required: string; invalid: string }) {
  // Trim and lower-case BEFORE the format check, so " You@Company.COM " is
  // accepted and stored canonically instead of failing on whitespace.
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(1, { error: copy.required })
    .max(EMAIL_MAX, { error: copy.invalid })
    .pipe(z.email({ error: copy.invalid }))
}

/**
 * Funnel 1 — the free enquiry.
 *
 * `website` is the honeypot. It is DECLARED here so `.strict()` accepts the key
 * the real form posts, but it is ENFORCED in the route, which answers a filled
 * honeypot with an ordinary-looking 200. Rejecting it in the schema would
 * return a 400 that tells the bot exactly which field is the trap, which is the
 * one thing a honeypot must never do.
 */
export const enquiryInput = z
  .object({
    name: nameField(enquiryForm.errors.name),
    email: emailField(enquiryForm.errors.email),
    /**
     * Emptied before it is validated, not after: an untouched optional input
     * posts "", and a regex that ran first would reject the blank the user
     * never filled in.
     */
    phone: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = (value ?? '').trim()
        return trimmed.length === 0 ? undefined : trimmed
      })
      .refine((value) => value === undefined || PHONE_PATTERN.test(value), {
        error: enquiryForm.errors.phone.invalid,
      }),
    company: optionalText(COMPANY_MAX, enquiryForm.errors.company.tooLong),
    message: z
      .string()
      .trim()
      .min(1, { error: enquiryForm.errors.message.required })
      .min(MESSAGE_MIN, { error: enquiryForm.errors.message.tooShort })
      .max(MESSAGE_MAX, { error: enquiryForm.errors.message.tooLong }),
    website: z.string().max(HONEYPOT_MAX).optional(),
    consent: z.literal(true),
  })
  .strict()

/**
 * Funnel 2 — the paid consultation.
 *
 * `consultationSlug` selects the catalogue row, and the price attached to that
 * row is resolved server-side by quoteConsultation(). `clientStateCode` and
 * `clientGstin` feed the place-of-supply rule (IGST Act s.12(2)), never the
 * amount: they decide whether the invoice carries CGST+SGST or IGST.
 *
 * The state stays OPTIONAL on the wire even though the form insists on it —
 * src/lib/tax.ts has a defined answer for "no address on record" (supplier
 * location), so a missing state produces a correct invoice rather than a 400.
 */
export const bookingInput = z
  .object({
    name: nameField(bookingForm.errors.name),
    email: emailField(bookingForm.errors.email),
    phone: z
      .string()
      .trim()
      .min(1, { error: bookingForm.errors.phone.required })
      .regex(PHONE_PATTERN, { error: bookingForm.errors.phone.invalid }),
    company: optionalText(COMPANY_MAX, bookingForm.errors.company.tooLong),
    slotId: z.string().trim().min(1, { error: bookingForm.errors.slot.required }).max(ID_MAX),
    consultationSlug: z
      .string()
      .trim()
      .min(1, { error: bookingForm.errors.consultationType.required })
      .max(SLUG_MAX)
      .regex(SLUG_PATTERN, { error: bookingForm.errors.consultationType.unavailable }),
    /**
     * Normalised to the canonical two-character code ("9" -> "09") and checked
     * against the real GST state list, so an unknown code is a visible error on
     * the form rather than a silent fall-through to the supplier's own state.
     */
    clientStateCode: z
      .string()
      .optional()
      // Blank means "not supplied". Anything else must survive validation as a
      // real state code — normalising FIRST would turn "XX" into null, which
      // then reads as "not supplied" and silently falls through to the
      // supplier's own state, putting the wrong head on a filed invoice.
      .transform((value) => {
        const trimmed = value?.trim()
        return trimmed === undefined || trimmed === '' ? undefined : trimmed
      })
      .refine(
        (value) => {
          if (value === undefined) return true
          const code = normalizeStateCode(value)
          return code !== null && code in GST_STATE_CODES
        },
        { error: bookingForm.errors.stateCode.invalid },
      )
      // Only now is it safe to canonicalise ("9" -> "09").
      .transform((value) => (value === undefined ? undefined : (normalizeStateCode(value) ?? undefined))),
    /**
     * Spaces and hyphens are stripped and the value upper-cased BEFORE
     * validation, so "22 aaaaa 0000 a1z5" is accepted and stored in the one
     * canonical form. isValidGstin() then checks the shape, the state code AND
     * the check digit — a transposed character that still "looks right" would
     * otherwise flip the tax head on a filed invoice.
     */
    clientGstin: z
      .string()
      .optional()
      // Same shape as clientStateCode: an unparseable GSTIN must be an error on
      // the form, not a silent downgrade to the unregistered-client path.
      .transform((value) => {
        const trimmed = value?.trim()
        if (trimmed === undefined || trimmed === '') return undefined
        return normalizeGstin(trimmed) ?? trimmed
      })
      .refine((value) => value === undefined || isValidGstin(value), {
        error: bookingForm.errors.gstin.invalid,
      }),
    message: optionalText(MESSAGE_MAX, bookingForm.errors.notes.tooLong),
  })
  .strict()
  /**
   * The first two characters of a GSTIN are the state of registration. If they
   * disagree with the state the client picked, one of the two is wrong and the
   * invoice would carry the wrong tax head — a filed mistake that costs a
   * credit note and a reissue. Refuse it rather than guess which one to trust.
   */
  .refine(
    (value) =>
      value.clientGstin === undefined ||
      value.clientStateCode === undefined ||
      value.clientGstin.slice(0, 2) === value.clientStateCode,
    { path: ['clientGstin'], error: bookingForm.errors.gstin.stateMismatch },
  )

export type EnquiryInput = z.infer<typeof enquiryInput>
export type BookingInput = z.infer<typeof bookingInput>

/** True when the honeypot was filled, i.e. the submitter is not a human. */
export function isHoneypotTripped(input: EnquiryInput): boolean {
  return (input.website ?? '').trim().length > 0
}

/** Issues with an empty path (cross-field refinements) are keyed under this. */
export const FORM_ERROR_KEY = '_form'

/** Field name -> message, the shape both forms render. */
export type FieldErrors = Record<string, string>

/**
 * Flattens a ZodError to one message per field. First issue wins: a field with
 * three problems shows the first, not a stack.
 */
export function toFieldErrors<T>(error: z.ZodError<T>): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : FORM_ERROR_KEY
    if (errors[key] === undefined) errors[key] = issue.message
  }
  return errors
}

/* ───────────────────────── compile-time money guard ─────────────────────────
 * If anyone ever adds a money-shaped key to either schema, these two lines stop
 * compiling. That is the point: the rule is enforced by the type system rather
 * than by a reviewer remembering to look for it.
 */
type MoneyKey =
  | 'amount'
  | 'amountPaise'
  | 'cgstPaise'
  | 'currency'
  | 'discount'
  | 'gst'
  | 'gstPaise'
  | 'igstPaise'
  | 'price'
  | 'pricePaise'
  | 'sgstPaise'
  | 'subtotal'
  | 'taxablePaise'
  | 'total'
  | 'totalPaise'

type MoneyFree<T> = [Extract<keyof T, MoneyKey>] extends [never] ? true : never

/** Exported so the assertions are load-bearing rather than dead locals. */
export const moneyFreeInputs = {
  enquiry: true satisfies MoneyFree<EnquiryInput>,
  booking: true satisfies MoneyFree<BookingInput>,
} as const

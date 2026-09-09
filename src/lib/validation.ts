/**
 * Request schemas for the two public funnels.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STRUCTURAL RULE — read this before adding a field.
 *
 * Both schemas are `.strict()`, so an unexpected key is a validation ERROR
 * rather than a silently ignored one.
 *
 * Nothing here is priced any more — the call is free, and there is no amount to
 * forge — but strictness is not only an anti-tampering measure. A non-strict
 * schema that "just ignores" the extra keys in a body is one careless refactor
 * — one `...body` spread, one `Object.assign`, one helpful
 * `data: { ...parsed, ...body }` — away from writing a column the browser
 * chose: a `status`, a `kind`, an `id`. Strict mode means that refactor cannot
 * quietly start working; the payload is rejected at the door and the attempt
 * shows up as a 400 in the logs.
 *
 * It also keeps the native, no-JavaScript form post honest. A browser submits
 * every named control in the form, so the form's field names and this schema's
 * keys are the same list or the post is a 400 — which is a much better failure
 * than an ignored field nobody notices.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every message here is read from src/content, so the schema and the text
 * rendered under the input are the same string, and neither this file nor a
 * form component owns a word of copy.
 */

import { z } from 'zod'
import { bookingContent } from '@/content/booking'
import { enquiryForm } from '@/content/forms'

const NAME_MIN = 2
const NAME_MAX = 120
const EMAIL_MAX = 254
const COMPANY_MAX = 120
const MESSAGE_MIN = 10
const MESSAGE_MAX = 4000
const HONEYPOT_MAX = 200
const ID_MAX = 64

/** Digits, spaces and the usual dialling punctuation. Not an E.164 assertion. */
const PHONE_PATTERN = /^[0-9+\-()\s]{6,20}$/

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
 * The honeypot. It is DECLARED so `.strict()` accepts the key the real form
 * posts, but it is ENFORCED in the route, which answers a filled honeypot with
 * an ordinary-looking success. Rejecting it here would return a 400 that tells
 * the bot exactly which field is the trap, which is the one thing a honeypot
 * must never do.
 */
const honeypotField = z.string().max(HONEYPOT_MAX).optional()

/**
 * Funnel 1 — the free enquiry. Unchanged: one Lead of kind ENQUIRY, no session.
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
    website: honeypotField,
    consent: z.literal(true),
  })
  .strict()

/**
 * Funnel 2 — booking a free call.
 *
 * `slotId` names a session an admin published; it is the ONLY thing the client
 * gets to say about when the call is. Every other property of that session —
 * its start, its end, whether it is still open — is read from the row inside
 * the booking transaction, so a stale or hand-edited id fails the lock rather
 * than moving the meeting.
 *
 * `message` is what the visitor wants looked at before the call. It is optional
 * on purpose: a required brief costs bookings, and the free call is the funnel.
 */
export const bookCallInput = z
  .object({
    name: nameField(bookingContent.errors.name),
    email: emailField(bookingContent.errors.email),
    phone: z
      .string()
      .trim()
      .min(1, { error: bookingContent.errors.phone.required })
      .regex(PHONE_PATTERN, { error: bookingContent.errors.phone.invalid }),
    company: optionalText(COMPANY_MAX, bookingContent.errors.company.tooLong),
    message: optionalText(MESSAGE_MAX, bookingContent.errors.message.tooLong),
    slotId: z
      .string()
      .trim()
      .min(1, { error: bookingContent.errors.slot.required })
      .max(ID_MAX, { error: bookingContent.errors.slot.unavailable }),
    website: honeypotField,
    consent: z.literal(true, { error: bookingContent.errors.consent.required }),
  })
  .strict()

export type EnquiryInput = z.infer<typeof enquiryInput>
export type BookCallInput = z.infer<typeof bookCallInput>

/** True when the honeypot was filled, i.e. the submitter is not a human. */
export function isHoneypotTripped(input: { readonly website?: string }): boolean {
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

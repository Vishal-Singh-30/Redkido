/**
 * Reschedule, refund and privacy copy shown at checkout and on the policy page.
 *
 * Consultations are RESCHEDULABLE, not refundable on demand. The notice window
 * and the reschedule cap are read from siteConfig.reschedule so the copy can
 * never drift from the rule the booking API enforces.
 */

import { siteConfig } from '@/config/site'

export type Policy = {
  readonly title: string
  readonly body: string
}

export type Policies = {
  readonly reschedule: Policy
  readonly refund: Policy
  readonly privacy: Policy
}

// Widened to `number` deliberately. siteConfig is `as const`, so these are the
// literal types 24 and 2, and TypeScript rejects a comparison against 1 as
// provably false — even though the pluralisation must stay correct if the
// config changes.
const minNoticeHours: number = siteConfig.reschedule.minNoticeHours
const maxReschedules: number = siteConfig.reschedule.maxReschedules

const hourWord = minNoticeHours === 1 ? 'hour' : 'hours'
const timeWord = maxReschedules === 1 ? 'once' : `up to ${maxReschedules} times`

export const policies: Policies = {
  reschedule: {
    title: 'Rescheduling',
    body: `Plans move. You can reschedule a booked consultation ${timeWord}, as long as you give us at least ${minNoticeHours} ${hourWord} notice before the start time. Use the reschedule link in your confirmation email, or reply to it and we will move you. Inside the ${minNoticeHours}-${hourWord} window the slot is held for you and cannot be moved — the time has already been blocked out and prepared for.`,
  },
  refund: {
    title: 'Refunds',
    body: `Consultation fees are not refundable on request. The fee pays for preparation and for a slot nobody else can take, and both are spent before you sit down. If something goes wrong on our side — we cannot make the call, or the session does not happen for a reason within our control — we refund you in full to the original payment method. Everything else is handled by rescheduling rather than a refund.`,
  },
  privacy: {
    title: 'Your details',
    body: `We collect your name, email, phone number and the state you are billed in. The state is required to work out place of supply for GST; the rest is how we reach you about the session. We do not sell your details, we do not add you to a marketing list without you asking, and we do not store card data — payments run through Razorpay and the card never touches our servers. Email ${siteConfig.contact.email} to have your record deleted.`,
  },
}

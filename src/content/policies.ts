/**
 * Reschedule, cancellation and privacy copy shown on the booking page.
 *
 * Booking a call is FREE, so there is no refund policy — there is nothing to
 * refund. What matters instead is the slot: it is time somebody blocked out and
 * prepared for, and it is time nobody else can take. The notice window and the
 * reschedule cap are read from siteConfig.reschedule so the copy can never
 * drift from the rule the booking API enforces.
 */

import { siteConfig } from '@/config/site'

export type Policy = {
  readonly title: string
  readonly body: string
}

export type Policies = {
  readonly reschedule: Policy
  readonly cancellation: Policy
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
    body: `Plans move. You can reschedule a booked call ${timeWord}, as long as you give us at least ${minNoticeHours} ${hourWord} notice before the start time. Reply to your confirmation email with two times that suit you and we will move you. Inside the ${minNoticeHours}-${hourWord} window the slot is held for you and cannot be moved — the time has already been blocked out and prepared for.`,
  },
  cancellation: {
    title: 'Cancelling',
    body: `The call is free, so there is nothing to refund and nothing to lose by cancelling — but the slot is real, and while it is yours nobody else can book it. If you cannot make it, reply to your confirmation email and tell us, ideally at least ${minNoticeHours} ${hourWord} beforehand, so the session goes back on the calendar for someone else. Not turning up is the only thing we would rather you did not do; you are welcome to book again afterwards either way.`,
  },
  privacy: {
    title: 'Your details',
    body: `We collect your name, email, phone number and whatever you tell us about the problem. That is how we reach you about the call and how we come prepared — nothing more. We do not sell your details and we do not add you to a marketing list without you asking. There is no payment anywhere on this site, so we never see or store card details. Email ${siteConfig.contact.email} to have your record deleted.`,
  },
}

/**
 * Every string either form can render: labels, placeholders, helper text,
 * button states, success screens and error messages.
 *
 * Components must not inline a single one of these. Validation messages live
 * here too so the zod schema and the rendered error read identically.
 *
 * Booking a call is FREE. Nothing in this file may name a price, a total, a tax
 * head or a billing address — there is no money in the model, so a label for it
 * would be a lie the form told.
 */

export type FormField = {
  readonly label: string
  readonly placeholder: string
  readonly helper?: string
  readonly optionalTag?: string
}

export type SubmitCopy = {
  readonly idle: string
  readonly pending: string
}

export type SuccessCopy = {
  readonly title: string
  readonly body: string
  readonly action?: string
}

// ---------------------------------------------------------------------------
// Enquiry form — the free "talk to us" funnel. Creates a Lead of kind ENQUIRY.
// ---------------------------------------------------------------------------

export const enquiryForm = {
  kicker: 'Talk to us',
  heading: 'Tell us what needs running.',
  sub: 'One form, one reply from a person, usually the same working day.',
  fields: {
    name: {
      label: 'Your name',
      placeholder: 'Aditi Nair',
    },
    email: {
      label: 'Work email',
      placeholder: 'you@company.com',
      helper: 'This is where the reply lands.',
    },
    phone: {
      label: 'Phone',
      placeholder: '+91 98765 43210',
      optionalTag: 'Optional',
      helper: 'Add it if you would rather we call or message on WhatsApp.',
    },
    company: {
      label: 'Company',
      placeholder: 'Brand or business name',
      optionalTag: 'Optional',
    },
    message: {
      label: 'What do you need help with?',
      placeholder:
        'Content is three weeks behind, ads are running with nobody watching them, and we have a launch in six weeks.',
      helper: 'Plain language is fine. The messier it is, the more useful it is to us.',
    },
  },
  consent:
    'We use your details only to reply to this enquiry. No lists, no sharing, no follow-up you did not ask for.',
  submit: {
    idle: 'Send enquiry',
    pending: 'Sending…',
  },
  success: {
    title: 'Got it.',
    body: 'Your enquiry is with the team. Expect a reply from a person, not an autoresponder, usually within one working day.',
    action: 'Send another enquiry',
  },
  errors: {
    name: {
      required: 'Please tell us your name.',
      tooShort: 'That looks too short to be a name.',
      tooLong: 'Please keep your name under 120 characters.',
    },
    email: {
      required: 'We need an email address to reply to.',
      invalid: 'That does not look like a valid email address.',
    },
    phone: {
      invalid: 'Please enter a valid phone number, including the country code.',
    },
    company: {
      tooLong: 'Please keep the company name under 120 characters.',
    },
    message: {
      required: 'Tell us a little about what needs running.',
      tooShort: 'A sentence or two helps us point you at the right person.',
      tooLong: 'Please keep this under 4,000 characters — you can send the rest on the call.',
    },
    form: {
      generic: 'Something went wrong sending that. Please try again.',
      network: 'We could not reach the server. Check your connection and try again.',
      rateLimited: 'That is a lot of enquiries from one place. Please wait a minute and try again.',
      validation: 'Please fix the highlighted fields and send again.',
    },
  },
} as const

// ---------------------------------------------------------------------------
// Booking form — the free "book a call" funnel. Creates a Lead of kind CALL
// plus a Booking against one admin-published session. No payment, no invoice.
// ---------------------------------------------------------------------------

export const bookingForm = {
  kicker: 'Book a call',
  heading: 'Pick a time that works. That is the whole thing.',
  sub: 'The call is free. Choose one of the open sessions, tell us who you are, and we will be there with the link.',
  steps: {
    slot: 'Choose a time',
    details: 'Your details',
    confirm: 'Confirm',
  },
  fields: {
    slot: {
      label: 'Session',
      placeholder: 'Select a time',
      helper: 'All times are shown in India Standard Time.',
    },
    name: {
      label: 'Full name',
      placeholder: 'Aditi Nair',
      helper: 'So we know who we are meeting.',
    },
    email: {
      label: 'Email',
      placeholder: 'you@company.com',
      helper: 'The confirmation and the meeting link go here.',
    },
    phone: {
      label: 'Phone',
      placeholder: '+91 98765 43210',
      helper: 'For the reminder and in case the call drops.',
    },
    company: {
      label: 'Company',
      placeholder: 'Brand or business name',
      optionalTag: 'Optional',
    },
    notes: {
      label: 'What should we look at before the call?',
      placeholder:
        'Links to your site, ad account access, the deck you already have — anything that saves us the first ten minutes.',
      optionalTag: 'Optional',
    },
  },
  /** The read-back shown before the visitor commits. Time and nothing else. */
  summary: {
    title: 'Your call',
    session: 'Session',
    duration: 'Duration',
    durationUnit: 'min',
    slot: 'Time',
    free: 'Free — there is nothing to pay.',
  },
  slotPicker: {
    heading: 'Available times',
    empty: 'No sessions are open right now. Send us an enquiry and we will open one.',
    loading: 'Loading available times…',
    timezoneNote: 'Times shown in India Standard Time (IST, UTC+5:30).',
    selectedLabel: 'Selected',
    changeLabel: 'Change time',
    /**
     * Two-step picker: a strip of days, then the sessions inside the chosen day.
     * The group labels are for screen readers — the chips and the day heading
     * already say the same thing to anyone who can see them.
     */
    dayGroupLabel: 'Choose a day',
    timeGroupLabel: 'Choose a time',
    dayEmpty: 'Nothing open on that day. Pick another one from the strip above.',
    /** Reads as "4 open" next to a day. Kept count-agnostic on purpose. */
    openLabel: 'open',
    /** Suffix on every time, so a session is never ambiguous about its zone. */
    zone: 'IST',
    formatTitle: 'How the call runs',
    /**
     * Deliberately says "video call" rather than naming the provider: whether a
     * Google Meet link can be minted depends on server configuration this
     * component cannot see. The confirmation email carries the real link.
     */
    format:
      'It runs as a video call. Your calendar invite and joining link arrive with the confirmation email.',
  },
  consent:
    'We use your details only to run this call and follow up on it. No lists, no sharing. If you need to move or cancel it, just reply to the confirmation email.',
  submit: {
    idle: 'Confirm booking',
    pending: 'Booking…',
  },
  submitting: {
    title: 'Confirming your booking',
    body: 'Do not close this tab. We are holding the session for you.',
  },
  success: {
    title: 'Booked.',
    body: 'The session is yours and the confirmation and meeting link are on their way to your inbox. If nothing arrives in ten minutes, check spam, then tell us.',
    action: 'Back to the site',
  },
  errors: {
    name: {
      required: 'Please tell us your name.',
      tooShort: 'That looks too short to be a name.',
      tooLong: 'Please keep your name under 120 characters.',
    },
    email: {
      required: 'We need an email to send the meeting link to.',
      invalid: 'That does not look like a valid email address.',
    },
    phone: {
      required: 'A phone number is required for the reminder.',
      invalid: 'Please enter a valid phone number, including the country code.',
    },
    company: {
      tooLong: 'Please keep the company name under 120 characters.',
    },
    slot: {
      required: 'Please choose a time.',
      taken: 'Someone just took that session. Pick another and it is yours.',
      past: 'That session has already started. Please pick a later time.',
      unavailable: 'That session is no longer open. Please pick another.',
    },
    notes: {
      tooLong: 'Please keep this under 4,000 characters.',
    },
    form: {
      generic: 'Something went wrong booking that. Please try again.',
      network: 'We could not reach the server. Check your connection and try again.',
      rateLimited: 'Too many attempts from one place. Please wait a minute and try again.',
      validation: 'Please fix the highlighted fields and try again.',
    },
  },
} as const

export type EnquiryForm = typeof enquiryForm
export type BookingForm = typeof bookingForm

/**
 * Every user-facing string in the free-call booking flow.
 *
 * /book, /book/success, the day-and-time picker, the details form and every
 * validation message src/lib/validation.ts renders all read from here, so a
 * component never owns a word of copy and the message under an input is the
 * same string the schema rejected with.
 *
 * ── THE ONE THING THIS COPY MUST SAY ────────────────────────────────────────
 * The call is FREE. It used to be a paid consultation with a price, an invoice
 * and a payment step, so a returning visitor arrives looking for the fee. It is
 * said in the badge above the heading, in the sub, in the assurances, next to
 * the submit button and on the confirmation — not because repetition is elegant
 * but because "is this the paid thing?" is the only question that stops someone
 * booking.
 *
 * Nothing here may mention a price, a fee, an amount, tax, an invoice or a
 * payment method. There is no such thing in this product any more.
 */

import { siteConfig } from '@/config/site'

/** Label, placeholder and helper text for one input. */
export type FormField = {
  readonly label: string
  readonly placeholder: string
  readonly helper?: string
  readonly optionalTag?: string
}

/** One reassurance tile under the heading. `icon` is a name from Icons.tsx. */
export type Assurance = {
  readonly icon: 'sparkle' | 'user' | 'video' | 'calendar' | 'clock'
  readonly title: string
  readonly body: string
}

export const bookingContent = {
  meta: {
    title: 'Book a free call',
    description:
      'Pick a time that suits you and talk to the Redkido team. The call is free — no card, no invoice, nothing to pay before or after.',
  },

  hero: {
    kicker: 'Book a call',
    /** The first thing on the page, and deliberately the loudest. */
    badge: 'Free — nothing to pay',
    heading: 'Book a call. It costs nothing.',
    sub: 'Pick a time that suits you, tell us what is going on, and we turn up having read it. No fee, no card, no obligation at the end of it.',
    assurances: [
      {
        icon: 'sparkle',
        title: 'Free, start to finish',
        body: 'There is nothing to pay before the call or after it. If we are not the right fit, we will say so on the call and point you somewhere better.',
      },
      {
        icon: 'user',
        title: 'The people who do the work',
        body: 'You are booking time with the team that would actually run this, not a sales desk reading from a script.',
      },
      {
        icon: 'video',
        title: 'On video, wherever you are',
        body: 'It runs as a video call. Your calendar invite and joining link arrive with the confirmation email.',
      },
    ] as readonly Assurance[],
  },

  picker: {
    heading: 'Pick a day and a time',
    /** Every time on this page is India Standard Time. Say so once, clearly. */
    timezoneNote: 'All times are India Standard Time (IST, UTC+5:30).',
    loading: 'Loading times…',
    empty: 'There are no sessions open at the moment. Send us an enquiry and we will open one for you.',
    emptyAction: 'Send an enquiry instead',
    /** Group labels for screen readers; the chips already say this visually. */
    dayGroupLabel: 'Choose a day',
    timeGroupLabel: 'Choose a time',
    dayEmpty: 'Nothing open on that day. Pick another one from the strip above.',
    dayFailed: 'We could not load that day. Pick it again, or choose another.',
    /** Reads as "4 open" next to a day. Count-agnostic on purpose. */
    openLabel: 'open',
    /** Suffix on every time, so no session is ever ambiguous about its zone. */
    zone: 'IST',
    selectedLabel: 'Your session',
    formatTitle: 'How the call runs',
    /**
     * Deliberately says "video call" rather than naming the provider: whether a
     * Google Meet link can be minted depends on server configuration this page
     * cannot see. The confirmation email carries the real link.
     */
    format:
      'It runs as a video call. Your calendar invite and joining link arrive with the confirmation email.',
    freeNote: 'The session is free. We will never ask you for card details.',
  },

  details: {
    heading: 'Your details',
    sub: 'So we know who is joining and what to read before we do.',
  },

  fields: {
    name: {
      label: 'Full name',
      placeholder: 'Aditi Nair',
    },
    email: {
      label: 'Email',
      placeholder: 'you@company.com',
      helper: 'The confirmation and the joining link go here.',
    },
    phone: {
      label: 'Phone',
      placeholder: '+91 98765 43210',
      helper: 'For the reminder, and in case the call drops.',
    },
    company: {
      label: 'Company',
      placeholder: 'Brand or business name',
      optionalTag: 'Optional',
    },
    message: {
      label: 'What should we look at before the call?',
      placeholder:
        'Links to your site, the ad account nobody is watching, the deck you already have — anything that saves us the first ten minutes.',
      optionalTag: 'Optional',
      helper: 'Plain language is fine. The messier it is, the more useful it is to us.',
    },
  } as Record<'name' | 'email' | 'phone' | 'company' | 'message', FormField>,

  consent:
    'We use your details only to run this call and follow up on it. No lists, no sharing, nothing you did not ask for.',

  submit: {
    idle: 'Confirm my free call',
    pending: 'Confirming…',
  },

  /**
   * Shown only when JavaScript is off AND the browser has already posted the
   * form natively — the picker and the form themselves work without JS, so this
   * is a fallback for the rare case where even that fails.
   */
  noscript: {
    title: 'JavaScript is off, and that is fine.',
    body: 'Pick a day, pick a time, fill the form and send it — it all works without JavaScript. If anything here refuses to, email us and we will book it by hand.',
    action: `Email ${siteConfig.contact.email}`,
    href: `mailto:${siteConfig.contact.email}`,
  },

  success: {
    kicker: 'Booked',
    title: 'You are booked.',
    body: 'Nothing is owed and nothing is due. The confirmation and the joining link are on their way to your inbox — if nothing arrives within ten minutes, check spam, then tell us.',
    whenLabel: 'Your call',
    nextTitle: 'What happens next',
    next: [
      'A calendar invite with the joining link lands in your inbox.',
      'We read whatever you sent us before we join.',
      'We spend the call on your situation, not on a deck.',
    ],
    rescheduleTitle: 'Need to move it?',
    rescheduleBody:
      'Reply to the confirmation email and we will find another time. As much notice as you can give us, please — somebody else can then have the slot.',
    action: 'Back to the site',
    /** Rendered when the confirmed time could not be read from the URL. */
    whenUnknown: 'The exact time is in your confirmation email.',
  },

  errors: {
    name: {
      required: 'Please tell us your name.',
      tooShort: 'That looks too short to be a name.',
      tooLong: 'Please keep your name under 120 characters.',
    },
    email: {
      required: 'We need an email to send the joining link to.',
      invalid: 'That does not look like a valid email address.',
    },
    phone: {
      required: 'A phone number is required for the reminder.',
      invalid: 'Please enter a valid phone number, including the country code.',
    },
    company: {
      tooLong: 'Please keep the company name under 120 characters.',
    },
    message: {
      tooLong: 'Please keep this under 4,000 characters — you can send the rest on the call.',
    },
    consent: {
      required: 'Please tick the box so we know we may contact you about this call.',
    },
    slot: {
      required: 'Please choose a day and a time.',
      taken: 'Somebody just took that time. Here is what is still open — pick another.',
      past: 'That time has already started. Please pick a later one.',
      unavailable: 'That session is no longer open. Please pick another.',
    },
    form: {
      generic: 'Something went wrong confirming that. Please try again.',
      network: 'We could not reach the server. Check your connection and try again.',
      rateLimited: 'That is a lot of attempts from one place. Please wait a minute and try again.',
      validation: 'Please fix the highlighted fields and try again.',
    },
  },
} as const

export type BookingContent = typeof bookingContent

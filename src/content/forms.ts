/**
 * Every string either form can render: labels, placeholders, helper text,
 * button states, success screens and error messages.
 *
 * Components must not inline a single one of these. Validation messages live
 * here too so the zod schema and the rendered error read identically.
 */

/** A GST state code and its name, for the place-of-supply dropdown. */
export type IndianState = {
  readonly code: string
  readonly name: string
}

/**
 * All 36 GST state/UT codes.
 *
 * 25 (Daman & Diu) and 28 (the pre-bifurcation Andhra Pradesh) are retired and
 * deliberately absent: Daman & Diu merged into 26, and 37 is the current Andhra
 * Pradesh code. `code` is the two-character string, not a number — leading
 * zeroes are significant and it is compared against Booking.placeOfSupplyStateCode.
 */
export const indianStates = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
] as const satisfies readonly IndianState[]

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
// Booking form — the paid consultation funnel. Creates a Lead of kind
// CONSULTATION plus a Booking, and hands off to Razorpay.
// ---------------------------------------------------------------------------

export const bookingForm = {
  kicker: 'Book a consultation',
  heading: 'Pick a slot, pay, and we come prepared.',
  sub: 'You are booking a specific hour of a specific person. That is why it is paid.',
  /** Back-link out of a single session's page to the full catalogue. */
  backToCatalogue: '← See all consultation types',
  steps: {
    type: 'Choose a session',
    slot: 'Choose a time',
    details: 'Your details',
    pay: 'Confirm & pay',
  },
  fields: {
    consultationType: {
      label: 'Session',
      placeholder: 'Select a session',
      helper: 'Longer sessions cover more of the funnel.',
    },
    slot: {
      label: 'Time slot',
      placeholder: 'Select a time',
      helper: 'All times are shown in India Standard Time.',
    },
    name: {
      label: 'Full name',
      placeholder: 'Aditi Nair',
      helper: 'This goes on the invoice, so use the name it should be issued to.',
    },
    email: {
      label: 'Email',
      placeholder: 'you@company.com',
      helper: 'Confirmation, invoice and the meeting link all go here.',
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
    stateCode: {
      label: 'Billing state',
      placeholder: 'Select your state',
      helper: 'Required to determine place of supply for GST.',
    },
    gstin: {
      label: 'GSTIN',
      placeholder: '22AAAAA0000A1Z5',
      optionalTag: 'Optional',
      helper: 'Add it if you want to claim input credit. We will put it on the invoice.',
    },
    notes: {
      label: 'What should we look at before the call?',
      placeholder:
        'Links to your site, ad account access, the deck you already have — anything that saves us the first ten minutes.',
      optionalTag: 'Optional',
    },
  },
  summary: {
    title: 'Order summary',
    session: 'Session',
    duration: 'Duration',
    durationUnit: 'min',
    slot: 'Slot',
    taxable: 'Taxable value',
    cgst: 'CGST',
    sgst: 'SGST',
    igst: 'IGST',
    total: 'Total payable',
    inclusiveNote: 'All prices are inclusive of GST.',
    sacNote: 'SAC',
    placeOfSupply: 'Place of supply',
  },
  slotPicker: {
    heading: 'Available times',
    empty: 'No slots open right now. Send us an enquiry and we will open one.',
    loading: 'Loading available times…',
    timezoneNote: 'Times shown in India Standard Time (IST, UTC+5:30).',
    selectedLabel: 'Selected',
    changeLabel: 'Change time',
    /**
     * Two-step picker: a strip of days, then the times inside the chosen day.
     * The group labels are for screen readers — the chips and the day heading
     * already say the same thing to anyone who can see them.
     */
    dayGroupLabel: 'Choose a day',
    timeGroupLabel: 'Choose a time',
    dayEmpty: 'Nothing open on that day. Pick another one from the strip above.',
    /** Reads as "4 open" next to a day. Kept count-agnostic on purpose. */
    openLabel: 'open',
    /** Suffix on every time, so a slot is never ambiguous about its zone. */
    zone: 'IST',
    formatTitle: 'How the session runs',
    /**
     * Deliberately says "video call" rather than naming the provider: whether a
     * Google Meet link can be minted depends on server configuration this
     * component cannot see. The confirmation email carries the real link.
     */
    format:
      'It runs as a video call. Your calendar invite and joining link arrive with the confirmation email.',
  },
  consent:
    'By paying you agree to the reschedule and refund policy below. Consultations can be rescheduled with notice; fees are not refundable on request.',
  submit: {
    idle: 'Pay and confirm booking',
    pending: 'Opening secure checkout…',
  },
  paying: {
    title: 'Completing your booking',
    body: 'Do not close this tab. We are confirming the payment and locking your slot.',
  },
  success: {
    title: 'Booked.',
    body: 'Your slot is held and the confirmation, invoice and meeting link are on their way to your inbox. If nothing arrives in ten minutes, check spam, then tell us.',
    action: 'Back to the site',
  },
  errors: {
    name: {
      required: 'Please enter the name this should be invoiced to.',
      tooShort: 'That looks too short to be a name.',
      tooLong: 'Please keep your name under 120 characters.',
    },
    email: {
      required: 'We need an email to send the invoice and meeting link to.',
      invalid: 'That does not look like a valid email address.',
    },
    phone: {
      required: 'A phone number is required for the reminder.',
      invalid: 'Please enter a valid phone number, including the country code.',
    },
    company: {
      tooLong: 'Please keep the company name under 120 characters.',
    },
    stateCode: {
      required: 'Please choose your billing state.',
      invalid: 'That is not a recognised GST state code.',
    },
    gstin: {
      invalid: 'That does not look like a valid 15-character GSTIN.',
      stateMismatch: 'The first two digits of the GSTIN do not match the state you selected.',
    },
    consultationType: {
      required: 'Please choose a session.',
      unavailable: 'That session is no longer available. Please pick another.',
    },
    slot: {
      required: 'Please choose a time slot.',
      taken: 'Someone just took that slot. Pick another and we will hold it for you.',
      past: 'That slot has already started. Please pick a later time.',
      unavailable: 'That slot is no longer open. Please pick another.',
    },
    notes: {
      tooLong: 'Please keep this under 4,000 characters.',
    },
    form: {
      generic: 'Something went wrong starting the booking. Please try again.',
      network: 'We could not reach the server. Check your connection and try again.',
      rateLimited: 'Too many attempts from one place. Please wait a minute and try again.',
      validation: 'Please fix the highlighted fields and try again.',
      checkoutUnavailable:
        'Our payment provider did not load. Disable your ad blocker for this page, or email us and we will send a payment link.',
      paymentCancelled: 'Payment was cancelled. Your slot is still open — try again when you are ready.',
      paymentFailed:
        'The payment did not go through. Nothing has been charged. Try again, or use a different method.',
      verificationFailed:
        'We could not verify that payment. If money left your account, email us with the payment reference and we will sort it out the same day.',
    },
  },
} as const

export type EnquiryForm = typeof enquiryForm
export type BookingForm = typeof bookingForm

/**
 * "In their words". Extracted verbatim from the source HTML.
 * `color` is a CSS colour value applied inline to the avatar, as in the source.
 */

export type Testimonial = {
  readonly quote: string
  readonly name: string
  readonly role: string
  readonly initials: string
  readonly color: string
}

export type Testimonials = {
  readonly kicker: string
  readonly heading: string
  readonly sub: string
  readonly items: readonly Testimonial[]
}

export const testimonials = {
  kicker: 'In their words',
  heading: "What it's like once Redkido takes over.",
  sub: 'A few notes from teams who used to run this themselves.',
  items: [
    {
      quote:
        'We had five different people posting, emailing, and messaging customers with no consistency. Redkido took it all under one calendar and one voice within three weeks.',
      name: 'Aditi Nair',
      role: 'Founder, homeware D2C brand',
      initials: 'AN',
      color: 'var(--red)',
    },
    {
      quote:
        'The automation setup alone paid for the retainer. Leads that used to sit for two days now get a WhatsApp reply in under ten minutes.',
      name: 'Rohan Sethi',
      role: 'Operations Head, real estate group',
      initials: 'RS',
      color: 'var(--amber)',
    },
    {
      quote:
        "We handed them our annual conference cold — venue, vendors, RSVPs, the works. First time in years I wasn't chasing caterers at midnight.",
      name: 'Priya Kulkarni',
      role: 'Marketing Lead, fintech startup',
      initials: 'PK',
      color: 'var(--red-deep)',
    },
  ],
} as const satisfies Testimonials

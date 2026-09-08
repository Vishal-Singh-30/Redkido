/**
 * FAQ accordion. Extracted verbatim from the source HTML.
 * The first item is open on load in the source markup.
 */

export type FaqItem = {
  readonly q: string
  readonly a: string
}

export type Faq = {
  readonly kicker: string
  readonly heading: string
  readonly sub: string
  readonly items: readonly FaqItem[]
}

export const faq = {
  kicker: 'FAQ',
  heading: 'Questions we get before signing.',
  sub: 'Still unsure about something? Just ask on the call.',
  items: [
    {
      q: 'Do we have to take all 11 services?',
      a: 'No. Most clients start with two or three functions — commonly content, social, and automation — and add more once the first ones are running smoothly.',
    },
    {
      q: 'How is this different from hiring separate freelancers?',
      a: 'One team, one account lead, one shared calendar. Your video editor, ad manager, and event coordinator are actually talking to each other instead of working off different briefs.',
    },
    {
      q: 'Can you take over an event with short notice?',
      a: "We've picked up event execution as close as three weeks out. Earlier is better, but we scope a rescue plan honestly if your timeline is tight.",
    },
    {
      q: 'Who owns the automation and CRM setup afterward?',
      a: 'You do. Everything we build — flows, sequences, dashboards — lives in your own tools, and workforce training is included so your team can run it independently.',
    },
    {
      q: 'How is pricing structured?',
      a: 'A monthly retainer scoped to the services and volume you need, agreed after the initial audit. No fixed packages — we quote against your actual workload.',
    },
    {
      q: 'How soon can we start?',
      a: 'Typically within two weeks of the strategy call — one week for the audit, one for the system design — then execution begins.',
    },
  ],
} as const satisfies Faq

/**
 * "Sound familiar?" section. Extracted verbatim from the source HTML.
 *
 * `icon` is a kebab-case key resolved by src/components/site/Icons.tsx.
 *
 * The event and messaging cards use the plain glyphs ('calendar-plain',
 * 'whatsapp-circle') rather than the richer services-grid variants, matching
 * the source markup exactly.
 */

export type ProblemCard = {
  readonly icon: string
  readonly text: string
}

export type Problems = {
  readonly kicker: string
  readonly heading: string
  readonly sub: string
  readonly cards: readonly ProblemCard[]
  readonly facts: readonly string[]
}

export const problems = {
  kicker: 'Sound familiar?',
  heading:
    "You know marketing needs to happen. You just don't have anyone who runs the whole thing.",
  sub: 'Most teams patch this together with freelancers, one-off agencies, and a founder checking Instagram DMs at 11pm.',
  cards: [
    {
      icon: 'clock',
      text: 'Your content calendar is three weeks behind and nobody actually owns it.',
    },
    {
      icon: 'chat',
      text: 'Leads come in through five channels, and follow-up happens... eventually.',
    },
    {
      icon: 'calendar-plain',
      text: 'Every event gets reinvented from scratch in a spreadsheet, two weeks out.',
    },
    {
      icon: 'chart',
      text: 'Ad spend is "doing okay" but nobody can tell you exactly why.',
    },
    {
      icon: 'whatsapp-circle',
      text: 'WhatsApp, email, and your landing page all say slightly different things.',
    },
    {
      icon: 'user',
      text: 'Your team knows the tools individually but not how to run them together.',
    },
  ],
  facts: [
    'No lock-in contracts',
    'One dedicated account team',
    'Monthly performance reporting',
    'Live within 2 weeks',
  ],
} as const satisfies Problems

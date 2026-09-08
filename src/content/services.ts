/**
 * "What we run" — the eleven services. Extracted verbatim from the source HTML.
 *
 * `icon` is a kebab-case key resolved by src/components/site/Icons.tsx.
 * `feature: true` marks the highlighted (gradient) card; only the first one has it.
 */

export type ServiceItem = {
  readonly icon: string
  readonly title: string
  readonly body: string
  readonly feature?: boolean
}

export type Services = {
  readonly kicker: string
  readonly heading: string
  readonly sub: string
  readonly items: readonly ServiceItem[]
}

export const services = {
  kicker: 'What we run',
  heading: 'Eleven functions. One accountable team.',
  sub: "Pick the whole stack or start with what's broken first — everything is built to plug into everything else.",
  items: [
    {
      icon: 'message-lines',
      title: 'Content Creation',
      body: 'Editorial calendars, copy, and creative built around what your audience actually engages with — not a stock template.',
      feature: true,
    },
    {
      icon: 'sparkle',
      title: 'Social Media Management',
      body: 'Daily posting, community replies, and platform strategy across Instagram, LinkedIn, and everywhere your customers scroll.',
    },
    {
      icon: 'video',
      title: 'Video Editing',
      body: "Reels, ads, testimonials, and long-form — cut, captioned, and formatted for the platform it's actually going on.",
    },
    {
      icon: 'calendar',
      title: 'Event Management & Curation',
      body: 'End-to-end: concept, vendors, guest experience, and on-ground execution for launches, activations, and brand events.',
    },
    {
      icon: 'trend-up',
      title: 'Performance Marketing',
      body: 'Paid media across Meta, Google, and programmatic — planned, run, and reported against actual revenue, not just clicks.',
    },
    {
      icon: 'users',
      title: 'Workforce Training',
      body: 'We train your in-house team on the tools and workflows we set up, so capability stays with you, not just with us.',
    },
    {
      icon: 'automation',
      title: 'Automation & Follow-up',
      body: 'Lead routing, CRM workflows, and follow-up sequences so no enquiry sits unanswered for three days.',
    },
    {
      icon: 'mail',
      title: 'Email Marketing',
      body: 'Lifecycle flows, newsletters, and campaigns that get opened — segmented by what people actually did, not just their name.',
    },
    {
      icon: 'whatsapp',
      title: 'WhatsApp Marketing',
      body: 'Broadcasts, catalog and order flows, and support — run on the channel your customers already have open all day.',
    },
    {
      icon: 'browser',
      title: 'Websites & Landing Pages',
      body: "Fast, conversion-built pages — for campaigns, product launches, or a full site rebuild that doesn't take six months.",
    },
    {
      icon: 'share',
      title: 'Influencer Marketing',
      body: 'Creator sourcing, briefing, negotiation, and reporting — matched to your category, not just follower count.',
    },
  ],
} as const satisfies Services

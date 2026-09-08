/**
 * Retainer engagements. Extracted verbatim from the source HTML.
 *
 * NOTE: `fee` here is marketing copy for the RETAINER tiers, which are quoted
 * per client and never transacted on the site. It is deliberately a string and
 * carries no amount. The only prices this app charges are the paid consultations
 * in src/content/consultations.ts, which are integer paise.
 */

import type { ButtonVariant } from './nav'

export type PricingCta = {
  readonly label: string
  readonly href: string
  readonly variant: ButtonVariant
}

export type PricingTier = {
  readonly name: string
  readonly desc: string
  readonly fee: string
  readonly features: readonly string[]
  readonly cta: PricingCta
  readonly popular?: boolean
  readonly popularTag?: string
}

export type Pricing = {
  readonly kicker: string
  readonly heading: string
  readonly sub: string
  readonly tiers: readonly PricingTier[]
}

export const pricing = {
  kicker: 'Engagements',
  heading: 'Start with one function, or hand over the whole stack.',
  sub: 'Every engagement is scoped to your team — these are starting points, not fixed packages.',
  tiers: [
    {
      name: 'Growth Sprint',
      desc: 'For one or two functions that need to get moving fast.',
      fee: 'Custom, scoped monthly',
      features: [
        'Choose 2 services from the stack',
        'Dedicated account lead',
        'Monthly performance review',
        '30-day onboarding',
      ],
      cta: { label: 'Talk to us', href: '#contact', variant: 'ghost' },
    },
    {
      name: 'Full-Stack Partner',
      desc: 'We run marketing and operations end to end, as your team.',
      fee: 'Custom, scoped monthly',
      features: [
        'All 11 services, integrated',
        'Automation & CRM setup included',
        'Weekly working sessions',
        'In-house team training included',
        'Priority event support',
      ],
      cta: { label: 'Book a strategy call', href: '#contact', variant: 'solid' },
      popular: true,
      popularTag: 'Most common',
    },
    {
      name: 'Enterprise',
      desc: 'Multi-location, multi-brand, or events-heavy operations.',
      fee: "Let's talk",
      features: [
        'Multiple brand or region pods',
        'Dedicated events unit',
        'Custom reporting & SLAs',
        'Quarterly leadership review',
      ],
      cta: { label: 'Talk to us', href: '#contact', variant: 'ghost' },
    },
  ],
} as const satisfies Pricing

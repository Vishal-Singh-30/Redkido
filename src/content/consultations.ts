/**
 * The paid consultation catalogue.
 *
 * This module is the AUTHORING source used to seed ConsultationType rows. Once
 * seeded, the database row is the only authority on price at checkout time —
 * see src/lib/pricing.ts. Never read a price from here inside a request handler,
 * and never accept one from a request body.
 *
 * Prices are authored with rupees() so they are unambiguous integer paise.
 * Advertised prices are tax-inclusive (siteConfig.tax.pricesIncludeTax); GST is
 * back-computed from the total, so these are the amounts the client actually pays.
 */

import { rupees, type Paise } from '@/lib/money'

export type ConsultationCatalogueItem = {
  readonly slug: string
  readonly name: string
  readonly summary: string
  readonly durationMins: number
  readonly pricePaise: Paise
  readonly sortOrder: number
}

export const consultationCatalogue: readonly ConsultationCatalogueItem[] = [
  {
    slug: 'discovery-call',
    name: 'Discovery Call',
    summary:
      'Thirty minutes to tell us what is actually broken. We listen, ask the awkward questions, and tell you honestly which function to fix first.',
    durationMins: 30,
    pricePaise: rupees(2500),
    sortOrder: 1,
  },
  {
    slug: 'strategy-deep-dive',
    name: 'Strategy Deep-Dive',
    summary:
      'An hour on one function — content, ads, automation, or an event you have to land. You leave with a sequenced plan and the numbers it has to hit.',
    durationMins: 60,
    pricePaise: rupees(6500),
    sortOrder: 2,
  },
  {
    slug: 'full-funnel-audit',
    name: 'Full-Funnel Audit',
    summary:
      'Ninety minutes across the whole stack. We map what is running, what is leaking, and what is missing, then hand you a written system design you can execute with or without us.',
    durationMins: 90,
    pricePaise: rupees(12500),
    sortOrder: 3,
  },
]

/** Marketing copy for the consultation index page. */
export const consultationsIntro = {
  kicker: 'Paid consultations',
  heading: 'Book time with the team that would run it.',
  sub: 'Not a sales call with a deck. Pick a length, pick a slot, pay, and we come prepared.',
} as const

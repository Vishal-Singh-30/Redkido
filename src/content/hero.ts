/**
 * Hero section copy. Extracted verbatim from the source HTML.
 *
 * `avatars[].color` is a CSS colour value (literal or var()) applied inline,
 * exactly as the original markup did.
 */

import type { ButtonVariant } from './nav'

export type HeroAction = {
  readonly label: string
  readonly href: string
  readonly variant: ButtonVariant
}

export type HeroAvatar = {
  readonly initials: string
  readonly color: string
}

export type Hero = {
  readonly eyebrow: string
  readonly headline: string
  readonly headlineAccent: string
  readonly lead: string
  readonly actions: readonly HeroAction[]
  readonly socialProof: string
  readonly avatars: readonly HeroAvatar[]
  readonly pills: readonly string[]
}

export const hero = {
  eyebrow: 'Now onboarding brands for Q4',
  headline: 'Run your entire marketing engine with ',
  headlineAccent: 'one accountable team.',
  lead: "Content, social, video, events, ads, automation, and more — Redkido replaces the eleven vendors you're juggling with one team that actually talks to itself.",
  actions: [
    { label: 'Book a strategy call', href: '#contact', variant: 'solid' },
    { label: 'See what we run', href: '#services', variant: 'ghost' },
  ],
  socialProof: '120+ brands are already running on Redkido.',
  avatars: [
    { initials: 'AN', color: '#e83d2c' },
    { initials: 'RS', color: 'var(--red-2)' },
    { initials: 'PK', color: 'var(--red-deep)' },
    { initials: 'HS', color: '#2a2a2f' },
  ],
  pills: [
    'Content Creation',
    'Social Media',
    'Video Editing',
    'Event Management',
    'Performance Marketing',
    'Workforce Training',
    'Automation',
    'Email & WhatsApp',
    'Websites',
    'Influencer Marketing',
  ],
} as const satisfies Hero

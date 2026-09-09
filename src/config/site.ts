/**
 * Single source of truth for identity, contact channels and booking policy.
 * No component may hardcode any of these values.
 */

/**
 * The site's absolute base URL. ALWAYS a valid, parseable URL.
 *
 * `process.env.NEXT_PUBLIC_SITE_URL ?? fallback` was wrong and broke the first
 * Vercel build. Next inlines NEXT_PUBLIC_* variables at build time, and an unset
 * one becomes the empty STRING rather than undefined — so `??` never fires,
 * layout.tsx evaluated `new URL('')`, and the build died at module load with
 * ERR_INVALID_URL before a single page was collected.
 *
 * So: treat empty and whitespace as absent, and fall back through Vercel's own
 * deployment URL before giving up on localhost. That means a fresh import with
 * no environment variables configured still builds AND still produces correct
 * absolute URLs in metadata and emails.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  // Vercel injects this for every deployment (host only, no protocol).
  const vercel =
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() || process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`

  return 'http://localhost:3000'
}

export const siteConfig = {
  name: 'Redkido',
  legalName: 'Redkido Consultancy',
  tagline: 'Marketing & operations, run end to end.',
  title: 'Redkido Consultancy — Marketing & Operations, End to End',
  description:
    'Redkido runs your content, social, video, events, performance marketing, automation and more — one accountable team, not eleven vendors.',

  url: resolveSiteUrl(),

  contact: {
    email: 'hello@redkido.com',
    // TODO(go-live): replace with the real number. Placeholder inherited from the
    // source HTML; wa.me needs a country-coded number with no +, spaces or dashes.
    whatsapp: '910000000000',
  },

  social: {
    // TODO(go-live): real handles. Empty strings render the icon without a link.
    instagram: '',
    linkedin: '',
  },

  /**
   * Booking a call is free, so there is nothing to refund — a booking is
   * either moved or cancelled. These two numbers are the rule the booking API
   * enforces AND the numbers content/policies.ts prints, so they can never
   * drift apart. See content/policies.ts.
   */
  reschedule: {
    minNoticeHours: 24,
    maxReschedules: 2,
  },
} as const

export type SiteConfig = typeof siteConfig

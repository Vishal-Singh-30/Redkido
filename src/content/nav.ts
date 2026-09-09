/**
 * Header navigation copy. Extracted verbatim from the source HTML.
 * No component may hardcode a label or an href.
 */

export type NavLink = {
  readonly label: string
  readonly href: string
}

export type ButtonVariant = 'solid' | 'ghost'

export type NavCta = {
  readonly label: string
  readonly href: string
  readonly variant: ButtonVariant
}

export const navLinks = [
  { label: 'Services', href: '#services' },
  { label: 'Portfolio', href: '#work' },
  { label: 'Founder', href: '#founder' },
  { label: 'Process', href: '#process' },
  { label: 'Engagements', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
] as const satisfies readonly NavLink[]

/**
 * "Talk to us" scrolls to the contact band on the home page; "Book a call" is a
 * route, not an anchor — it goes to the free booking page. Both are passed
 * through resolveSectionHref(), which leaves a non-hash href alone.
 */
export const navCtas = [
  { label: 'Talk to us', href: '#contact', variant: 'ghost' },
  { label: 'Book a call', href: '/book', variant: 'solid' },
] as const satisfies readonly NavCta[]

/** Accessible label for the mobile menu trigger. */
export const navMenuLabel = 'menu' as const

/** Brand wordmark rendered next to the logo dot. */
export const navBrandLabel = 'Redkido' as const

/** Anchor the logo links back to. */
export const navBrandHref = '#top' as const

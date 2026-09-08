/**
 * Final call-to-action band. Copy extracted verbatim from the source HTML;
 * the contact endpoints are read from siteConfig so there is exactly one
 * source of truth for the email address and the WhatsApp number.
 *
 * The third action (the paid consultation) is not in the source markup — it
 * was added deliberately during the conversion. It lives here rather than in
 * the component so that no user-facing string is hardcoded in JSX.
 */

import { siteConfig } from '@/config/site'
import type { ButtonVariant } from './nav'

export type CtaAction = {
  readonly label: string
  readonly href: string
  readonly variant: ButtonVariant
}

export type FinalCta = {
  readonly kicker: string
  readonly heading: string
  readonly body: string
  readonly actions: readonly CtaAction[]
}

export const finalCta: FinalCta = {
  kicker: "Let's talk",
  heading: "Let's build your growth engine.",
  body: "Bring us one broken function or your whole marketing operation — we'll tell you honestly where to start on the call.",
  actions: [
    {
      label: `Email ${siteConfig.contact.email}`,
      href: `mailto:${siteConfig.contact.email}`,
      variant: 'solid',
    },
    {
      label: 'Message us on WhatsApp',
      href: `https://wa.me/${siteConfig.contact.whatsapp}`,
      variant: 'ghost',
    },
    {
      label: 'Book a paid consultation',
      href: '/consultation',
      variant: 'ghost',
    },
  ],
}

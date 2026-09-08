/**
 * Footer copy. Extracted verbatim from the source HTML; contact endpoints and
 * the legal line are composed from siteConfig so identity lives in one place.
 *
 * `social[].icon` is a kebab-case key resolved by src/components/site/Icons.tsx.
 * `social[].href` is an empty string when the handle is not configured yet —
 * the component renders the icon without a link in that case.
 */

import { siteConfig } from '@/config/site'

export type FooterLink = {
  readonly label: string
  readonly href: string
}

export type FooterColumn = {
  readonly title: string
  readonly links: readonly FooterLink[]
}

export type FooterSocial = {
  readonly label: string
  readonly icon: string
  readonly href: string
}

export type Footer = {
  readonly blurb: string
  readonly columns: readonly FooterColumn[]
  readonly social: readonly FooterSocial[]
  readonly legal: readonly string[]
}

const copyrightYear = 2026

export const footer: Footer = {
  blurb:
    "End-to-end marketing and operations for brands that don't have time to manage eleven vendors.",
  columns: [
    {
      title: 'Services',
      links: [
        { label: 'Content & Social', href: '#services' },
        { label: 'Video & Events', href: '#services' },
        { label: 'Performance & Automation', href: '#services' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: "Founder's Note", href: '#founder' },
        { label: 'Process', href: '#process' },
        { label: 'Engagements', href: '#pricing' },
        { label: 'FAQ', href: '#faq' },
      ],
    },
    {
      title: 'Contact',
      links: [
        { label: siteConfig.contact.email, href: `mailto:${siteConfig.contact.email}` },
        { label: 'WhatsApp us', href: `https://wa.me/${siteConfig.contact.whatsapp}` },
      ],
    },
  ],
  social: [
    { label: 'Instagram', icon: 'instagram', href: siteConfig.social.instagram },
    { label: 'LinkedIn', icon: 'linkedin', href: siteConfig.social.linkedin },
    {
      label: 'WhatsApp',
      icon: 'whatsapp',
      href: `https://wa.me/${siteConfig.contact.whatsapp}`,
    },
  ],
  legal: [
    `© ${copyrightYear} ${siteConfig.legalName}. All rights reserved.`,
    siteConfig.tagline,
  ],
}

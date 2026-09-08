import type { ReactNode } from 'react'

import { siteConfig } from '@/config/site'
import { footer, type FooterColumn, type FooterSocial } from '@/content/footer'
import { FooterSectionLink } from '@/components/site/footer-links'
import { Reveal } from '@/components/motion/reveal'

/**
 * Contact endpoints resolve from siteConfig.contact, never from authored copy,
 * so the placeholder WhatsApp number has exactly one place to be fixed at
 * go-live. Content may author `mailto:{email}` / `https://wa.me/{whatsapp}`
 * or the composed value; either way the address written here is siteConfig's.
 */
function fillContactTokens(value: string): string {
  return value
    .split('{email}')
    .join(siteConfig.contact.email)
    .split('{whatsapp}')
    .join(siteConfig.contact.whatsapp)
}

function resolveContactHref(href: string): string {
  const filled = fillContactTokens(href)
  if (filled.startsWith('mailto:')) return `mailto:${siteConfig.contact.email}`
  if (filled.startsWith('whatsapp:') || /^https?:\/\/(www\.)?wa\.me\//.test(filled)) {
    return `https://wa.me/${siteConfig.contact.whatsapp}`
  }
  return filled
}

/* The footer glyphs are the source-HTML ones: 15px, stroked from `.foot-social svg`.
   They are kept local because the shared Icons map uses the key `whatsapp` for the
   solid problems glyph, which is a different drawing from this outlined bubble. */
function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="16.5" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function LinkedInGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 10.5v6M8 8v.01M12 16.5v-4a2 2 0 014 0v4M12 16.5v-6" />
    </svg>
  )
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3a9 9 0 100 18 9 9 0 004.5-1.2L21 21l-1.2-4.5A9 9 0 0012 3z" />
    </svg>
  )
}

const socialGlyphs: Record<string, ReactNode> = {
  instagram: <InstagramGlyph />,
  linkedin: <LinkedInGlyph />,
  whatsapp: <WhatsAppGlyph />,
  'whatsapp-social': <WhatsAppGlyph />,
}

/**
 * A channel with no configured handle renders its glyph with no <a> wrapper,
 * rather than a dead href="#".
 */
function SocialChannel({ channel }: { channel: FooterSocial }) {
  const glyph = socialGlyphs[channel.icon]
  if (glyph === undefined) return null

  const href = resolveContactHref(channel.href)
  if (href === '') {
    return (
      <span role="img" aria-label={channel.label}>
        {glyph}
      </span>
    )
  }

  return (
    <a href={href} aria-label={channel.label} target="_blank" rel="noreferrer">
      {glyph}
    </a>
  )
}

export function Footer() {
  const columns: readonly FooterColumn[] = footer.columns
  const social: readonly FooterSocial[] = footer.social
  const legal: readonly string[] = footer.legal

  return (
    <footer>
      <div className="wrap">
        <div className="foot-top">
          <Reveal as="div" className="foot-brand">
            <FooterSectionLink href="#top" className="logo">
              <span className="dot" />
              {siteConfig.name}
            </FooterSectionLink>
            <p>{footer.blurb}</p>
            <div className="foot-social">
              {social.map((channel) => (
                <SocialChannel channel={channel} key={channel.icon} />
              ))}
            </div>
          </Reveal>
          {columns.map((column, index) => (
            <Reveal as="div" className="foot-col" key={column.title} delay={80 + index * 70}>
              <h5>{column.title}</h5>
              {column.links.map((link) => (
                <FooterSectionLink
                  key={`${link.label}-${link.href}`}
                  href={resolveContactHref(link.href)}
                >
                  {fillContactTokens(link.label)}
                </FooterSectionLink>
              ))}
            </Reveal>
          ))}
        </div>
        <div className="foot-bottom">
          {legal.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </div>
    </footer>
  )
}

export default Footer

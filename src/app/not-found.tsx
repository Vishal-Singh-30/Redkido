import type { Metadata } from 'next'
import Link from 'next/link'

import { siteConfig } from '@/config/site'

/**
 * Copy for this route lives here rather than in src/content/* because the
 * content modules are owned by another workstream; keeping it in one exported
 * object still means no string is inlined in the markup below.
 */
const notFoundContent = {
  metaTitle: 'Page not found',
  kicker: '404',
  heading: 'That page has moved on.',
  body: 'The link is broken or the page no longer exists. Everything worth reading is still on the home page.',
  primaryCta: { label: 'Back to home', href: '/' },
  secondaryCta: { label: 'Email us', href: `mailto:${siteConfig.contact.email}` },
} as const

export const metadata: Metadata = {
  title: notFoundContent.metaTitle,
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main id="top">
      <section className="cta-final">
        <div className="wrap">
          <div className="cta-box">
            <div className="kicker">
              <span className="pulse" />
              {notFoundContent.kicker}
            </div>
            <h2>{notFoundContent.heading}</h2>
            <p>{notFoundContent.body}</p>
            <div className="cta-actions">
              <Link className="btn" href={notFoundContent.primaryCta.href}>
                {notFoundContent.primaryCta.label}
              </Link>
              <a className="btn btn-ghost" href={notFoundContent.secondaryCta.href}>
                {notFoundContent.secondaryCta.label}
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

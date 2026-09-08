'use client'

import { useEffect } from 'react'

import { siteConfig } from '@/config/site'

/**
 * Copy for this boundary lives here rather than in src/content/* because the
 * content modules are owned by another workstream; keeping it in one exported
 * object still means no string is inlined in the markup below.
 */
const errorContent = {
  kicker: 'Something broke',
  heading: 'We hit an error on our side.',
  body: 'The page failed to load. Try again — if it keeps happening, tell us and we will fix it.',
  retryLabel: 'Try again',
  contactLabel: 'Email us',
  digestLabel: 'Reference',
} as const

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main id="top">
      <section className="cta-final">
        <div className="wrap">
          <div className="cta-box">
            <div className="kicker">
              <span className="pulse" />
              {errorContent.kicker}
            </div>
            <h2>{errorContent.heading}</h2>
            <p>{errorContent.body}</p>
            <div className="cta-actions">
              <button type="button" className="btn" onClick={reset}>
                {errorContent.retryLabel}
              </button>
              <a className="btn btn-ghost" href={`mailto:${siteConfig.contact.email}`}>
                {errorContent.contactLabel}
              </a>
            </div>
            {error.digest ? (
              <p className="social-proof">
                {errorContent.digestLabel}: {error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

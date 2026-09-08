'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { resolveSectionHref } from '@/lib/section-nav'

/**
 * The one client island in the footer.
 *
 * The Services and Company columns point at sections of the home page. A bare
 * "#services" is correct on "/" and dead on every other route, so the href is
 * routed through resolveSectionHref() — which needs the pathname, which needs a
 * client component. Keeping it to this leaf leaves the rest of <Footer> server
 * rendered.
 *
 * Non-hash hrefs (mailto:, https://wa.me/…) pass through untouched and keep
 * rendering as a plain <a>.
 */
export function FooterSectionLink({
  href,
  className,
  children,
}: {
  readonly href: string
  readonly className?: string
  readonly children: ReactNode
}) {
  const pathname = usePathname()
  const resolved = resolveSectionHref(href, pathname)

  if (resolved !== href) {
    return (
      <Link href={resolved} className={className}>
        {children}
      </Link>
    )
  }

  return (
    <a href={resolved} className={className}>
      {children}
    </a>
  )
}

export default FooterSectionLink

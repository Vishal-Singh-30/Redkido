/**
 * The site's primary nav points at sections of the home page (#services, #work,
 * …). Those are correct on "/" and DEAD everywhere else: on /consultation or
 * /admin a bare "#services" resolves against the current path, matches no
 * element, and the click does nothing at all.
 *
 * Every nav surface therefore routes its hrefs through resolveSectionHref().
 */

/** "#services" on the home page, "/#services" anywhere else. Non-hash hrefs pass through. */
export function resolveSectionHref(href: string, pathname: string): string {
  if (!href.startsWith('#')) return href
  return pathname === '/' ? href : `/${href}`
}

/** True when the href targets a section of the home page rather than a route. */
export function isSectionHref(href: string): boolean {
  return href.startsWith('#')
}

/** "#services" -> "services" */
export function sectionIdOf(href: string): string | null {
  return href.startsWith('#') ? href.slice(1) : null
}

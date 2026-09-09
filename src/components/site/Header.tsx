'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Magnetic, magneticBtnClass } from '@/components/motion/magnetic'
import { navBrandHref, navBrandLabel, navCtas, navLinks, navMenuLabel } from '@/content/nav'
import { Icon } from '@/components/site/Icons'
import { resolveSectionHref, sectionIdOf } from '@/lib/section-nav'

/**
 * Sticky site header.
 *
 * Desktop (>860px) is the original markup, unchanged: .logo / .nav-links /
 * .nav-cta, all styled by the verbatim CSS in globals.css.
 *
 * Below 860px the original hid .nav-links and the ghost CTA and left .menu-btn
 * with no handler at all — mobile had no navigation. The panel below fixes
 * that: it is toggled by the hamburger, closes on link activation and on
 * Escape, and is wired with aria-expanded / aria-controls. It is painted with
 * the same design tokens (--bg, --line, --muted, --maxw) rather than new
 * colours, and it is never reachable on desktop because .menu-btn is
 * display:none there and any crossing of the breakpoint closes it.
 *
 * Three additive behaviours sit on top of that markup:
 *
 * 1. Section hrefs are routed through resolveSectionHref(). A bare "#services"
 *    is correct on "/" and dead on every other route — it resolves against the
 *    current path, matches nothing, and the click does nothing at all. Off the
 *    home page the href becomes "/#services" and is rendered with next/link so
 *    it is a client navigation rather than a full document reload.
 * 2. A single IntersectionObserver marks the nav link whose section is under
 *    the header with data-active="true". The underline it triggers is already
 *    styled in globals.css; this component only sets the attribute.
 * 3. Past ~40px of scroll the bar condenses by a few pixels and picks up a
 *    shadow. Both are inline styles that transition back to the stylesheet
 *    values, and the whole behaviour is skipped under prefers-reduced-motion,
 *    so a reduced-motion visitor sees exactly the original header.
 */

const PANEL_ID = 'site-mobile-menu'
const DESKTOP_QUERY = '(min-width: 861px)'
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** Section counts as active once it sits in the band under the header. */
const SPY_ROOT_MARGIN = '-40% 0px -55% 0px'

function btnClass(variant: string): string {
  return variant === 'ghost' ? 'btn btn-ghost' : 'btn'
}

type NavAnchorProps = {
  readonly href: string
  readonly pathname: string
  readonly className?: string
  readonly style?: CSSProperties
  readonly active?: boolean
  readonly onClick?: () => void
  readonly children: ReactNode
}

/**
 * One nav link. Renders a plain <a> when the href is already correct for the
 * current route (a hash on "/", or any non-hash href) and a <Link> when
 * resolveSectionHref had to rewrite it into a cross-route "/#section".
 */
function NavAnchor({ href, pathname, className, style, active, onClick, children }: NavAnchorProps) {
  const resolved = resolveSectionHref(href, pathname)
  const dataActive = active === undefined ? undefined : active ? 'true' : 'false'

  if (resolved !== href) {
    return (
      <Link
        href={resolved}
        className={className}
        style={style}
        data-active={dataActive}
        onClick={onClick}
      >
        {children}
      </Link>
    )
  }

  return (
    <a href={resolved} className={className} style={style} data-active={dataActive} onClick={onClick}>
      {children}
    </a>
  )
}

/**
 * The header has ONE appearance at every scroll position — see the header block
 * at the end of globals.css. It previously condensed on scroll from here as
 * well, via inline padding, which both fought the stylesheet (inline styles
 * win) and produced the thing the client objected to: a bar that presents
 * itself one way and then re-presents itself a moment later.
 *
 * The panel's shape now comes from the .nav-panel class so it matches the pill
 * above it; only its open/closed state is decided here.
 */
const panelBaseStyle: CSSProperties = {
  padding: '14px 22px 20px',
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: '0 0 18px',
  padding: 0,
}

const itemStyle: CSSProperties = {
  borderBottom: '1px solid var(--line)',
}

const linkStyle: CSSProperties = {
  display: 'block',
  padding: '14px 2px',
  fontSize: '14.5px',
  color: 'var(--muted)',
}

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const ctaStyle: CSSProperties = {
  justifyContent: 'center',
}

export function Header() {
  /**
   * Mobile panel open state.
   *
   */
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const sectionIds = useMemo(
    () => navLinks.map((link) => sectionIdOf(link.href)).filter((id): id is string => id !== null),
    [],
  )

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY)

    function onChange(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false)
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  /* Scroll-spy. One observer for every section named by navLinks; the topmost
     intersecting one wins so the order matches the nav itself. Home page only —
     the sections do not exist anywhere else. */
  useEffect(() => {
    if (pathname !== '/') {
      setActiveId(null)
      return
    }

    const targets = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)

    if (targets.length === 0) return

    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        setActiveId(sectionIds.find((id) => visible.has(id)) ?? null)
      },
      { rootMargin: SPY_ROOT_MARGIN, threshold: 0 },
    )

    for (const target of targets) observer.observe(target)
    return () => observer.disconnect()
  }, [pathname, sectionIds])


  return (
    <header>
      <nav>
        <NavAnchor href={navBrandHref} pathname={pathname} className="logo">
          <span className="dot" />
          {navBrandLabel}
        </NavAnchor>
        <div className="nav-links">
          {navLinks.map((link) => (
            <NavAnchor
              key={link.href}
              href={link.href}
              pathname={pathname}
              active={activeId !== null && sectionIdOf(link.href) === activeId}
            >
              {link.label}
            </NavAnchor>
          ))}
        </div>
        {/* Magnetism on the two CTAs only. The .nav-links row above is a dense
            row of text links; leaning those toward the cursor reads as broken
            rather than premium, so they are left exactly as they were. */}
        <div className="nav-cta">
          {navCtas.map((cta) => (
            <Magnetic key={`${cta.variant}-${cta.href}`} className={magneticBtnClass}>
              <NavAnchor href={cta.href} pathname={pathname} className={btnClass(cta.variant)}>
                {cta.label}
              </NavAnchor>
            </Magnetic>
          ))}
        </div>
        <button
          ref={buttonRef}
          type="button"
          className="menu-btn"
          aria-label={navMenuLabel}
          aria-expanded={open}
          aria-controls={PANEL_ID}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="menu" />
        </button>
      </nav>
      <div
        id={PANEL_ID}
        className="nav-panel"
        style={{ ...panelBaseStyle, display: open ? 'block' : 'none' }}
      >
        <ul style={listStyle}>
          {navLinks.map((link) => (
            <li key={link.href} style={itemStyle}>
              <NavAnchor href={link.href} pathname={pathname} style={linkStyle} onClick={close}>
                {link.label}
              </NavAnchor>
            </li>
          ))}
        </ul>
        <div style={ctaRowStyle}>
          {navCtas.map((cta) => (
            <NavAnchor
              key={`${cta.variant}-${cta.href}`}
              href={cta.href}
              pathname={pathname}
              className={btnClass(cta.variant)}
              style={ctaStyle}
              onClick={close}
            >
              {cta.label}
            </NavAnchor>
          ))}
        </div>
      </div>
    </header>
  )
}

export default Header

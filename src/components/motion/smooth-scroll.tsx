'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Lenis from 'lenis'

/**
 * Site-wide inertial scrolling.
 *
 * Lenis drives the *real* scroll position (it calls window.scrollTo under the
 * hood rather than transforming a container), so nothing about the document
 * changes: the sticky header, position:fixed layers, IntersectionObserver
 * reveals and the browser's own scrollbar all keep working, and the page still
 * scrolls perfectly with this component removed.
 *
 * It is opt-in at runtime, never at build time:
 *   - JS off            -> no Lenis, native scrolling, `scroll-behavior:smooth`
 *                          from globals.css still handles anchors.
 *   - reduced motion    -> not started at all (and torn down if the setting is
 *                          flipped while the page is open).
 *   - touch / coarse    -> not started. Native momentum on a phone is better
 *                          than anything a rAF loop can fake, and syncTouch is
 *                          the single most common cause of "the site feels
 *                          broken on mobile".
 *
 * The CSS half of this lives in the smooth-scroll block at the end of
 * globals.css and is scoped to `html.lenis`, a class Lenis itself sets on the
 * root element — so with JS off none of it applies.
 */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Touch-primary devices only. A laptop with a touchscreen reports
 * `maxTouchPoints > 0` but still has a fine pointer and a wheel, and should
 * keep the smoothing; `hover:none` / `pointer:coarse` describe the *primary*
 * input, which is what we actually care about.
 */
const TOUCH_QUERY = '(hover: none), (pointer: coarse)'

/** Weighted, not floaty. Below ~0.08 it drifts; above ~0.14 it may as well be native. */
const LERP = 0.1

/** Lenis' documented default: exponential ease-out, no overshoot. */
const EASE_OUT_EXPO = (t: number): number => Math.min(1, 1.001 - Math.pow(2, -10 * t))

/** Seconds. Long enough to read as deliberate, short enough not to feel slow. */
const ANCHOR_DURATION = 1

/**
 * Resolves the hash an anchor should scroll to, or null when the click is not
 * ours to handle.
 *
 * "#services" is the home-page form. "/#services" is what the nav and footer
 * render on other routes (see lib/section-nav) — on "/" it is still an in-page
 * jump, everywhere else it is a real route change and must be left alone.
 */
function inPageHash(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute('href')
  if (href === null) return null
  if (href.startsWith('#')) return href.length > 1 ? href : null
  if (href.startsWith('/#') && window.location.pathname === '/') {
    return href.length > 2 ? href.slice(1) : null
  }
  return null
}

/** getElementById rather than querySelector: ids like "2024" are legal but not valid selectors. */
function targetOf(hash: string): HTMLElement | null {
  return document.getElementById(decodeURIComponent(hash.slice(1)))
}

/**
 * Where a native anchor jump would put `el`, in absolute scroll units.
 *
 * Deliberately mirrors Lenis' own maths (see scrollTo in the package): both
 * `scroll-margin-top` on the target and `scroll-padding-top` on the scrollport
 * apply, exactly as the CSSOM spec has the browser apply them. globals.css sets
 * both to `calc(var(--header-h) + 16px)`, which is why this component passes NO
 * extra offset to scrollTo — Lenis already reads those two properties off the
 * DOM, and adding a hard-coded -94 on top would land every section a full
 * header lower than a native jump does.
 */
function nativeLanding(el: HTMLElement): number {
  const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop)
  const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
  return (
    el.getBoundingClientRect().top +
    window.scrollY -
    (Number.isNaN(margin) ? 0 : margin) -
    (Number.isNaN(padding) ? 0 : padding)
  )
}

/**
 * Preventing the default on a hash click also cancels the focus move the
 * browser would have made, which silently breaks skip links and drops keyboard
 * users back at the top of the tab order. Do it by hand instead.
 *
 * `preventScroll` stops focus() from undoing the smooth scroll we just started,
 * and a tabindex we added is removed again on blur so no permanent focus target
 * is left behind in the DOM.
 */
function focusTarget(el: HTMLElement): void {
  const hadTabIndex = el.hasAttribute('tabindex')
  if (!hadTabIndex) {
    el.setAttribute('tabindex', '-1')
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true })
  }
  el.focus({ preventScroll: true })
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reducedQuery = window.matchMedia(REDUCED_QUERY)
    const touchQuery = window.matchMedia(TOUCH_QUERY)

    let lenis: Lenis | null = null
    let rafId = 0

    /* ------------------------------------------------------------------ *
     * Keeping motion's useScroll in sync.
     *
     * The reading-progress bar and the process rail both measure the real
     * scrollTop on a native `scroll` event. Lenis writes that same scrollTop
     * every frame, so the browser fires those events and both hooks track
     * unchanged — this is a guard, not a workaround. If a frame ever moves the
     * page without a trusted scroll event behind it, we re-emit one so neither
     * indicator can freeze. In the healthy case it never fires.
     * ------------------------------------------------------------------ */
    let sawTrustedScroll = false
    let lastForwarded = -1

    const markTrustedScroll = (event: Event) => {
      // Our own synthetic event is untrusted, so it cannot mask a real gap.
      if (event.isTrusted) sawTrustedScroll = true
    }

    const forwardScroll = () => {
      const y = window.scrollY
      if (y === lastForwarded) return
      lastForwarded = y
      if (sawTrustedScroll) {
        sawTrustedScroll = false
        return
      }
      window.dispatchEvent(new Event('scroll'))
    }

    /* ------------------------------------------------------------------ *
     * Anchor navigation.
     *
     * Lenis owns the scroll position, so a native hash jump would fight it:
     * the browser teleports, Lenis animates back. We take the click instead.
     * Lenis' built-in `anchors` option is not used because it does not
     * preventDefault, which leaves exactly that fight in place.
     * ------------------------------------------------------------------ */
    const onDocumentClick = (event: MouseEvent) => {
      if (!lenis || event.defaultPrevented) return
      // Modified clicks open in a new tab/window — never hijack those.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target !== '' && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const hash = inPageHash(anchor)
      if (hash === null) return

      const target = targetOf(hash)
      // "#top" with no matching element still means the top of the document.
      if (target === null && hash !== '#top') return

      event.preventDefault()
      lenis.scrollTo(target ?? 0, {
        duration: ANCHOR_DURATION,
        easing: EASE_OUT_EXPO,
      })
      if (target !== null) focusTarget(target)

      // The URL stays shareable and the entry stays in the back stack, exactly
      // as a native anchor click would leave it. Next patches pushState to keep
      // usePathname in sync; for a hash-only change that is a URL update and
      // nothing else — no refetch, no scroll of its own.
      if (window.location.hash !== hash) {
        window.history.pushState(null, '', hash)
      }
    }

    /**
     * A page opened straight at /#pricing has already been positioned by the
     * browser before hydration. Re-assert it once Lenis has measured, but only
     * if we are actually off the mark — otherwise this is a no-op.
     */
    const alignToHash = () => {
      const hash = window.location.hash
      if (hash.length < 2) return
      const target = targetOf(hash)
      if (target === null) return

      // Two frames: after the browser's own jump and after Lenis' first measure.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!lenis) return
          if (Math.abs(window.scrollY - nativeLanding(target)) < 2) return
          lenis.scrollTo(target, { immediate: true, force: true })
        })
      })
    }

    const start = () => {
      if (lenis || reducedQuery.matches || touchQuery.matches) return

      lenis = new Lenis({
        lerp: LERP,
        wheelMultiplier: 1,
        smoothWheel: true,
        // Touch is native, always. This component is not even started on a
        // touch-primary device; this is the belt to that pair of braces.
        syncTouch: false,
        touchMultiplier: 1,
        gestureOrientation: 'vertical',
        // A scrollable panel under the cursor (admin tables, an overflowing
        // dialog) keeps scrolling itself rather than dragging the page.
        allowNestedScroll: true,
        // Clicking through to another route drops any leftover inertia, so the
        // new page does not inherit a glide.
        stopInertiaOnNavigate: true,
        // We handle anchors ourselves — Lenis' version does not preventDefault.
        anchors: false,
        // Driven from our own loop below so teardown is deterministic.
        autoRaf: false,
      })

      const loop = (time: number) => {
        lenis?.raf(time)
        rafId = window.requestAnimationFrame(loop)
      }
      rafId = window.requestAnimationFrame(loop)

      lenis.on('scroll', forwardScroll)
      window.addEventListener('scroll', markTrustedScroll, { passive: true, capture: true })
      document.addEventListener('click', onDocumentClick)

      alignToHash()
    }

    const stop = () => {
      if (!lenis) return
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('click', onDocumentClick)
      window.removeEventListener('scroll', markTrustedScroll, { capture: true })
      lenis.destroy()
      lenis = null
      sawTrustedScroll = false
      lastForwarded = -1
    }

    // Reduced motion can be switched on with the page open; honour it live.
    const sync = () => {
      if (reducedQuery.matches || touchQuery.matches) stop()
      else start()
    }

    start()
    reducedQuery.addEventListener('change', sync)
    touchQuery.addEventListener('change', sync)

    return () => {
      reducedQuery.removeEventListener('change', sync)
      touchQuery.removeEventListener('change', sync)
      stop()
    }
  }, [])

  return <>{children}</>
}

export default SmoothScroll

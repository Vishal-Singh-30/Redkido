'use client'

import { useEffect } from 'react'

/**
 * Opts the document into the enhancement layer.
 *
 * The reveal styles in globals.css are scoped to html[data-motion="on"], which
 * this sets on mount. That ordering matters: the "before" state of a reveal is
 * opacity:0, so gating it behind a JS-set attribute means a visitor with JS
 * disabled — or a crawler — gets the fully visible page rather than a blank one.
 */
export function MotionRoot() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    document.documentElement.setAttribute('data-motion', 'on')
    return () => document.documentElement.removeAttribute('data-motion')
  }, [])

  return null
}

export default MotionRoot

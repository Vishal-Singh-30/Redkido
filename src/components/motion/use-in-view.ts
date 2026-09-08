'use client'

import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Is this element near the viewport?
 *
 * Unlike <Reveal>, which latches on once and stops observing, this keeps
 * reporting — because callers use it to MOUNT and UNMOUNT expensive things,
 * not just to reveal them.
 *
 * The specific expensive thing here is a WebGL context. Every <Canvas> is a
 * separate WebGLRenderer with its own GL context, its own render loop and its
 * own textures. Four of them live at once (as the home page briefly had) will
 * saturate the GPU on ordinary hardware, and the first casualty is whichever
 * effect is subtlest — which looked, from the outside, like the hero being
 * "broken". Mounting only what is on screen keeps that to one or two.
 *
 * `margin` deliberately extends beyond the viewport so a canvas has time to
 * initialise and composite its textures before it is scrolled into view.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { margin = '400px', once = false }: { margin?: string; once?: boolean } = {},
): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // No IntersectionObserver: assume visible rather than never rendering.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin: margin },
    )

    io.observe(el)
    return () => io.disconnect()
  }, [ref, margin, once])

  return inView
}

/**
 * False while the tab is hidden.
 *
 * A backgrounded tab keeps servicing requestAnimationFrame in some browsers and
 * throttles it in others; either way, rendering a decorative canvas nobody is
 * looking at is wasted battery.
 */
export function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    onChange()
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return visible
}

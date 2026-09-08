'use client'

import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Magnetic CTA wrapper.
 *
 * The child leans a fraction of the way toward the cursor once the pointer is
 * within a short radius of its box, and eases back when the pointer leaves.
 * It is a WRAPPER, never a replacement: the child stays whatever element it
 * already was — a real <a> with its href, a real <button> — keeping its
 * classes, its focus ring and its own :hover rule.
 *
 * Two deliberate choices:
 *
 * 1. The offset is written to the CSS `translate` property, not `transform`.
 *    That leaves `transform` and `scale` free for the hover treatment on the
 *    same element (and for anything an ancestor animates), so nothing has to
 *    read or re-compose a matrix.
 * 2. It is completely inert when (pointer: coarse) matches or the visitor has
 *    asked for reduced motion — no listeners are attached at all. A magnetic
 *    button on a touchscreen is just a button that lags, and with JS off the
 *    wrapper is an ordinary inline-flex span around the same markup.
 */

/** How far outside the element's bounds the pull starts, in px. */
const DEFAULT_RADIUS = 90

/** Fraction of the cursor offset the child actually travels. */
const DEFAULT_STRENGTH = 0.3

/** Hard cap on the travel, in px, on either axis. */
const DEFAULT_MAX = 10

const PULL_EASE = 'translate .12s cubic-bezier(.22,.61,.36,1)'
const RELEASE_EASE = 'translate .5s cubic-bezier(.34,1.42,.64,1)'

type MagneticProps = {
  readonly children: ReactNode
  /** Applied to the wrapper span, not the child. */
  readonly className?: string
  /** Applied to the wrapper span, not the child. */
  readonly style?: CSSProperties
  readonly radius?: number
  readonly strength?: number
  readonly max?: number
}

function clamp(value: number, limit: number): number {
  if (value > limit) return limit
  if (value < -limit) return -limit
  return value
}

export function Magnetic({
  children,
  className,
  style,
  radius = DEFAULT_RADIUS,
  strength = DEFAULT_STRENGTH,
  max = DEFAULT_MAX,
}: MagneticProps) {
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof window.matchMedia !== 'function') return
    if (window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let pointerX = 0
    let pointerY = 0
    let engaged = false

    function release() {
      if (!el) return
      engaged = false
      el.style.transition = RELEASE_EASE
      el.style.translate = ''
    }

    function apply() {
      frame = 0
      if (!el) return

      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return

      const dx = pointerX - (rect.left + rect.width / 2)
      const dy = pointerY - (rect.top + rect.height / 2)

      // Distance from the element's edge, so the radius is measured from the
      // box and a wide button is not harder to reach than a narrow one.
      const outX = Math.max(Math.abs(dx) - rect.width / 2, 0)
      const outY = Math.max(Math.abs(dy) - rect.height / 2, 0)

      if (Math.hypot(outX, outY) > radius) {
        if (engaged) release()
        return
      }

      engaged = true
      el.style.transition = PULL_EASE
      el.style.translate = `${clamp(dx * strength, max).toFixed(2)}px ${clamp(dy * strength, max).toFixed(2)}px`
    }

    function onPointerMove(event: PointerEvent) {
      pointerX = event.clientX
      pointerY = event.clientY
      if (frame !== 0) return
      frame = window.requestAnimationFrame(apply)
    }

    function onLeave() {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
      if (engaged) release()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      if (frame !== 0) window.cancelAnimationFrame(frame)
      el.style.transition = ''
      el.style.translate = ''
    }
  }, [radius, strength, max])

  return (
    <span ref={ref} data-magnetic="" className={className} style={style}>
      {children}
    </span>
  )
}

/**
 * The considered hover for a .btn, applied to the Magnetic wrapper so it
 * complements the stylesheet's own .btn:hover (which lifts the button 2px)
 * instead of overwriting its transform: a slight scale via the standalone
 * `scale` property and a softer, larger shadow clipped to the pill radius.
 * Motion-safe so a reduced-motion visitor keeps the authored button exactly.
 */
export const magneticBtnClass =
  'inline-flex rounded-full transition-[scale,box-shadow] duration-[220ms] ease-out ' +
  'motion-safe:hover:scale-[1.02] hover:shadow-[0_18px_40px_-18px_rgba(17,17,17,.35)]'

export default Magnetic

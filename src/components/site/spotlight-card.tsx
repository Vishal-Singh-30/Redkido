'use client'

import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * A card that both reveals on scroll and carries the cursor spotlight.
 *
 * It renders ONE element and puts the caller's class on it — the same contract
 * as <Reveal> — because these cards are grid items: an extra wrapper div would
 * become the grid item and the card would stop stretching to the row height.
 * That is why the reveal here is inlined rather than nesting <Reveal>: the
 * spotlight needs a ref to the very element that also carries [data-reveal].
 *
 * The spotlight itself is pure CSS (.spot in globals.css). All this does is
 * publish the pointer position as --mx/--my percentages, once per frame, and
 * only on devices that actually have a fine pointer.
 */
type SpotlightCardProps = {
  children: ReactNode
  /** Goes on the rendered element itself — e.g. "svc-card feature spot". */
  className?: string
  /** Reveal stagger, in ms. */
  delay?: number
  style?: CSSProperties
}

export function SpotlightCard({ children, className, delay = 0, style }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  // Scroll reveal. Mirrors <Reveal>: flip data-shown once, then stop watching,
  // so scrolling back up does not replay it.
  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      el.setAttribute('data-shown', 'true')
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-shown', 'true')
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Cursor spotlight.
  useEffect(() => {
    const el = ref.current
    if (!el) return

    // A touch device has no hover state to follow; skip the listener entirely
    // rather than paying for events that can never light anything up.
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      return
    }

    let frame = 0
    let x = 50
    let y = 50

    const paint = () => {
      frame = 0
      el.style.setProperty('--mx', `${x.toFixed(1)}%`)
      el.style.setProperty('--my', `${y.toFixed(1)}%`)
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      x = ((event.clientX - rect.left) / rect.width) * 100
      y = ((event.clientY - rect.top) / rect.height) * 100
      // One write per animation frame, however fast the mouse moves.
      if (!frame) frame = requestAnimationFrame(paint)
    }

    const onLeave = () => {
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      // Back to the CSS default (50% 50%) so the next hover starts clean.
      el.style.removeProperty('--mx')
      el.style.removeProperty('--my')
    }

    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div
      ref={ref}
      data-reveal=""
      className={className}
      style={{ ...style, ['--reveal-delay' as string]: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export default SpotlightCard

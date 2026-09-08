'use client'

import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Scroll-reveal wrapper.
 *
 * Deliberately IntersectionObserver + CSS rather than a spring library: the
 * transition itself is two lines of CSS in globals.css, this only flips
 * data-shown, and it costs no animation-library runtime on a page that renders
 * a hundred of them. It also unobserves after firing, so scrolling back up does
 * not re-animate — content that re-hides on every pass reads as broken.
 */
type RevealProps = {
  children: ReactNode
  /** Stagger, in ms. Index * step is the usual call. */
  delay?: number
  /** Constrained on purpose: a free ElementType makes the prop types unresolvable. */
  as?: 'div' | 'section' | 'article' | 'li' | 'p' | 'span'
  className?: string
  style?: CSSProperties
}

export function Reveal({ children, delay = 0, as, className, style }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  // Cast to one concrete intrinsic tag so the JSX props resolve; every member
  // of the union above accepts the same attributes we pass.
  const Tag = (as ?? 'div') as 'div'

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // If the browser cannot observe, show it immediately rather than never.
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

  return (
    <Tag
      ref={ref}
      data-reveal=""
      className={className}
      style={{ ...style, ['--reveal-delay' as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}

export default Reveal

'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/**
 * Word-by-word masked reveal for section headings.
 *
 * The heading is rendered as plain text on the server, on the first client
 * render, and forever after for anyone without JS, with prefers-reduced-motion
 * set, or without IntersectionObserver. Only once all three gates pass does the
 * text get split — so the no-JS/reduced-motion page is byte-identical to today,
 * and there is no hydration mismatch.
 *
 * Accessibility: when split, the words are aria-hidden and the heading element
 * carries aria-label with the original sentence, so assistive tech reads one
 * string rather than a list of words. Real space text nodes sit between the
 * masks, so selecting and copying the heading still yields the sentence.
 *
 * Geometry (the fiddly part): the mask must clip the word without moving it.
 * `overflow:hidden` on an inline-block moves its baseline to the bottom margin
 * edge, which would inflate every line box and change the heading's height —
 * .sec-head-c h2 is line-height 1.06 and must not shift. So the mask keeps
 * overflow visible and clips with `clip-path` instead, which is a paint-time
 * operation and leaves the baseline alone. The padding gives descenders (g, y)
 * and ascenders room inside the clip box, and the matching negative margins
 * cancel that padding again, so the margin box — the thing the line box is
 * built from — is exactly the size it was before the split.
 */

const DURATION_MS = 620
const STAGGER_MS = 28
const EASE = 'cubic-bezier(.22,.61,.36,1)'

/** Headroom under the baseline so "g" and "y" are not clipped at rest. */
const PAD_BOTTOM = '0.2em'
/** Headroom above so tall ascenders and quotes are not clipped at rest. */
const PAD_TOP = '0.3em'

const MASK_STYLE: CSSProperties = {
  display: 'inline-block',
  paddingTop: PAD_TOP,
  marginTop: `-${PAD_TOP}`,
  paddingBottom: PAD_BOTTOM,
  marginBottom: `-${PAD_BOTTOM}`,
  clipPath: 'inset(0)',
}

/**
 * 100% of the word's own height plus the mask's bottom padding: exactly far
 * enough that the tallest glyph clears the clip edge instead of peeking.
 */
const HIDDEN_TRANSFORM = `translate3d(0,calc(100% + ${PAD_BOTTOM}),0)`

const WORD_STYLE: CSSProperties = {
  display: 'inline-block',
  transform: HIDDEN_TRANSFORM,
  transition: `transform ${DURATION_MS}ms ${EASE}`,
  willChange: 'transform',
}

type LineRevealProps = {
  /** The heading text. A plain string — this splits it, so it cannot be markup. */
  children: string
  /** Constrained on purpose: a free ElementType makes the prop types unresolvable. */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div' | 'span'
  className?: string
  /** Delay before the first word moves, in ms. */
  delay?: number
  /** Per-word stagger, in ms. */
  stagger?: number
}

export function LineReveal({
  children,
  as,
  className,
  delay = 0,
  stagger = STAGGER_MS,
}: LineRevealProps) {
  const ref = useRef<HTMLHeadingElement | null>(null)
  const [split, setSplit] = useState(false)
  // Cast to one concrete intrinsic tag so the JSX props resolve; every member
  // of the union above accepts the same attributes we pass.
  const Tag = (as ?? 'h2') as 'h2'

  useEffect(() => {
    if (document.documentElement.dataset.motion !== 'on') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return
    setSplit(true)
  }, [])

  useEffect(() => {
    if (!split) return
    const el = ref.current
    if (!el) return

    const words = Array.from(el.querySelectorAll<HTMLElement>('[data-lr-word]'))
    if (words.length === 0) return

    let timer: ReturnType<typeof setTimeout> | undefined

    // The flip is a direct style write rather than a state change: React could
    // batch a state update into the same commit that first painted the hidden
    // state and the transition would never run. IntersectionObserver callbacks
    // are always delivered asynchronously, so by here the hidden state is on
    // screen and the transition is guaranteed.
    const show = () => {
      for (const word of words) word.style.transform = 'none'
      // Compositor hints are not free; drop them once the last word has landed.
      timer = setTimeout(
        () => {
          for (const word of words) word.style.willChange = 'auto'
        },
        delay + stagger * words.length + DURATION_MS + 80,
      )
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          show()
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.2 },
    )

    io.observe(el)
    return () => {
      io.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [split, delay, stagger])

  if (!split) {
    return (
      <Tag ref={ref} className={className}>
        {children}
      </Tag>
    )
  }

  const words = children.split(/\s+/).filter(Boolean)

  return (
    <Tag ref={ref} className={className} aria-label={children}>
      {words.map((word, index) => (
        <Fragment key={`${index}-${word}`}>
          {/* A real space text node, not a styled gap: it keeps the natural
              wrap opportunity and keeps the copied selection a sentence. */}
          {index > 0 ? ' ' : null}
          <span aria-hidden="true" style={MASK_STYLE}>
            <span
              data-lr-word=""
              style={{ ...WORD_STYLE, transitionDelay: `${delay + index * stagger}ms` }}
            >
              {word}
            </span>
          </span>
        </Fragment>
      ))}
    </Tag>
  )
}

export default LineReveal

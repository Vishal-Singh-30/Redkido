'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { StripImage } from '@/components/three/webgl-strip'
import { useInView, useTabVisible } from '@/components/motion/use-in-view'

const WebGLStrip = dynamic(() => import('@/components/three/webgl-strip'), { ssr: false })

/**
 * One portfolio strip, in whichever form the visitor's browser can actually run.
 *
 * The original CSS marquee is ALWAYS rendered. When WebGL takes over, the DOM
 * track is faded to zero and its animation stopped — but it is deliberately not
 * `display:none` or `visibility:hidden`, because:
 *
 *   - it keeps supplying the wrapper's height, which the absolutely-positioned
 *     canvas has none of its own
 *   - it stays in the accessibility tree, so the alt text on every card is still
 *     announced and still indexed
 *
 * So the WebGL version is a visual upgrade layered over an intact page, not a
 * replacement for it. If the canvas never initialises — no WebGL, a texture
 * failure, reduced motion, a phone — nothing is lost and nothing is blank.
 *
 * Card dimensions are MEASURED from the live DOM rather than hardcoded, so the
 * responsive breakpoints in globals.css (230x300 desktop, 180x240 under 640px,
 * and the hero's own 190x250 / 150x198) keep working without being restated here.
 */

type Props = {
  cards: readonly StripImage[]
  /** Seconds for one traversal — mirror the CSS animation-duration. */
  durationSeconds: number
  reverse?: boolean
  className?: string
  style?: CSSProperties
  /** Extra classes for the inner track, e.g. the hero's `hero-track`. */
  trackClassName?: string
  cardClassName?: string
  /**
   * The clipping wrapper. Defaults to the portfolio's `.work-marquee-wrap`; the
   * hero passes `hero-visual`, which carries its own gradient fade edges.
   * Both already set overflow:hidden, which is what clips the canvas.
   */
  wrapClassName?: string
  /** Element id to preserve, e.g. the hero track's `heroTrack`. */
  trackId?: string
  /**
   * Opt out of WebGL for this strip entirely.
   *
   * The hero passes false. It already runs the gradient canvas, and a second
   * context sitting directly beneath it means two renderers competing while
   * BOTH are on screen — which is exactly the moment the hero has to look its
   * best. The hero's GPU budget goes to the gradient; the portfolio section
   * gets the WebGL gallery.
   */
  webgl?: boolean
}

export function PortfolioStrip({
  cards,
  durationSeconds,
  reverse = false,
  className,
  style,
  trackClassName,
  cardClassName,
  wrapClassName = 'work-marquee-wrap',
  trackId,
  webgl = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState<{ w: number; h: number; gap: number } | null>(null)
  // "The canvas has painted", not "the canvas has mounted". The DOM track is
  // only hidden once WebGL has demonstrably produced frames.
  const [webglPainted, setWebglPainted] = useState(false)
  // Latches on failure so we stop re-attempting on every scroll pass.
  const [webglGaveUp, setWebglGaveUp] = useState(false)

  // Mount the canvas only while the strip is near the viewport, and drop it
  // when the tab is hidden. This is what keeps the page to one live WebGL
  // context at a time instead of four.
  const near = useInView(wrapRef, { margin: '500px' })
  const tabVisible = useTabVisible()
  const shouldRender = webgl && near && tabVisible && !webglGaveUp

  // Hand the DOM track back the moment the canvas goes away, or the strip
  // would be left blank while scrolled past.
  useEffect(() => {
    if (!shouldRender) setWebglPainted(false)
  }, [shouldRender])

  /**
   * Watchdog.
   *
   * If the canvas has not painted within a few seconds of being asked to, give
   * up permanently and keep the CSS marquee. Compositing a strip's textures is
   * fast; anything slower than this means something is wrong — a failed context,
   * a shader that would not compile, a zero-sized canvas — and an empty
   * portfolio is a far worse outcome than a portfolio without the effect.
   */
  useEffect(() => {
    if (!shouldRender || webglPainted) return
    const timer = window.setTimeout(() => {
      console.warn('[portfolio-strip] WebGL did not paint in time; keeping the CSS marquee')
      setWebglGaveUp(true)
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [shouldRender, webglPainted])

  // The CSS marquee needs the set twice; the WebGL one repeats internally.
  const doubled = [...cards, ...cards]

  const measure = useCallback(() => {
    const card = cardRef.current
    const track = card?.parentElement
    if (!card || !track) return
    const rect = card.getBoundingClientRect()
    const gap = Number.parseFloat(getComputedStyle(track).columnGap || '20') || 20
    if (rect.width > 0 && rect.height > 0) {
      setMetrics({ w: Math.round(rect.width), h: Math.round(rect.height), gap })
    }
  }, [])

  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (cardRef.current) ro.observe(cardRef.current)
    return () => ro.disconnect()
  }, [measure])

  return (
    <div ref={wrapRef} className={`${wrapClassName} ${className ?? ''}`} style={{ position: 'relative', ...style }}>
      <div
        id={trackId}
        className={`work-track ${reverse ? 'reverse' : ''} ${trackClassName ?? ''}`}
        style={
          webglPainted
            ? { opacity: 0, animation: 'none', transition: 'opacity .5s ease' }
            : { transition: 'opacity .5s ease' }
        }
      >
        {doubled.map((card, index) => (
          <div
            className={`work-card ${cardClassName ?? ''}`}
            key={`${card.src}-${index}`}
            ref={index === 0 ? cardRef : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.src} alt={card.alt} loading="lazy" />
            <span className="work-tag">{card.tag}</span>
          </div>
        ))}
      </div>

      {metrics !== null && shouldRender && (
        <WebGLStrip
          images={cards}
          cardWidth={metrics.w}
          cardHeight={metrics.h}
          gap={metrics.gap}
          durationSeconds={durationSeconds}
          reverse={reverse}
          onPainted={() => setWebglPainted(true)}
          onFailed={(reason) => {
            console.warn(`[portfolio-strip] WebGL unavailable (${reason}); using the CSS marquee`)
            setWebglPainted(false)
            setWebglGaveUp(true)
          }}
        />
      )}
    </div>
  )
}

export default PortfolioStrip

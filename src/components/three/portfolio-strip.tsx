import type { CSSProperties } from 'react'

/**
 * One portfolio strip: the original CSS marquee, and nothing else.
 *
 * WHY THERE IS NO WEBGL HERE ANY MORE
 *
 * This used to render a WebGL layer on top whose cards bowed with scroll
 * velocity and rippled under the cursor, hiding the DOM track once the canvas
 * reported it had painted. It failed in production twice, both times the same
 * way: the DOM track was hidden and the canvas drew nothing, so the section —
 * the best content on the site — went blank a couple of seconds after load.
 *
 * The second attempt added a paint-verified handoff (only hide the DOM once the
 * renderer has produced frames) and a watchdog. Both were satisfied: the render
 * loop ran, so the handoff fired, but no geometry ever appeared. Diagnosing that
 * needs a browser that will execute the page, and the environment this was
 * developed in will not, so every fix was a guess.
 *
 * The trade stopped being worth it. A marquee that always works beats an effect
 * that is better when it works and catastrophic when it does not — especially on
 * the portfolio, which is the strongest thing this site has to show. The
 * photography is the point; the distortion was decoration on top of it.
 *
 * If it is ever revived: keep the DOM as the visible layer and add the canvas
 * ON TOP of it rather than instead of it, so a canvas that renders nothing is
 * invisible rather than destructive. The old implementation is in git history at
 * src/components/three/webgl-strip.tsx.
 *
 * The hero's WebGL gradient is a different component and is unaffected.
 */

export type StripImage = {
  src: string
  alt: string
  tag: string
}

type Props = {
  cards: readonly StripImage[]
  /** Kept for call-site parity with the CSS animation-duration. */
  durationSeconds?: number
  reverse?: boolean
  className?: string
  style?: CSSProperties
  /** Extra classes for the inner track, e.g. the hero's `hero-track`. */
  trackClassName?: string
  cardClassName?: string
  /**
   * The clipping wrapper. Defaults to the portfolio's `.work-marquee-wrap`; the
   * hero passes `hero-visual`, which carries its own gradient fade edges.
   */
  wrapClassName?: string
  /** Element id to preserve, e.g. the hero track's `heroTrack`. */
  trackId?: string
}

export function PortfolioStrip({
  cards,
  reverse = false,
  className,
  style,
  trackClassName,
  cardClassName,
  wrapClassName = 'work-marquee-wrap',
  trackId,
}: Props) {
  /**
   * The set is rendered TWICE, deliberately.
   *
   * The CSS animates translateX(0) -> translateX(-50%), so the second half must
   * be a byte-identical duplicate of the first or the loop visibly jumps at the
   * seam. Changing the number of cards means changing both halves.
   */
  const doubled = [...cards, ...cards]

  return (
    <div className={`${wrapClassName} ${className ?? ''}`} style={style}>
      <div
        id={trackId}
        className={`work-track ${reverse ? 'reverse' : ''} ${trackClassName ?? ''}`}
      >
        {doubled.map((card, index) => (
          <div className={`work-card ${cardClassName ?? ''}`} key={`${card.src}-${index}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.src} alt={card.alt} loading="lazy" />
            <span className="work-tag">{card.tag}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PortfolioStrip

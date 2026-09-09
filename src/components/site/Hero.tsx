import { hero } from '@/content/hero'
import { work } from '@/content/work'
import { Reveal } from '@/components/motion/reveal'
import { PortfolioStrip } from '@/components/three/portfolio-strip'
import { HeroCanvas } from '@/components/three/hero-canvas'

/**
 * Hero section.
 *
 * The .hero-visual strip animates translateX(0) -> translateX(-50%), so the
 * track must contain the image set exactly twice, in the same order, for the
 * loop to be seamless. Plain <img loading="lazy"> is used rather than
 * next/image because .work-card img sizes the element with width/height 100%
 * plus object-fit and a ken-burns transform; the layout contract belongs to the
 * original CSS.
 *
 * Enhancement layer (additive only):
 *   - <HeroCanvas /> sits with the two glow divs as the third background layer.
 *     It self-gates on WebGL / reduced-motion / device class and renders null
 *     otherwise, at which point the glows are exactly what they always were.
 *   - The copy uses <Reveal> purely as a first-paint stagger. Everything here is
 *     above the fold, so the observer fires on mount and the delays read as one
 *     70ms-per-beat entrance rather than a scroll effect.
 *   - Each Reveal carries the element's original class, so no wrapper divs are
 *     introduced and every selector in globals.css still matches.
 */

/** Beat length of the hero entrance, in ms. */
const STEP = 70

/**
 * Hover lift for a portfolio card. motion-safe: so the whole thing evaporates
 * under prefers-reduced-motion instead of snapping 4px with a 0.001ms
 * transition, and transform is unclaimed by .work-card so nothing is overridden.
 */
const CARD_LIFT =
  'motion-safe:transition-transform motion-safe:duration-[260ms] motion-safe:ease-out motion-safe:hover:-translate-y-1'

function btnClass(variant: string): string {
  return variant === 'ghost' ? 'btn btn-ghost' : 'btn'
}

export function Hero() {

  return (
    <section className="hero" style={{ borderBottom: 'none' }}>
      <div className="hero-glow" />
      <div className="hero-glow-2" />
      <HeroCanvas />
      <div className="wrap hero-inner">
        <Reveal className="eyebrow" delay={0}>
          <span className="pulse" />
          {hero.eyebrow}
        </Reveal>
        <Reveal delay={STEP}>
          <h1>
            {hero.headline}
            <span>{hero.headlineAccent}</span>
          </h1>
        </Reveal>
        <Reveal as="p" className="lead" delay={STEP * 2}>
          {hero.lead}
        </Reveal>
        <Reveal className="hero-actions" delay={STEP * 3}>
          {hero.actions.map((action) => (
            <a key={action.label} href={action.href} className={btnClass(action.variant)}>
              {action.label}
            </a>
          ))}
        </Reveal>
      </div>
      <PortfolioStrip
        cards={work.heroTrack}
        durationSeconds={88}
        wrapClassName="hero-visual"
        trackClassName="hero-track"
        trackId="heroTrack"
      />
      <Reveal className="wrap hero-inner" style={{ paddingTop: '8px' }} delay={STEP * 4}>
        <div className="avatar-row">
          {hero.avatars.map((avatar, index) => (
            <div className="av" key={`${avatar.initials}-${index}`} style={{ background: avatar.color }}>
              {avatar.initials}
            </div>
          ))}
        </div>
        <div className="social-proof">{hero.socialProof}</div>
      </Reveal>
      <Reveal className="wrap hero-chip-row" delay={STEP * 5}>
        {hero.pills.map((pill) => (
          <span className="pill" key={pill}>
            {pill}
          </span>
        ))}
      </Reveal>
    </section>
  )
}

export default Hero

import { work } from '@/content/work'
import { Reveal } from '@/components/motion/reveal'
import { PortfolioStrip } from '@/components/three/portfolio-strip'

/**
 * Portfolio section: two infinite card tracks, the second reversed.
 * Both animate translateX(0) -> translateX(-50%), so each track renders its
 * card set exactly twice, in the same order.
 *
 * Enhancement layer (additive only): the kicker and the section head reveal on
 * scroll one beat apart, each <Reveal> carrying the element's original class so
 * no wrapper is introduced.
 *
 * The tracks themselves are handed to <PortfolioStrip>, which renders this exact
 * CSS marquee AND, where the browser can run it, a WebGL version on top whose
 * cards bow with scroll velocity and ripple under the cursor. The DOM markup
 * below is never removed — it supplies the height and the alt text either way.
 * See src/components/three/portfolio-strip.tsx.
 */

export function Work() {
  return (
    <section id="work">
      <div className="wrap">
        <Reveal className="kicker">{work.kicker}</Reveal>
        <Reveal className="sec-head-c" delay={70}>
          <h2>{work.heading}</h2>
          <p>{work.sub}</p>
        </Reveal>
      </div>
      <PortfolioStrip cards={work.trackOne} durationSeconds={104} />
      <PortfolioStrip
        cards={work.trackTwo}
        durationSeconds={112}
        reverse
        style={{ marginTop: '6px' }}
      />
    </section>
  )
}

export default Work

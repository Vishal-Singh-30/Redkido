import { problems } from '@/content/problems'
import { Icon } from '@/components/site/Icons'
import { LineReveal } from '@/components/motion/line-reveal'
import { Reveal } from '@/components/motion/reveal'

/** "Sound familiar?" — six problem cards plus the four-up fact row. */
export function Problems() {
  return (
    <section>
      <div className="wrap">
        {/* <Reveal> forwards className, so the reveal element IS the original
            element — no extra wrapper to disturb the grid or the flex row. */}
        <Reveal className="kicker">{problems.kicker}</Reveal>
        {/* The heading now carries its own word-by-word mask reveal, so the
            block-level <Reveal> moves down onto the sub-paragraph only —
            wrapping both would animate the h2 twice. */}
        <div className="sec-head-c">
          <LineReveal>{problems.heading}</LineReveal>
          <Reveal as="p" delay={60}>
            {problems.sub}
          </Reveal>
        </div>
        <div className="problem-grid">
          {problems.cards.map((card, index) => (
            // The frozen reveal rule (html[data-motion] [data-reveal][data-shown])
            // outspecifies .problem-card:hover, so the existing -4px lift would
            // silently die once the card revealed. This utility restores exactly
            // that value — same distance, still riding the card's own
            // transform .22s ease transition. Nothing new, just kept.
            <Reveal
              className="problem-card hover:[transform:translateY(-4px)]!"
              key={card.text}
              delay={index * 60}
            >
              <div className="problem-icon">
                <Icon name={card.icon} />
              </div>
              <p>{card.text}</p>
            </Reveal>
          ))}
        </div>
        <div className="fact-row">
          {problems.facts.map((fact, index) => (
            // Shorter step than the cards: the fact row is one object, and a
            // slow stagger across four hairline-joined cells reads as a stutter.
            <Reveal className="fact" key={fact} delay={index * 40}>
              <Icon name="check" />
              <span>{fact}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Problems

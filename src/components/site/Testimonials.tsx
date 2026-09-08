import { LineReveal } from '@/components/motion/line-reveal'
import { Reveal } from '@/components/motion/reveal'
import { testimonials, type Testimonial } from '@/content/testimonials'

/**
 * The <Reveal> sits outside .test-card rather than on it, for two reasons:
 * the reveal's own `transition:opacity,transform` (unlayered, so it outranks a
 * Tailwind utility) would swallow the hover transition, and keeping the card
 * markup untouched keeps `.test-card{height:100%}` doing its job. The wrapper is
 * display:grid so the card still stretches to the tallest card in the row.
 *
 * The lift uses the `translate` property (Tailwind v4) rather than `transform`,
 * which the reveal owns — the two compose instead of fighting.
 */
export function Testimonials() {
  const items: readonly Testimonial[] = testimonials.items

  return (
    <section>
      <div className="wrap">
        <div className="kicker">{testimonials.kicker}</div>
        <div className="sec-head-c">
          <LineReveal>{testimonials.heading}</LineReveal>
          <p>{testimonials.sub}</p>
        </div>
        <div className="test-grid">
          {items.map((item, index) => (
            <Reveal delay={index * 70} key={item.name} style={{ display: 'grid' }}>
              <div className="test-card transition-transform duration-[260ms] ease-[var(--ease-out-soft)] hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <p className="test-quote">{item.quote}</p>
                <div className="test-who">
                  <div className="avatar" style={{ background: item.color }}>
                    {item.initials}
                  </div>
                  <div>
                    <div className="name">{item.name}</div>
                    <div className="role">{item.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Testimonials

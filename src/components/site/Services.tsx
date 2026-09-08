import { services } from '@/content/services'
import { Icon } from '@/components/site/Icons'
import { LineReveal } from '@/components/motion/line-reveal'
import { Reveal } from '@/components/motion/reveal'
import { SpotlightCard } from '@/components/site/spotlight-card'

/** "What we run" — the eleven-service grid; the first card carries .feature. */
export function Services() {
  return (
    <section id="services">
      <div className="wrap">
        <Reveal className="kicker">{services.kicker}</Reveal>
        {/* Heading reveals per word; the sub-paragraph keeps the block reveal
            it had. Wrapping both would double-animate the h2. */}
        <div className="sec-head-c">
          <LineReveal>{services.heading}</LineReveal>
          <Reveal as="p" delay={60}>
            {services.sub}
          </Reveal>
        </div>
        <div className="svc-grid">
          {services.items.map((item, index) => (
            // SpotlightCard renders the card element itself, so .feature keeps
            // its gradient and the card keeps its place as a grid item. A tight
            // 45ms step: eleven cards at a slower one would still be arriving
            // after the reader has moved on.
            //
            // The hover utility is a repair, not a new effect: the frozen
            // [data-reveal][data-shown]{transform:none} rule outspecifies
            // .svc-card:hover, so the card's existing -4px lift would stop
            // working the moment it revealed. Same value, same transition.
            <SpotlightCard
              className={
                'feature' in item && item.feature
                  ? 'svc-card feature spot hover:[transform:translateY(-4px)]!'
                  : 'svc-card spot hover:[transform:translateY(-4px)]!'
              }
              key={item.title}
              delay={index * 45}
            >
              <div className="svc-icon">
                <Icon name={item.icon} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Services

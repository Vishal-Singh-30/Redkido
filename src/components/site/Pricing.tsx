import { Magnetic, magneticBtnClass } from '@/components/motion/magnetic'
import { Reveal } from '@/components/motion/reveal'
import { pricing, type PricingTier } from '@/content/pricing'

/**
 * Retainer engagements — scoped monthly, no fixed amount. Nothing on this site
 * is transacted: every CTA here is an in-page anchor to the contact form, and
 * booking a call is free.
 */
function buttonClass(variant: string): string {
  return variant === 'ghost' ? 'btn btn-ghost' : 'btn'
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

export function Pricing() {
  // Widened from the authored const tuple so the optional `popular` flag is
  // reachable on tiers that omit it.
  const tiers: readonly PricingTier[] = pricing.tiers

  return (
    <section id="pricing">
      <div className="wrap">
        <div className="kicker">{pricing.kicker}</div>
        <div className="sec-head-c">
          <h2>{pricing.heading}</h2>
          <p>{pricing.sub}</p>
        </div>
        <div className="price-grid">
          {tiers.map((tier, index) => (
            // The reveal wrapper IS the card: <Reveal> forwards className, so no
            // extra element lands between .price-grid and its grid children.
            // Hover deepens the existing shadow only — a transform here would be
            // overridden by the reveal's own [data-shown] transform rule.
            <Reveal
              key={tier.name}
              delay={index * 80}
              className={
                tier.popular
                  ? 'price-card pop transition-shadow duration-500 ease-out hover:shadow-[0_16px_38px_rgba(232,54,43,.14)]'
                  : 'price-card transition-shadow duration-500 ease-out hover:shadow-[0_12px_30px_rgba(20,10,10,.09)]'
              }
            >
              {tier.popular && tier.popularTag ? (
                <span className="pop-tag">{tier.popularTag}</span>
              ) : null}
              <h3>{tier.name}</h3>
              <p className="desc">{tier.desc}</p>
              <div className="fee">{tier.fee}</div>
              <ul className="price-list">
                {tier.features.map((feature) => (
                  <li key={feature}>
                    <CheckMark />
                    {feature}
                  </li>
                ))}
              </ul>
              {/* flex-col on the wrapper keeps the button full-bleed inside the
                  card, exactly as the bare anchor was when it stretched as the
                  card's own flex child. */}
              <Magnetic className={`${magneticBtnClass} flex-col`}>
                <a
                  href={tier.cta.href}
                  className={buttonClass(tier.cta.variant)}
                  style={{ justifyContent: 'center' }}
                >
                  {tier.cta.label}
                </a>
              </Magnetic>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Pricing

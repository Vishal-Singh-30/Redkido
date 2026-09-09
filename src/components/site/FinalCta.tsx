import { Reveal } from '@/components/motion/reveal'
import { siteConfig } from '@/config/site'
import { finalCta, type CtaAction } from '@/content/cta'

/**
 * Contact channels have exactly one source of truth: siteConfig.contact.
 * Content may author an href as `mailto:{email}` / `https://wa.me/{whatsapp}`
 * or with a placeholder address — either way the address is replaced here, so
 * the go-live WhatsApp number is fixed in src/config/site.ts alone.
 */
function fillContactTokens(value: string): string {
  return value
    .split('{email}')
    .join(siteConfig.contact.email)
    .split('{whatsapp}')
    .join(siteConfig.contact.whatsapp)
}

export function resolveContactHref(href: string): string {
  const filled = fillContactTokens(href)
  if (filled.startsWith('mailto:')) return `mailto:${siteConfig.contact.email}`
  if (filled.startsWith('whatsapp:') || /^https?:\/\/(www\.)?wa\.me\//.test(filled)) {
    return `https://wa.me/${siteConfig.contact.whatsapp}`
  }
  return filled
}

function buttonClass(variant: string): string {
  return variant === 'ghost' ? 'btn btn-ghost' : 'btn'
}

export function FinalCta() {
  const actions: readonly CtaAction[] = finalCta.actions

  return (
    <section className="cta-final" id="contact">
      <div className="wrap">
        {/* .cta-box is position:relative;z-index:1 — the reveal wrapper is the
            box itself, so it keeps sitting above the section's backdrop. */}
        <Reveal className="cta-box">
          <div className="kicker">{finalCta.kicker}</div>
          <h2>{finalCta.heading}</h2>
          <p>{finalCta.body}</p>
          <div className="cta-actions">
                        {actions.map((action) => (
                <a
                  href={resolveContactHref(action.href)}
                  className={buttonClass(action.variant)}
                >
                  {fillContactTokens(action.label)}
                </a>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export default FinalCta

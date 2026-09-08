import { LineReveal } from '@/components/motion/line-reveal'
import { Reveal } from '@/components/motion/reveal'
import { fit } from '@/content/fit'

function YesMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

function NoMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function FitCheck() {
  const yesItems: readonly string[] = fit.yes.items
  const noItems: readonly string[] = fit.no.items

  return (
    <section>
      <div className="wrap">
        <div className="kicker">{fit.kicker}</div>
        <div className="sec-head-c">
          <LineReveal>{fit.heading}</LineReveal>
        </div>
        <div className="fit-grid">
          {/* The card and each <li> carry the reveal themselves, so the grid and
              list keep exactly the children the stylesheet expects. */}
          <Reveal className="fit-card">
            <h3>{fit.yes.title}</h3>
            <ul className="fit-list">
              {yesItems.map((item, index) => (
                <Reveal as="li" className="fit-yes" delay={120 + index * 50} key={item}>
                  <YesMark />
                  {item}
                </Reveal>
              ))}
            </ul>
          </Reveal>
          <Reveal className="fit-card" delay={90}>
            <h3>{fit.no.title}</h3>
            <ul className="fit-list">
              {noItems.map((item, index) => (
                <Reveal as="li" className="fit-no" delay={210 + index * 50} key={item}>
                  <NoMark />
                  {item}
                </Reveal>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export default FitCheck

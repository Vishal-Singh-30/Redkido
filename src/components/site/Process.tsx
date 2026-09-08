'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'

import { LineReveal } from '@/components/motion/line-reveal'
import { Reveal } from '@/components/motion/reveal'
import { process as processContent, type ProcessStep } from '@/content/process'

/**
 * The five-step engagement process. `.process::before` draws the connecting
 * rule, so the steps must remain direct children of .process.
 *
 * That constraint is why each step is rendered *as* the <Reveal> element rather
 * than wrapped in one: a wrapper would make every .proc-step a :first-child and
 * `.proc-step:first-child .proc-num{background:var(--red)}` would tint all five
 * circles red.
 *
 * The progress line is scroll-linked and comes in two orientations, because the
 * original stylesheet flips the layout at 960px:
 *   > 960px  the steps are a five-column row joined by the `.process::before`
 *            hairline, so the fill runs horizontally along that same hairline
 *            (top:23px, left/right 5% — identical geometry, so it lands on it).
 *   <= 960px `.process::before` is hidden and the steps stack, so the vertical
 *            `.proc-rail` takes over, offset to 22px/23px so it threads through
 *            the centre of the .proc-num circles and is masked by their opaque
 *            background — the same relationship the desktop rule has.
 * Neither element is ever a grid item (both are absolutely positioned), so the
 * five-column track stays exactly as it was.
 *
 * Fallbacks: with JS off or prefers-reduced-motion set, the rail renders filled
 * rather than empty — a static connector, no motion.
 */
export function Process() {
  const steps: readonly ProcessStep[] = processContent.steps

  const railRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const [mounted, setMounted] = useState(false)

  // Server and first client render must agree, so the animated element is only
  // swapped in on the second render. Before that the fill is static and full.
  useEffect(() => setMounted(true), [])

  const { scrollYProgress } = useScroll({
    target: railRef,
    offset: ['start 65%', 'end 45%'],
  })
  const clamped = useTransform(scrollYProgress, [0, 1], [0, 1], { clamp: true })
  const fill = useSpring(clamped, { stiffness: 110, damping: 26, restDelta: 0.001 })

  const animated = mounted && !reduced

  return (
    <section id="process">
      <div className="wrap">
        <div className="kicker">{processContent.kicker}</div>
        <div className="sec-head-c">
          <LineReveal>{processContent.heading}</LineReveal>
          <p>{processContent.sub}</p>
        </div>
        <div className="process" ref={railRef}>
          {/* Desktop: fills along the existing ::before hairline. */}
          <div aria-hidden="true" className="max-[960px]:hidden" style={TRACK_H}>
            {animated ? (
              <motion.span style={{ ...BAR_H, scaleX: fill }} />
            ) : (
              <span style={BAR_H} />
            )}
          </div>

          {/* Stacked layout: threads down through the step numbers. */}
          <div
            aria-hidden="true"
            className="proc-rail hidden max-[960px]:block"
            style={{ left: '22px', top: '23px' }}
          >
            {animated ? <motion.i style={{ scaleY: fill }} /> : <i />}
          </div>

          {steps.map((step, index) => (
            <Reveal as="div" className="proc-step" delay={index * 80} key={step.num}>
              <div className="proc-num">{step.num}</div>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Geometry copied from `.process::before` so the fill sits on the hairline
 * instead of beside it. Kept inline rather than added to globals.css, which is
 * frozen.
 */
const TRACK_H = {
  position: 'absolute',
  top: '23px',
  left: '5%',
  right: '5%',
  height: '1px',
  overflow: 'hidden',
  pointerEvents: 'none',
} as const

const BAR_H = {
  display: 'block',
  width: '100%',
  height: '100%',
  transformOrigin: '0 50%',
  background: 'linear-gradient(90deg,var(--red),var(--red-2))',
} as const

export default Process

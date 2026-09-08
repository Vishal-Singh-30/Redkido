'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { LineReveal } from '@/components/motion/line-reveal'
import { Reveal } from '@/components/motion/reveal'
import { faq, type FaqItem } from '@/content/faq'

/**
 * Single-open accordion. The original page transitioned `max-height` from a
 * script that read scrollHeight on click; that is reproduced here with state:
 * the open panel gets an inline maxHeight measured from its own ref, and the
 * inline value is cleared when it closes so the CSS rule (max-height:0) wins.
 */
export function Faq() {
  const items: readonly FaqItem[] = faq.items
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const [openHeight, setOpenHeight] = useState<number | null>(null)
  const panelRefs = useRef<Array<HTMLDivElement | null>>([])

  const measure = useCallback(() => {
    if (openIndex === null) {
      setOpenHeight(null)
      return
    }
    const panel = panelRefs.current[openIndex]
    setOpenHeight(panel ? panel.scrollHeight : null)
  }, [openIndex])

  useEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  return (
    <section id="faq">
      <div className="wrap">
        <div className="kicker">{faq.kicker}</div>
        <div className="sec-head-c" style={{ marginBottom: 36 }}>
          <LineReveal>{faq.heading}</LineReveal>
          <p>{faq.sub}</p>
        </div>
        <div className="faq-list">
          {items.map((item, index) => {
            const isOpen = openIndex === index
            const panelId = `faq-panel-${index}`
            const buttonId = `faq-question-${index}`
            return (
              // <Reveal> forwards className, so the reveal wrapper IS the
              // .faq-item — the open/close logic and the .plus rotation in
              // globals.css are untouched.
              <Reveal
                className={isOpen ? 'faq-item open' : 'faq-item'}
                delay={index * 70}
                key={item.q}
              >
                <button
                  type="button"
                  id={buttonId}
                  className="faq-q"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => {
                    setOpenIndex(isOpen ? null : index)
                  }}
                >
                  {item.q}
                  <span className="plus" aria-hidden="true" />
                </button>
                <div
                  className="faq-a"
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  ref={(node) => {
                    panelRefs.current[index] = node
                  }}
                  style={isOpen && openHeight !== null ? { maxHeight: `${openHeight}px` } : undefined}
                >
                  <p>{item.a}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default Faq

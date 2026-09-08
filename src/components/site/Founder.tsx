'use client'

import { useEffect, useRef, useState } from 'react'

import { LineReveal } from '@/components/motion/line-reveal'
import { Reveal } from '@/components/motion/reveal'
import { founder } from '@/content/founder'

/**
 * Founder's note. Copy and image path live in src/content/founder.ts.
 * Markup mirrors the source HTML exactly: .kicker / .sec-head-c / .founder-image-wrap.
 *
 * The photograph settles from 0.98 as it enters. `settled` starts true so the
 * server render — and any client with JS off, motion off or reduced motion — is
 * byte-identical to the untransformed original; the scaled-down start is only
 * ever applied from an effect, after those three gates pass.
 */
export function Founder() {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [settled, setSettled] = useState(true)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    if (document.documentElement.dataset.motion !== 'on') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    setSettled(false)
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setSettled(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section id="founder">
      <div className="wrap">
        <div className="kicker">{founder.kicker}</div>
        <div className="sec-head-c">
          <LineReveal>{founder.heading}</LineReveal>
        </div>
        <Reveal className="founder-image-wrap" delay={60}>
          {/*
            width/height are the intrinsic size of public/images/founder.jpg.
            Without them the img box is 0px tall until the 277KB file arrives,
            so this section collapses and everything below it jumps when it
            loads. They only reserve the aspect ratio; CSS still sizes it.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={founder.image.src}
            alt={founder.image.alt}
            loading="lazy"
            decoding="async"
            width={1086}
            height={1448}
            style={{
              transform: settled ? 'none' : 'scale(.98)',
              transition: 'transform .7s var(--ease-out-soft)',
            }}
          />
        </Reveal>
      </div>
    </section>
  )
}

export default Founder

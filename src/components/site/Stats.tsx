'use client'

import { useEffect, useRef, useState } from 'react'

import { stats, type Stat } from '@/content/stats'

/**
 * The results band. This is a <div>, not a <section>: the source markup keeps it
 * outside the section rhythm so it gets no 104px padding, only the band border.
 *
 * The numbers count up once, the first time the band is reached. Rules the
 * implementation follows:
 *  - `null` progress means "render the real value". That is the server render,
 *    the no-JS render and the prefers-reduced-motion render, so the correct
 *    figure is what ships in the HTML and what a crawler or a reader with
 *    motion off sees. The count only ever replaces it after mount.
 *  - The accent ('+', '%') is a separate content field and never animates.
 *  - A screen reader always gets the final value from the .sr-only span; the
 *    ticking digits are aria-hidden.
 *  - A non-numeric value is passed through untouched, so nothing can render NaN.
 */
const DURATION_MS = 1100

/** Ease-out cubic: fast off the mark, settles rather than stops. */
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function decimalsOf(value: string) {
  const dot = value.indexOf('.')
  return dot === -1 ? 0 : value.length - dot - 1
}

export function Stats() {
  // `stats` is a const tuple; widening to the declared element type keeps the
  // optional `accent` reachable on every entry.
  const items: readonly Stat[] = stats

  const gridRef = useRef<HTMLDivElement | null>(null)
  // null = show the final values. 0..1 = eased progress of the count.
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let timer = 0
    let started = false
    let cancelled = false

    const run = () => {
      if (started || cancelled) return
      started = true
      cleanupTriggers()
      const start = performance.now()
      const tick = (now: number) => {
        if (cancelled) return
        const t = Math.min(1, (now - start) / DURATION_MS)
        if (t >= 1) {
          // Back to null: the DOM holds the real string again, and the
          // measurement shim below is dropped, so layout matches the original.
          setProgress(null)
          return
        }
        setProgress(easeOut(t))
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    const isOnScreen = () => {
      const box = el.getBoundingClientRect()
      return box.top < window.innerHeight * 0.92 && box.bottom > 0
    }

    const onScroll = () => {
      if (isOnScreen()) run()
    }

    let io: IntersectionObserver | null = null

    function cleanupTriggers() {
      io?.disconnect()
      io = null
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(timer)
    }

    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.isIntersecting) run()
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.25 },
      )
      io.observe(el)
    }

    // Belt and braces so a figure can never sit at zero: a passive scroll check
    // starts the count if the observer somehow does not, and a timer covers the
    // case where the band is already on screen at load.
    window.addEventListener('scroll', onScroll, { passive: true })
    timer = window.setTimeout(onScroll, 400)

    // Only zero the numbers once something is watching for the trigger.
    setProgress(0)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      cleanupTriggers()
    }
  }, [])

  return (
    <div className="stats-band" id="results">
      <div className="wrap" style={{ padding: 0 }}>
        <div className="stats-grid" ref={gridRef}>
          {items.map((item) => {
            const target = Number(item.value)
            const counting = progress !== null && Number.isFinite(target)
            const shown =
              progress === null || !Number.isFinite(target)
                ? item.value
                : (target * progress).toFixed(decimalsOf(item.value))

            return (
              <div className="stat-item" key={item.label}>
                <div className="n">
                  <span
                    aria-hidden="true"
                    // Reserving the final width only while counting keeps the
                    // accent from sliding as digits are added, and leaves the
                    // resting markup exactly as it was.
                    style={
                      counting
                        ? {
                            display: 'inline-block',
                            minWidth: `${item.value.length}ch`,
                            textAlign: 'center',
                            fontVariantNumeric: 'tabular-nums',
                          }
                        : undefined
                    }
                  >
                    {shown}
                  </span>
                  {item.accent ? (
                    <span className="a" aria-hidden="true">
                      {item.accent}
                    </span>
                  ) : null}
                  <span className="sr-only">
                    {item.value}
                    {item.accent}
                  </span>
                </div>
                <div className="l">{item.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Stats

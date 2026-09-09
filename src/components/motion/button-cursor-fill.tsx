'use client'

import { useEffect } from 'react'

/**
 * Buttons fill from wherever the cursor crossed their edge, and drain back
 * toward wherever it left.
 *
 * This replaces a magnetic effect (the button leaning toward the pointer),
 * which the client did not like. Magnetism moves the target while you are
 * trying to hit it, which is the one thing a button should never do; this
 * responds to the cursor without going anywhere.
 *
 * All this does is write the entry/exit point into --fx / --fy as percentages.
 * The animation itself is CSS on .btn::before — see the button block at the end
 * of globals.css. No animation-library runtime, no requestAnimationFrame loop,
 * and nothing running unless a pointer is actually crossing a button.
 *
 * ONE delegated listener for the whole document rather than a wrapper component
 * per button: pointerover/pointerout bubble (pointerenter/leave do not), so this
 * covers every .btn on the page, including any rendered later, and the buttons
 * stay plain anchors in the JSX.
 */
export function ButtonCursorFill() {
  useEffect(() => {
    // A touch device has no cursor to fill from, and the fill would only ever
    // be seen mid-tap. Leave those buttons alone entirely.
    if (window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    function setOrigin(button: HTMLElement, event: PointerEvent) {
      const rect = button.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const x = ((event.clientX - rect.left) / rect.width) * 100
      const y = ((event.clientY - rect.top) / rect.height) * 100
      button.style.setProperty('--fx', `${x.toFixed(2)}%`)
      button.style.setProperty('--fy', `${y.toFixed(2)}%`)
    }

    function onOver(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest<HTMLElement>('.btn')
      if (!button) return
      // pointerover also fires when moving between children of the same button;
      // only reposition the origin when genuinely arriving from outside it.
      const from = event.relatedTarget
      if (from instanceof Node && button.contains(from)) return
      setOrigin(button, event)
    }

    function onOut(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest<HTMLElement>('.btn')
      if (!button) return
      const to = event.relatedTarget
      if (to instanceof Node && button.contains(to)) return
      // Set the origin to the EXIT point so the fill retreats the way the
      // cursor went, rather than snapping back to where it came in.
      setOrigin(button, event)
    }

    document.addEventListener('pointerover', onOver, { passive: true })
    document.addEventListener('pointerout', onOut, { passive: true })
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
    }
  }, [])

  return null
}

export default ButtonCursorFill

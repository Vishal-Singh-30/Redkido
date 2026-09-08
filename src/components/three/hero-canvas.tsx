'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useInView, useTabVisible } from '@/components/motion/use-in-view'

/**
 * Gate in front of the 3D hero layer.
 *
 * Three.js is by far the heaviest thing on this site, and the hero renders
 * meaningfully without it — the original CSS glows are still underneath. So the
 * scene is loaded only when it is actually going to be worth it:
 *
 *   - never on the server (ssr:false), so it costs nothing in the HTML
 *   - never under prefers-reduced-motion
 *   - never without a working WebGL context (old machines, locked-down
 *     browsers, headless screenshotters)
 *   - never on a device advertising <= 4 cores or a coarse pointer, where the
 *     frame cost is real and the mouse parallax cannot be felt anyway
 *
 * When it does load it fades in over ~1.1s (see .hero-canvas in globals.css),
 * so nothing pops in behind the headline.
 */

const HeroScene = dynamic(() => import('@/components/three/hero-scene'), { ssr: false })

function shouldRender(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (window.matchMedia('(pointer: coarse)').matches) return false

  const cores = navigator.hardwareConcurrency
  if (typeof cores === 'number' && cores > 0 && cores <= 4) return false

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
    // Release it immediately; contexts are a limited resource.
    const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')
    lose?.loseContext()
    return true
  } catch {
    return false
  }
}

export function HeroCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)

  // Once the hero has scrolled away there is nothing to render; keeping the
  // context alive just competes with the portfolio canvases further down.
  const near = useInView(hostRef, { margin: '200px' })
  const tabVisible = useTabVisible()

  useEffect(() => {
    if (!shouldRender()) return
    // Defer past first paint so the headline is never waiting on this.
    const id = window.requestIdleCallback?.(() => setEnabled(true)) ?? window.setTimeout(() => setEnabled(true), 400)
    return () => {
      if (typeof id === 'number') window.clearTimeout(id)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const t = window.setTimeout(() => setReady(true), 60)
    return () => window.clearTimeout(t)
  }, [enabled])

  // The host div always renders, so there is something to observe. The scene
  // inside it comes and goes.
  return (
    <div ref={hostRef} className="hero-canvas" data-ready={ready && enabled} aria-hidden="true">
      {enabled && near && tabVisible ? <HeroScene /> : null}
    </div>
  )
}

export default HeroCanvas

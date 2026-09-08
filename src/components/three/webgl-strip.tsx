'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The portfolio strips, rendered in WebGL.
 *
 * WHY WEBGL AT ALL
 * The portfolio is the best thing on this site — real skincare, fragrance and
 * interior creative. As a CSS marquee it is a row of static rectangles. Here
 * the cards bow and skew with scroll velocity and ripple under the cursor, so
 * the work feels handled rather than listed. That is the whole point: the
 * effect is in service of the photography, not decoration on top of it.
 *
 * WHY THE CARDS ARE PRE-COMPOSITED
 * Each card is drawn ONCE into a 2D canvas — cover-fitted image, the bottom
 * gradient from .work-card::after, and the .work-tag pill — and that canvas
 * becomes the texture. Rebuilding the gradient and the pill in GLSL would mean
 * two sources of truth for how a card looks, and they would drift. This way the
 * WebGL card is pixel-identical to the CSS card, and the shader only does what
 * CSS cannot: rounded-corner masking, velocity deformation and the ripple.
 *
 * FALLBACK
 * This component renders NOTHING on the server and nothing without WebGL,
 * without a fine pointer, or under prefers-reduced-motion. The caller keeps the
 * original DOM marquee and hides it only once this reports it has taken over —
 * so the markup (and its alt text) is always present for crawlers and assistive
 * tech, and a visitor who cannot run this still sees the original strip.
 */

export type StripImage = {
  src: string
  alt: string
  tag: string
}

type Props = {
  images: readonly StripImage[]
  /** Card box in CSS pixels — must match .work-card for the swap to be seamless. */
  cardWidth: number
  cardHeight: number
  gap: number
  /** Seconds for one full traversal, mirroring the CSS animation duration. */
  durationSeconds: number
  reverse?: boolean
  /**
   * Fired ONLY after the canvas has actually rendered frames — never merely
   * because textures finished compositing. The caller hides its DOM fallback on
   * this signal, so promising it early is how the section ends up blank.
   */
  onPainted?: () => void
  /** Fired if WebGL gives up (context lost, or it never painted). */
  onFailed?: (reason: string) => void
}

const RADIUS = 16 // .work-card border-radius

// ---------------------------------------------------------------------------
// Card compositing
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed to load ${src}`))
    img.src = src
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Composited card canvases, cached across mount/unmount.
 *
 * Strips are mounted and unmounted as they enter and leave the viewport, so
 * without this, scrolling up and down re-decodes every image and re-draws every
 * card — 30-odd full-size canvas composites on the main thread, each time. The
 * canvases are cheap to keep and a texture can be rebuilt from one instantly.
 *
 * Keyed by source AND size, because the card box changes at the 640px
 * breakpoint and a texture composited at the wrong size would be soft.
 */
const cardCache = new Map<string, HTMLCanvasElement>()

/** Draws one card exactly as the CSS does, and hands back a texture. */
async function compositeCard(
  image: StripImage,
  w: number,
  h: number,
  dpr: number,
): Promise<THREE.CanvasTexture> {
  const key = `${image.src}|${image.tag}|${w}x${h}@${dpr}`
  const cached = cardCache.get(key)
  if (cached) {
    const t = new THREE.CanvasTexture(cached)
    t.colorSpace = THREE.SRGBColorSpace
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.generateMipmaps = false
    return t
  }

  const img = await loadImage(image.src)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.scale(dpr, dpr)

  // object-fit: cover
  const ir = img.naturalWidth / img.naturalHeight
  const cr = w / h
  let dw: number, dh: number
  if (ir > cr) {
    dh = h
    dw = h * ir
  } else {
    dw = w
    dh = w / ir
  }
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)

  // .work-card::after — linear-gradient(180deg, transparent 55%, rgba(10,10,14,.8))
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0.55, 'rgba(10,10,14,0)')
  grad.addColorStop(1, 'rgba(10,10,14,0.8)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // .work-tag
  const fontSize = 11.5
  ctx.font = `600 ${fontSize}px Sora, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  const textW = ctx.measureText(image.tag).width
  const padX = 14
  const padY = 6
  const pillH = fontSize + padY * 2 + 4
  const pillW = textW + padX * 2
  const pillX = 14
  const pillY = h - 14 - pillH

  ctx.fillStyle = 'rgba(10,10,14,0.6)'
  roundRect(ctx, pillX, pillY, pillW, pillH, 100)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#fff'
  ctx.fillText(image.tag, pillX + padX, pillY + pillH / 2 + 0.5)

  cardCache.set(key, canvas)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const VERT = /* glsl */ `
  uniform float uBend;
  uniform float uHover;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Bow the card along its length and skew it, both proportional to how fast
    // the page is being scrolled. Zero velocity means a perfectly flat card, so
    // at rest this is indistinguishable from the CSS version.
    float wave = sin(uv.x * 3.14159265);
    pos.y += wave * uBend * 26.0;
    pos.x += (uv.y - 0.5) * uBend * 34.0;

    // A card under the cursor comes very slightly forward.
    pos.z += uHover * 6.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform vec2  uSize;      // card size in px, for a correct corner radius
  uniform float uRadius;
  uniform float uHover;     // 0..1 eased
  uniform vec2  uHoverUv;   // cursor position in card uv space
  uniform float uTime;
  varying vec2 vUv;

  // Signed distance to a rounded rectangle, used to mask the corners so they
  // match .work-card's 16px radius instead of showing a hard quad edge.
  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    vec2 uv = vUv;

    // Ripple: a decaying wave pushed out from the cursor. Subtle on purpose —
    // enough to feel like the surface reacts, not enough to warp the product.
    if (uHover > 0.001) {
      vec2 d = uv - uHoverUv;
      float dist = length(d);
      float wave = sin(dist * 26.0 - uTime * 5.0) * exp(-dist * 7.0);
      uv += normalize(d + 1e-5) * wave * 0.018 * uHover;
    }

    vec4 col = texture2D(uMap, uv);

    // Warm the image very slightly on hover rather than brightening it flat.
    col.rgb = mix(col.rgb, col.rgb * vec3(1.06, 1.02, 1.0), uHover);

    vec2 p = (vUv - 0.5) * uSize;
    float sdf = roundedBox(p, uSize * 0.5, uRadius);
    float alpha = 1.0 - smoothstep(-1.0, 1.0, sdf);

    gl_FragColor = vec4(col.rgb, col.a * alpha);
  }
`

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

type CardProps = {
  texture: THREE.Texture
  width: number
  height: number
  index: number
  pitch: number
  total: number
  offset: React.RefObject<number>
  bend: React.RefObject<number>
  pointer: React.RefObject<{ x: number; y: number; inside: boolean }>
}

function Card({ texture, width, height, index, pitch, total, offset, bend, pointer }: CardProps) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const hover = useRef(0)

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uSize: { value: new THREE.Vector2(width, height) },
      uRadius: { value: RADIUS },
      uBend: { value: 0 },
      uHover: { value: 0 },
      uHoverUv: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 },
    }),
    [texture, width, height],
  )

  useFrame((_, delta) => {
    const m = material.current
    const g = mesh.current
    if (!m || !g) return

    // Position is derived here, on the mesh, rather than pushed down from React
    // state. Setting state in useFrame would re-render this whole strip 60
    // times a second for no benefit — the scene graph is the right place to
    // hold per-frame values.
    let x = index * pitch - (offset.current ?? 0)
    x = ((x % total) + total) % total
    x -= total / 2
    g.position.x = x

    m.uniforms.uBend.value = bend.current ?? 0
    m.uniforms.uTime.value += delta

    // Hover is resolved on the CPU against this card's box — cheaper and more
    // predictable than raycasting 40 quads every frame.
    const p = pointer.current
    let target = 0
    if (p?.inside) {
      const local = p.x - x
      if (Math.abs(local) < width / 2 && Math.abs(p.y) < height / 2) {
        target = 1
        m.uniforms.uHoverUv.value.set(local / width + 0.5, p.y / height + 0.5)
      }
    }
    const k = 1 - Math.pow(0.005, delta)
    hover.current += (target - hover.current) * k
    m.uniforms.uHover.value = hover.current
  })

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[width, height, 24, 2]} />
      <shaderMaterial
        ref={material}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

function Strip({
  textures,
  cardWidth,
  cardHeight,
  gap,
  durationSeconds,
  reverse,
  hostRef,
}: {
  textures: THREE.Texture[]
  cardWidth: number
  cardHeight: number
  gap: number
  durationSeconds: number
  reverse: boolean
  hostRef: React.RefObject<HTMLDivElement | null>
}) {
  const { size } = useThree()
  const offset = useRef(0)
  const bend = useRef(0)
  const lastScroll = useRef(0)
  const velocity = useRef(0)
  const pointer = useRef({ x: 0, y: 0, inside: false })

  const pitch = cardWidth + gap

  // Repeat the set until it comfortably exceeds the viewport, so the wrap point
  // is always off-screen. Same reason the CSS marquee duplicates its cards.
  const repeats = Math.max(2, Math.ceil((size.width * 2) / (textures.length * pitch)))
  const slots = textures.length * repeats
  const total = slots * pitch

  useEffect(() => {
    lastScroll.current = window.scrollY

    /**
     * Hover is tracked against the HOST element's box, not the canvas.
     * The canvas sits under `pointer-events: none` so that it never swallows
     * clicks meant for the page — which also means it is never returned by
     * elementFromPoint and can never be hit-tested directly.
     */
    const onMove = (e: PointerEvent) => {
      const host = hostRef.current
      if (!host) return
      const r = host.getBoundingClientRect()
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      pointer.current.inside = inside
      if (!inside) return
      pointer.current.x = e.clientX - r.left - r.width / 2
      pointer.current.y = -(e.clientY - r.top - r.height / 2)
    }
    const onLeave = () => {
      pointer.current.inside = false
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onLeave)
    }
  }, [hostRef])

  useFrame((_, delta) => {
    // A backgrounded tab hands back a huge delta on return; clamping stops the
    // strip teleporting when someone switches back.
    const d = Math.min(delta, 0.05)

    // Scroll velocity in px/s, smoothed. Read from window.scrollY so this behaves
    // identically whether or not Lenis is driving the scroll.
    const y = window.scrollY
    const raw = (y - lastScroll.current) / d
    lastScroll.current = y
    velocity.current += (raw - velocity.current) * (1 - Math.pow(0.002, d))

    const normalised = THREE.MathUtils.clamp(velocity.current / 2600, -1, 1)
    bend.current += (normalised - bend.current) * (1 - Math.pow(0.01, d))

    // Base marquee motion, matching the CSS duration, plus a nudge from scroll
    // so the strip visibly reacts to the page moving.
    const base = total / durationSeconds
    const dir = reverse ? -1 : 1
    offset.current += (base * dir + velocity.current * 0.32) * d
    offset.current = ((offset.current % total) + total) % total
  })

  return (
    <>
      {Array.from({ length: slots }, (_, i) => (
        <Card
          key={i}
          texture={textures[i % textures.length]}
          width={cardWidth}
          height={cardHeight}
          index={i}
          pitch={pitch}
          total={total}
          offset={offset}
          bend={bend}
          pointer={pointer}
        />
      ))}
    </>
  )
}

/**
 * Reports that the renderer is genuinely producing frames.
 *
 * Waits for a SECOND frame rather than the first: R3F invokes useFrame once as
 * part of setting the scene up, and a context that is going to fail can still
 * get that far. Two frames means a real, repeating render loop.
 */
function PaintProbe({ onPainted }: { onPainted: () => void }) {
  const frames = useRef(0)
  const done = useRef(false)

  useFrame(() => {
    if (done.current) return
    frames.current += 1
    if (frames.current >= 2) {
      done.current = true
      onPainted()
    }
  })

  return null
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function supported(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (window.matchMedia('(pointer: coarse)').matches) return false
  const cores = navigator.hardwareConcurrency
  if (typeof cores === 'number' && cores > 0 && cores <= 4) return false
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    if (!gl) return false
    ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export function WebGLStrip({
  images,
  cardWidth,
  cardHeight,
  gap,
  durationSeconds,
  reverse = false,
  onPainted,
  onFailed,
}: Props) {
  const [textures, setTextures] = useState<THREE.Texture[] | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!supported()) {
      onFailed?.('unsupported')
      return
    }
    let cancelled = false
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Wait for Sora before compositing, or the tag pill is drawn in a fallback
    // face and every card texture is subtly wrong.
    //
    // Raced against a timeout: document.fonts.ready can stay pending if a font
    // request stalls, and a hung promise here would mean the portfolio silently
    // never upgrades. Two seconds late with the right font, or on time with a
    // fallback face, both beat never rendering.
    const fontsReady: Promise<unknown> = document.fonts?.ready ?? Promise.resolve()
    const start = Promise.race([
      fontsReady,
      new Promise((resolve) => window.setTimeout(resolve, 2000)),
    ])

    start
      .then(() => Promise.all(images.map((img) => compositeCard(img, cardWidth, cardHeight, dpr))))
      .then((result) => {
        if (cancelled) {
          result.forEach((t) => t.dispose())
          return
        }
        setTextures(result)
        // NOT onPainted — textures existing says nothing about whether the
        // renderer works. That signal comes from <PaintProbe/> below.
      })
      .catch((error) => {
        // A texture failure must never blank the portfolio — the DOM strip stays.
        console.warn('[webgl-strip] texture compositing failed:', error)
        onFailed?.('texture-compositing')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, cardWidth, cardHeight])

  useEffect(() => {
    return () => {
      textures?.forEach((t) => t.dispose())
    }
  }, [textures])

  if (!textures) return null

  return (
    <div ref={hostRef} className="absolute inset-0" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <Canvas
        orthographic
        // near/far stated explicitly rather than relying on defaults: the cards
        // sit at z=0 and the camera at z=100, and a frustum that excludes them
        // renders a perfectly valid empty frame with no error anywhere.
        camera={{ position: [0, 0, 100], zoom: 1, near: 0.1, far: 1000 }}
        dpr={[1, 1.5]}
        // powerPreference 'default', NOT 'high-performance'. Asking for the
        // discrete GPU can fail outright on hybrid-graphics machines, and a
        // refused context is indistinguishable from a blank strip. This is a
        // decorative layer; it does not need the big GPU.
        gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          // A lost context leaves a transparent canvas behind. Tell the caller
          // so it can put the CSS marquee back rather than showing nothing.
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            console.warn('[webgl-strip] WebGL context lost; reverting to the CSS marquee')
            onFailed?.('context-lost')
          })
        }}
      >
        <PaintProbe onPainted={() => onPainted?.()} />
        <Strip
          textures={textures}
          hostRef={hostRef}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          gap={gap}
          durationSeconds={durationSeconds}
          reverse={reverse}
        />
      </Canvas>
    </div>
  )
}

export default WebGLStrip

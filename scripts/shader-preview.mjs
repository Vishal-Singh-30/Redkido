/**
 * Renders the hero fragment shader to a PNG on the CPU.
 *
 * WHY: the shader can only be judged by looking at it, and a headless
 * screenshot environment that refuses to execute JavaScript cannot run WebGL.
 * This is a faithful JS port of the GLSL in src/components/three/hero-scene.tsx
 * — same simplex noise, same domain warp, same palette, same masks — composited
 * over the page's off-white so the preview shows what a visitor would see.
 *
 * It is a design tool, not a test. If you edit the shader, edit this too or
 * delete it; a preview that has silently drifted from the shader is worse than
 * no preview.
 *
 *   node scripts/shader-preview.mjs [outfile] [width] [height] [time]
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

// ---- GLSL builtins ---------------------------------------------------------
const fract = (x) => x - Math.floor(x)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const mix = (a, b, t) => a + (b - a) * t
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
const mod289v3 = (v) => v.map((x) => x - Math.floor(x / 289) * 289)
const permute = (v) => mod289v3(v.map((x) => (x * 34 + 1) * x))

// ---- simplex noise (Ashima), ported 1:1 from the GLSL ----------------------
const C0 = 0.211324865405187
const C1 = 0.366025403784439
const C2 = -0.577350269189626
const C3 = 0.024390243902439

function snoise(vx, vy) {
  const s = (vx + vy) * C1
  let ix = Math.floor(vx + s)
  let iy = Math.floor(vy + s)

  const t0 = (ix + iy) * C0
  const x0x = vx - ix + t0
  const x0y = vy - iy + t0

  const i1x = x0x > x0y ? 1 : 0
  const i1y = x0x > x0y ? 0 : 1

  // x12 = x0.xyxy + C.xxzz  ->  (x0x+C0, x0y+C0, x0x+C2, x0y+C2), then .xy -= i1
  const x12x = x0x + C0 - i1x
  const x12y = x0y + C0 - i1y
  const x12z = x0x + C2
  const x12w = x0y + C2

  ix -= Math.floor(ix / 289) * 289
  iy -= Math.floor(iy / 289) * 289

  const pA = permute([iy + 0, iy + i1y, iy + 1])
  const p = permute([pA[0] + ix + 0, pA[1] + ix + i1x, pA[2] + ix + 1])

  let m = [
    Math.max(0.5 - (x0x * x0x + x0y * x0y), 0),
    Math.max(0.5 - (x12x * x12x + x12y * x12y), 0),
    Math.max(0.5 - (x12z * x12z + x12w * x12w), 0),
  ]
  m = m.map((v) => v * v)
  m = m.map((v) => v * v)

  const x = p.map((v) => 2 * fract(v * C3) - 1)
  const h = x.map((v) => Math.abs(v) - 0.5)
  const ox = x.map((v) => Math.floor(v + 0.5))
  const a0 = x.map((v, i) => v - ox[i])

  m = m.map((v, i) => v * (1.79284291400159 - 0.85373472095314 * (a0[i] * a0[i] + h[i] * h[i])))

  const gx = a0[0] * x0x + h[0] * x0y
  const gy = a0[1] * x12x + h[1] * x12y
  const gz = a0[2] * x12z + h[2] * x12w

  return 130 * (m[0] * gx + m[1] * gy + m[2] * gz)
}

function fbm(px, py) {
  let v = 0
  let a = 0.5
  let x = px
  let y = py
  for (let i = 0; i < 2; i++) {
    v += a * snoise(x, y)
    x *= 2.02
    y *= 2.02
    a *= 0.5
  }
  return v
}

// ---- palette (matches :root in globals.css) --------------------------------
const SAND = [0.969, 0.957, 0.937]
const RED = [0.91, 0.212, 0.169]
const RED_SOFT = [1.0, 0.365, 0.278]
const RED_DEEP = [0.549, 0.122, 0.122]
const mixv = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]

function shade(u, v, aspect, time) {
  let px = u * 2 - 1
  let py = v * 2 - 1
  px *= aspect

  const t = time * 0.035

  const qx = fbm(px * 0.30 + t, py * 0.30 + t)
  const qy = fbm(px * 0.30 + 4.3 - t, py * 0.30 + 1.7 - t)

  const rx = fbm(px * 0.26 + 0.55 * qx + 1.7 + t * 0.7, py * 0.26 + 0.55 * qy + 9.2 + t * 0.7)
  const ry = fbm(px * 0.26 + 0.55 * qx + 8.3 - t * 0.6, py * 0.26 + 0.55 * qy + 2.8 - t * 0.6)

  const f = fbm(px * 0.34 + 0.75 * rx, py * 0.34 + 0.75 * ry)
  const n = smoothstep(-0.55, 0.55, f)

  let col = mixv(SAND, RED_SOFT, smoothstep(0.3, 0.92, n))
  col = mixv(col, RED, smoothstep(0.55, 1.0, n) * 0.85)
  col = mixv(col, RED_DEEP, smoothstep(0.8, 1.05, n) * 0.35)

  const d = Math.hypot(px * 0.62, py * 1.05)
  const centre = smoothstep(0.2, 1.05, d)
  const edge = 1 - smoothstep(1.25, 1.95, d)
  const alpha = n * centre * edge * 0.85

  return [col, alpha]
}

// ---- PNG ------------------------------------------------------------------
const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(width, height, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // truecolour
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- render ----------------------------------------------------------------
const out = process.argv[2] ?? 'docs/screenshots/hero-shader-preview.png'
const W = Number(process.argv[3] ?? 720)
const H = Number(process.argv[4] ?? 420)
const TIME = Number(process.argv[5] ?? 18)
const aspect = W / H

// The page behind the canvas is white; alpha-composite so the preview shows
// what actually reaches the eye rather than the raw shader output.
const PAGE = [1, 1, 1]

const buf = Buffer.alloc(W * H * 3)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W
    const v = 1 - (y + 0.5) / H
    const [col, a] = shade(u, v, aspect, TIME)
    const o = (y * W + x) * 3
    for (let c = 0; c < 3; c++) {
      buf[o + c] = Math.round(clamp(mix(PAGE[c], col[c], a), 0, 1) * 255)
    }
  }
}

writeFileSync(out, png(W, H, buf))
console.log(`wrote ${out}  ${W}x${H}  t=${TIME}`)

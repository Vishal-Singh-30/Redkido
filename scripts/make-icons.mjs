/**
 * Rasterises the favicon mark to PNG.
 *
 * src/app/icon.svg is the source of truth and covers every modern browser.
 * This exists for the two places an SVG is not accepted:
 *   - apple-icon.png, which iOS requires as a raster for "Add to Home Screen"
 *   - a preview to actually look at before shipping
 *
 * Same geometry as the SVG — rounded tile, diagonal red gradient, white dot —
 * drawn directly rather than through a rendering library, and supersampled 4x
 * for clean edges. If you change icon.svg, change this too.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t)

// globals.css: --red-2, --red, and a deepened --red
const C0 = [255, 93, 71]
const C1 = [232, 54, 43]
const C2 = [168, 36, 28]
const WHITE = [255, 255, 255]

/** Signed distance to a rounded rectangle, negative inside. */
function sdRoundRect(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r
  const qy = Math.abs(py) - halfH + r
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return Math.min(Math.max(qx, qy), 0) + outside - r
}

function render(size) {
  const SS = 4 // supersample factor
  const px = new Float64Array(size * size * 4)
  const S = size * SS
  const radius = 0.2266 * S // 116/512, matching the SVG
  const dotR = 0.2578 * S //  132/512

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = x + 0.5 - S / 2
      const cy = y + 0.5 - S / 2

      const tile = sdRoundRect(cx, cy, S / 2, S / 2, radius)
      const tileA = clamp01(0.5 - tile) // 1px feather

      // diagonal gradient, matching the SVG's x1,y1 -> x2,y2
      const t = clamp01((x / S + y / S) / 2)
      let col = t < 0.55 ? mix(C0, C1, t / 0.55) : mix(C1, C2, (t - 0.55) / 0.45)

      const dot = Math.hypot(cx, cy) - dotR
      const dotA = clamp01(0.5 - dot)
      col = mix(col, WHITE, dotA)

      // accumulate into the destination pixel
      const dx = Math.floor(x / SS)
      const dy = Math.floor(y / SS)
      const o = (dy * size + dx) * 4
      px[o] += col[0] * tileA
      px[o + 1] += col[1] * tileA
      px[o + 2] += col[2] * tileA
      px[o + 3] += 255 * tileA
    }
  }

  const n = SS * SS
  const out = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size * 4; i++) out[i] = Math.round(px[i] / n)
  return out
}

// ---- PNG (RGBA) ----
const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
const crc32 = (b) => {
  let c = -1
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
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
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [file, size] of [
  ['src/app/apple-icon.png', 180],
  ['docs/screenshots/favicon-preview-64.png', 64],
  ['docs/screenshots/favicon-preview-16.png', 16],
]) {
  writeFileSync(file, png(size, render(size)))
  console.log(`wrote ${file}  ${size}x${size}`)
}

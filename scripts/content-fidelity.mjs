/**
 * Mechanical check that no user-facing string from the original HTML was lost,
 * reworded, or silently re-punctuated during the conversion.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CLEAN = process.argv[2]
const html = readFileSync(CLEAN, 'utf8')

// Concatenate every content module + site config.
const dir = join('src', 'content')
let corpus = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
corpus += readFileSync(join('src', 'config', 'site.ts'), 'utf8')

const norm = (s) =>
  s.replace(/\'/g, "'").replace(/\\"/g, '"').replace(/\n/g, ' ')
   .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'")
   .replace(/\s+/g, ' ').trim()

const normCorpus = norm(corpus)

// Strip script/style, then take the text of every leaf-ish element.
const body = html.slice(html.indexOf('<body'))
const stripped = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
const texts = stripped
  .split(/<[^>]+>/)
  .map(norm)
  .filter((t) => t.length >= 12 && /[a-z]{3}/i.test(t))

const seen = new Set()
const missing = []
for (const t of texts) {
  if (seen.has(t)) continue
  seen.add(t)
  if (!normCorpus.includes(t)) missing.push(t)
}

console.log(`distinct user-facing strings in original: ${seen.size}`)
console.log(`present in src/content or src/config:     ${seen.size - missing.length}`)
if (missing.length) {
  console.log(`\nMISSING (${missing.length}):`)
  missing.forEach((m) => console.log('  - ' + (m.length > 110 ? m.slice(0, 110) + '...' : m)))
} else {
  console.log('\nALL ORIGINAL COPY ACCOUNTED FOR')
}

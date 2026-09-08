/**
 * Brute-force verification of the GST invariant and the place-of-supply rule.
 * Not a unit-test suite — a proof by exhaustion over the ranges that matter.
 */
import { computeGst, resolvePlaceOfSupply, isValidGstin, normalizeStateCode } from '../src/lib/tax'
import { siteConfig } from '../src/config/site'

let checked = 0
const failures: string[] = []

function check(total: number, pos: ReturnType<typeof resolvePlaceOfSupply>, tag: string) {
  const b = computeGst(total, pos)
  checked++
  const sum = b.taxablePaise + b.cgstPaise + b.sgstPaise + b.igstPaise
  if (sum !== b.totalPaise) failures.push(`[${tag}] total=${total} sum=${sum} != ${b.totalPaise}`)
  if (b.totalPaise !== total) failures.push(`[${tag}] total mutated: ${total} -> ${b.totalPaise}`)
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number' && !Number.isInteger(v)) failures.push(`[${tag}] ${k} not integer: ${v}`)
    if (typeof v === 'number' && v < 0) failures.push(`[${tag}] ${k} negative: ${v}`)
  }
  if (b.isInterState && (b.cgstPaise !== 0 || b.sgstPaise !== 0)) failures.push(`[${tag}] IGST supply carries CGST/SGST @${total}`)
  if (!b.isInterState && b.igstPaise !== 0 && siteConfig.tax.registered) failures.push(`[${tag}] intra-state supply carries IGST @${total}`)
  if (!b.isInterState && Math.abs(b.cgstPaise - b.sgstPaise) > 1) failures.push(`[${tag}] CGST/SGST split off by >1 paisa @${total}`)
  return b
}

const intra = resolvePlaceOfSupply({ clientStateCode: '09' })
const inter = resolvePlaceOfSupply({ clientStateCode: '27' })

for (let p = 1; p <= 30000; p++) { check(p, intra, 'intra'); check(p, inter, 'inter') }
for (const p of [100, 250000, 500000, 1500000, 99999999, 1, 3, 7, 99, 12345, 2500_00]) {
  check(p, intra, 'intra-spot'); check(p, inter, 'inter-spot')
}

// --- place of supply rule table ---
const cases: [string, ReturnType<typeof resolvePlaceOfSupply>, string, boolean][] = [
  ['B2B in-state (UP GSTIN)',   resolvePlaceOfSupply({ clientGstin: '09AAACR5055K1Z5' }), '09', false],
  ['B2B out-of-state (MH)',     resolvePlaceOfSupply({ clientGstin: '27AAACR5055K1Z7' }), '27', true],
  ['B2C state captured (DL)',   resolvePlaceOfSupply({ clientStateCode: '07' }),          '07', true],
  ['B2C state captured (UP)',   resolvePlaceOfSupply({ clientStateCode: '09' }),          '09', false],
  ['B2C nothing captured',      resolvePlaceOfSupply({}),                                  '09', false],
  ['GSTIN beats dropdown',      resolvePlaceOfSupply({ clientStateCode: '09', clientGstin: '27AAACR5055K1Z7' }), '27', true],
]
console.log('\nplace of supply:')
for (const [label, pos, expectState, expectInter] of cases) {
  const ok = pos.placeOfSupplyStateCode === expectState && pos.isInterState === expectInter
  if (!ok) failures.push(`POS "${label}": got ${pos.placeOfSupplyStateCode}/${pos.isInterState}, want ${expectState}/${expectInter}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(26)} -> ${pos.placeOfSupplyStateCode} ${pos.isInterState ? 'IGST' : 'CGST+SGST'}  [${pos.basis}]`)
}

console.log('\ngstin validation:')
for (const [g, want] of [['09AAACR5055K1Z5', true], ['27AAACR5055K1Z7', true], ['09AAACR5055K1Z4', false], ['27AAACR5055K1Z5', false], ['99AAACR5055K1Z5', false], ['garbage', false], ['', false]] as [string, boolean][]) {
  const got = isValidGstin(g)
  if (got !== want) failures.push(`GSTIN "${g}": got ${got}, want ${want}`)
  console.log(`  ${got === want ? 'PASS' : 'FAIL'}  ${(g || '(empty)').padEnd(18)} -> ${got}`)
}

const sample = computeGst(250000, inter)
console.log(`\nsample  Rs2,500 inter-state: taxable=${sample.taxablePaise} igst=${sample.igstPaise} total=${sample.totalPaise}`)
const sample2 = computeGst(250000, intra)
console.log(`sample  Rs2,500 intra-state: taxable=${sample2.taxablePaise} cgst=${sample2.cgstPaise} sgst=${sample2.sgstPaise} total=${sample2.totalPaise}`)

console.log(`\nchecked ${checked} amounts.`)
if (failures.length) { console.log(`FAILURES (${failures.length}):`); failures.slice(0, 25).forEach((f) => console.log('  ' + f)); process.exit(1) }
console.log('ALL INVARIANTS HOLD')

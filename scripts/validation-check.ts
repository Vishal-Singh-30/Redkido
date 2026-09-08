import { bookingInput } from '../src/lib/validation'

const base = {
  name: 'Test Client', email: 'a@b.com', phone: '9876543210',
  slotId: 'clx000000000000000000000', consultationSlug: 'discovery-call',
}
const cases: [string, Record<string, unknown>, boolean][] = [
  ['no state, no gstin',        { ...base }, true],
  ['blank state',               { ...base, clientStateCode: '' }, true],
  ['valid state "07"',          { ...base, clientStateCode: '07' }, true],
  ['unpadded state "9"',        { ...base, clientStateCode: '9' }, true],
  ['GARBAGE state "XX"',        { ...base, clientStateCode: 'XX' }, false],
  ['"99" = Centre Jurisdiction', { ...base, clientStateCode: '99' }, true],
  ['nonexistent state "88"',    { ...base, clientStateCode: '88' }, false],
  ['valid gstin',               { ...base, clientGstin: '27AAACR5055K1Z7' }, true],
  ['GARBAGE gstin',             { ...base, clientGstin: 'NOTAGSTIN' }, false],
  ['bad check digit gstin',     { ...base, clientGstin: '27AAACR5055K1Z5' }, false],
  ['INJECTED price field',      { ...base, pricePaise: 1 }, false],
  ['INJECTED amount field',     { ...base, amount: 1 }, false],
]
let bad = 0
for (const [label, input, shouldPass] of cases) {
  const r = bookingInput.safeParse(input)
  const ok = r.success === shouldPass
  if (!ok) bad++
  const norm = r.success ? ` -> state=${r.data.clientStateCode ?? '-'} gstin=${r.data.clientGstin ?? '-'}` : ''
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(24)} accepted=${r.success}${norm}`)
}
console.log(bad === 0 ? '\nALL VALIDATION CASES CORRECT' : `\n${bad} FAILURES`)
process.exit(bad === 0 ? 0 : 1)

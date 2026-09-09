/**
 * The booking request schema is .strict(), so anything the client invents is a
 * rejection rather than a silently ignored key. That mattered a great deal when
 * this flow took money; it still matters now, because it is the difference
 * between "the server decides" and "the client suggests".
 */
import { bookCallInput, enquiryInput, isHoneypotTripped } from '../src/lib/validation'

const base = {
  name: 'Test Client',
  email: 'a@b.com',
  phone: '9876543210',
  slotId: 'clx000000000000000000000',
  consent: true as const,
}

const cases: [string, Record<string, unknown>, boolean][] = [
  ['minimal valid booking', { ...base }, true],
  ['with company + message', { ...base, company: 'Acme', message: 'Site audit' }, true],
  ['missing consent', { ...base, consent: undefined }, false],
  ['consent false', { ...base, consent: false }, false],
  ['no slot', { ...base, slotId: '' }, false],
  ['bad email', { ...base, email: 'nope' }, false],
  ['bad phone', { ...base, phone: 'call me' }, false],
  // The whole point of .strict(): a client cannot smuggle in fields the server
  // never asked for, whether that is a price, a status, or someone else's id.
  ['INJECTED price', { ...base, pricePaise: 1 }, false],
  ['INJECTED amount', { ...base, amount: 0 }, false],
  ['INJECTED status', { ...base, status: 'CONFIRMED' }, false],
  ['INJECTED leadId', { ...base, leadId: 'someone-else' }, false],
]

function main() {
  let bad = 0

  console.log('booking input:')
  for (const [label, input, shouldPass] of cases) {
    const r = bookCallInput.safeParse(input)
    const ok = r.success === shouldPass
    if (!ok) bad++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(24)} accepted=${r.success}`)
  }

  console.log('\nhoneypot:')
  for (const [label, input, want] of [
    ['empty', {}, false],
    ['blank string', { website: '   ' }, false],
    ['filled by a bot', { website: 'http://spam' }, true],
  ] as [string, { website?: string }, boolean][]) {
    const got = isHoneypotTripped(input)
    const ok = got === want
    if (!ok) bad++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(24)} tripped=${got}`)
  }

  console.log('\nenquiry input:')
  const enq = enquiryInput.safeParse({
    name: 'Test',
    email: 'a@b.com',
    message: 'Hello there, this is a genuine enquiry about your services.',
    consent: true,
  })
  console.log(`  ${enq.success ? 'PASS' : 'FAIL'}  valid enquiry accepted=${enq.success}`)
  if (!enq.success) {
    bad++
    console.log('   ', JSON.stringify(enq.error.issues.slice(0, 3)))
  }

  console.log(bad === 0 ? '\nALL VALIDATION CASES CORRECT' : `\n${bad} FAILURES`)
  process.exit(bad === 0 ? 0 : 1)
}

main()

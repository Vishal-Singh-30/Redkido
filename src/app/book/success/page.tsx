/**
 * /book/success — the confirmation.
 *
 * Deliberately reads NOTHING from the database. The confirmed time arrives in
 * the query string because the browser already knew it: it picked the session.
 * Looking a booking up by an unauthenticated id to print its details back out
 * would turn a thank-you page into a lookup endpoint, and there is no id here
 * to look one up with — /api/book does not return one, which is also what lets
 * a real booking and a discarded bot submission get byte-identical responses.
 *
 * So `at` and `until` are display only, and untrusted: they are parsed, and
 * anything that is not a real instant simply renders the fallback line. The
 * confirmation email is the record; this page is the receipt.
 *
 * It is excluded from search indexes — a confirmation has no business in
 * results.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'
import { Icon } from '@/components/site/Icons'
import { bookingContent } from '@/content/booking'
import { formatSlotLabel, formatSlotStart } from '@/lib/slots'

const { success } = bookingContent

export const metadata: Metadata = {
  title: success.title,
  description: success.body,
  robots: { index: false, follow: false },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? ''
  return value?.trim() ?? ''
}

/** A query parameter is whatever the URL bar contains. Trust nothing about it. */
function parseInstant(value: string): Date | null {
  if (value.length === 0) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * "Tue, 14 Apr, 10:00 – 10:45 am GMT+5:30", formatted in Asia/Kolkata by the
 * same helper the picker's labels come from — so the line on this page and the
 * line the visitor clicked are produced by one formatter, not two that agree by
 * luck.
 */
function formatWhen(at: Date | null, until: Date | null): string | null {
  if (at === null) return null
  if (until === null || until.getTime() <= at.getTime()) return formatSlotStart(at)
  return formatSlotLabel(at, until)
}

export default async function BookingSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams
  const when = formatWhen(parseInstant(firstValue(params.at)), parseInstant(firstValue(params.until)))

  return (
    <>
      <Header />
      <main id="top">
        <section>
          <div className="wrap">
            <div className="mx-auto max-w-[720px] text-center">
              <div className="kicker">{success.kicker}</div>
              <h1 className="text-[clamp(32px,4.6vw,52px)]">{success.title}</h1>

              <div className="mx-auto mt-8 flex max-w-[520px] items-center justify-center gap-3 rounded-card border border-line bg-card p-5 shadow-[0_2px_10px_rgba(20,10,10,0.05)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-red/10 text-red">
                  <Icon className="h-4 w-4" name="calendar" />
                </span>
                <div className="text-left">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-2">
                    {success.whenLabel}
                  </p>
                  <p className="mt-1 font-display text-[15.5px] font-bold">
                    {when ?? success.whenUnknown}
                  </p>
                </div>
              </div>

              <p className="mx-auto mt-7 max-w-[52ch] text-[16.5px] text-muted">{success.body}</p>

              <Link className="btn mt-9" href="/">
                {success.action}
              </Link>
            </div>

            <div className="mx-auto mt-14 grid max-w-[860px] gap-5 md:grid-cols-2">
              <article className="problem-card">
                <h2 className="font-display text-[16px]">{success.nextTitle}</h2>
                <ol className="mt-4 flex list-none flex-col gap-3 p-0 text-[14px] text-muted">
                  {success.next.map((step, index) => (
                    <li className="flex items-start gap-3" key={step}>
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red/10 text-[11px] font-bold text-red">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </article>

              <article className="problem-card">
                <h2 className="font-display text-[16px]">{success.rescheduleTitle}</h2>
                <p className="mt-3 text-[14px] text-muted">{success.rescheduleBody}</p>
              </article>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

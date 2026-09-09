/**
 * /book — the free-call booking page. This is the product.
 *
 * ── WHAT IT RENDERS ON THE SERVER, AND WHY ──────────────────────────────────
 * The day strip and the first day's times are fetched here, not in the browser,
 * so the page arrives complete: no spinner on first paint, no picker that only
 * exists once a bundle has run, and a crawler that sees the real times.
 *
 * `?date=` is part of that contract rather than a nicety. Without JavaScript the
 * day chips are ordinary links, and this is the handler for them — the day is
 * validated against what is actually open and rendered server-side. With
 * JavaScript the picker switches days in place and keeps the same parameter in
 * the URL, so a refresh or a shared link lands where the visitor was.
 *
 * `?error=` is the other half of the no-JavaScript path: /api/book answers a
 * native form post with a 303 back to here carrying a machine code, which is
 * turned into a sentence below. The codes are protocol; the sentences are copy,
 * and copy lives in src/content/booking.ts.
 *
 * Availability is database state that changes whenever anybody books, so this
 * page is never static and never cached.
 */

import type { Metadata } from 'next'
import { BookingForm } from '@/components/forms/BookingForm'
import { Reveal } from '@/components/motion/reveal'
import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'
import { Icon } from '@/components/site/Icons'
import { bookingContent } from '@/content/booking'
import { listAvailableDays, listSessionsForDate } from '@/lib/slots'

/** Slot availability is per-request state; it must never be statically evaluated. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: bookingContent.meta.title,
  description: bookingContent.meta.description,
  alternates: { canonical: '/book' },
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** A query parameter can arrive repeated. Take the first, ignore the rest. */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? ''
  return value?.trim() ?? ''
}

/**
 * Machine code from /api/book -> the sentence shown above the form. Anything
 * unrecognised falls back to the generic message: a hand-edited URL must not be
 * able to put arbitrary text on the page.
 */
function messageForError(code: string): string | null {
  if (code.length === 0) return null
  const { errors } = bookingContent
  switch (code) {
    case 'SLOT_TAKEN':
      return errors.slot.taken
    case 'SLOT_PAST':
      return errors.slot.past
    case 'SLOT_UNAVAILABLE':
      return errors.slot.unavailable
    case 'VALIDATION':
      return errors.form.validation
    default:
      return errors.form.generic
  }
}

export default async function BookPage({ searchParams }: PageProps) {
  const params = await searchParams
  const days = await listAvailableDays()

  /**
   * The requested day is only honoured if it is a day we actually have
   * something open on; otherwise the page falls back to the first day with
   * sessions, which is where a visitor with no opinion should start.
   */
  const requested = firstValue(params.date)
  const selectedDate = days.some((day) => day.date === requested)
    ? requested
    : (days[0]?.date ?? '')

  const sessions = selectedDate.length > 0 ? await listSessionsForDate(selectedDate) : []

  const { hero } = bookingContent
  const initialError = messageForError(firstValue(params.error))

  return (
    <>
      <Header />
      <main id="top">
        <section>
          <div className="wrap">
            <Reveal className="kicker" style={{ justifyContent: 'flex-start' }}>
              {hero.kicker}
            </Reveal>

            <Reveal delay={70}>
              {/*
                The one thing a returning visitor is looking for, said first.
                `.eyebrow` and `.pulse` are the original site's own classes, so
                this badge is the same pill the hero uses — and its margin comes
                from that unlayered CSS, which no Tailwind utility could
                override anyway.
              */}
              <p className="eyebrow">
                <span className="pulse" />
                {hero.badge}
              </p>
              <h1 className="max-w-[18ch] text-[clamp(30px,4vw,46px)]">{hero.heading}</h1>
              <p className="mt-5 max-w-[58ch] text-[17px] text-muted">{hero.sub}</p>
            </Reveal>

            <noscript>
              <div className="mt-8 max-w-[58ch] rounded-card border border-dashed border-line-strong bg-bg-2 p-5">
                <p className="text-[13.5px] font-semibold">{bookingContent.noscript.title}</p>
                <p className="mt-2 text-[13px] text-muted">{bookingContent.noscript.body}</p>
                <a className="mt-3 inline-block text-[13px] font-semibold text-red" href={bookingContent.noscript.href}>
                  {bookingContent.noscript.action}
                </a>
              </div>
            </noscript>

            <div className="mt-12 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <BookingForm
                days={days}
                initialDate={selectedDate}
                initialError={initialError}
                initialSessions={sessions}
              />

              {/*
                Sticky on desktop so the reassurance stays beside the form while
                the picker and the details are worked through. Same shadow as
                the form card, so the two read as one surface.
              */}
              <aside className="rounded-card border border-line bg-card-2 p-6 shadow-[0_2px_10px_rgba(20,10,10,0.05)] lg:sticky lg:top-28">
                <ul className="m-0 flex list-none flex-col gap-6 p-0">
                  {hero.assurances.map((assurance) => (
                    <li className="flex items-start gap-3" key={assurance.title}>
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-red/10 text-red">
                        <Icon className="h-4 w-4" name={assurance.icon} />
                      </span>
                      <div>
                        <p className="font-display text-[14px] font-bold">{assurance.title}</p>
                        <p className="mt-1.5 text-[13px] leading-[1.6] text-muted">
                          {assurance.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

/**
 * Post-payment confirmation.
 *
 * Deliberately reads NOTHING from the database. The booking id in the query
 * string is not proof of anything — it is just the last URL the browser was
 * pushed to — and looking a booking up by an unauthenticated id to print its
 * details back out would turn a thank-you page into a lookup endpoint. The
 * confirmation email is the record; this page is the receipt of intent.
 *
 * It is also excluded from search indexes: a payment confirmation has no
 * business appearing in results.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'
import { bookingForm, type SuccessCopy } from '@/content/forms'
import { policies } from '@/content/policies'

const success: SuccessCopy = bookingForm.success

export const metadata: Metadata = {
  title: success.title,
  description: success.body,
  robots: { index: false, follow: false },
}

export default function ConsultationSuccessPage() {
  return (
    <>
      <Header />
      <main id="top">
        <section>
          <div className="wrap">
            <div className="mx-auto max-w-[720px] text-center">
              <div className="kicker">{bookingForm.kicker}</div>
              <h1 className="text-[clamp(32px,4.6vw,52px)]">{success.title}</h1>
              <p className="mx-auto mt-6 max-w-[52ch] text-[17px] text-muted">{success.body}</p>

              {success.action ? (
                <Link className="btn mt-9" href="/">
                  {success.action}
                </Link>
              ) : null}
            </div>

            <div className="mx-auto mt-14 max-w-[720px]">
              <article className="problem-card">
                <h2 className="font-display text-[16px]">{policies.reschedule.title}</h2>
                <p className="mt-3 text-[14px] text-muted">{policies.reschedule.body}</p>
              </article>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

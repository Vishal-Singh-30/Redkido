/**
 * The paid consultation catalogue.
 *
 * Every figure on this page comes from listConsultations() — the same resolver
 * src/app/api/checkout bills from — so the price advertised here and the price
 * charged at checkout are one value read twice, not two values maintained in
 * two places. Nothing here is authored copy: the catalogue is database rows and
 * the surrounding text is src/content/consultations.ts.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { EnquiryForm } from '@/components/forms/EnquiryForm'
import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'
import { bookingForm } from '@/content/forms'
import { consultationsIntro } from '@/content/consultations'
import { formatINR } from '@/lib/money'
import { listConsultations } from '@/lib/pricing'

/** Prices and availability are database state; this page is never static. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: consultationsIntro.kicker,
  description: consultationsIntro.sub,
  alternates: { canonical: '/consultation' },
}

export default async function ConsultationCataloguePage() {
  const consultations = await listConsultations()
  const summary = bookingForm.summary

  return (
    <>
      <Header />
      <main id="top">
        <section>
          <div className="wrap">
            <div className="kicker">{consultationsIntro.kicker}</div>
            <div className="sec-head-c">
              <h1 className="text-[clamp(30px,4vw,46px)]">{consultationsIntro.heading}</h1>
              <p>{consultationsIntro.sub}</p>
            </div>

            {consultations.length > 0 ? (
              <>
                <div className="price-grid">
                  {consultations.map((consultation) => (
                    <article className="price-card" key={consultation.slug}>
                      <h3>{consultation.name}</h3>
                      <p className="desc">
                        {consultation.durationMins} {summary.durationUnit}
                      </p>
                      <div className="fee">{formatINR(consultation.pricePaise)}</div>
                      <p className="mt-6 flex-1 text-[14.5px] text-muted">{consultation.summary}</p>
                      <Link
                        className="btn mt-7"
                        href={`/consultation/${consultation.slug}`}
                        style={{ justifyContent: 'center' }}
                      >
                        {bookingForm.kicker}
                      </Link>
                    </article>
                  ))}
                </div>
                <p className="mt-8 text-center text-[13px] text-muted-2">
                  {summary.inclusiveNote}
                </p>
              </>
            ) : (
              /*
               * Nothing bookable — an unseeded catalogue, or every session
               * retired. Rather than an empty page, fall back to the free
               * funnel so the visit still goes somewhere.
               */
              <div className="mx-auto max-w-[720px]">
                <EnquiryForm />
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

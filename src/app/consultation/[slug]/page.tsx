/**
 * The booking page for one consultation.
 *
 * The breakdown rendered here comes from quoteConsultation() — the SAME
 * resolver src/app/api/checkout prices with — so what is advertised and what is
 * charged cannot drift apart.
 *
 * The place of supply shown is the DEFAULT one: no client state is known until
 * the form is filled in, so tax.ts falls back to the supplier's own state
 * (IGST Act s.12(2), "no address on record") and the breakdown shows CGST+SGST.
 * Choosing a billing state in the form can move it to IGST. The TOTAL never
 * changes either way — prices are tax-inclusive, so the state decides how the
 * total is split between heads, not what is paid.
 *
 * ── WHEN NO TAX IS CHARGED ──────────────────────────────────────────────────
 *
 * A supplier who is not GST-registered may not issue a customer-facing document
 * that names a tax head, states a rate, or quotes a SAC — printing "CGST 0%"
 * next to a SAC code asserts a registration that does not exist, which is worse
 * than getting a head wrong. So when the breakdown carries no tax, this page
 * shows the TOTAL and nothing else: no taxable value, no CGST/SGST/IGST, no SAC,
 * no place of supply, no "inclusive of GST" note.
 *
 * The test is `gst.gstRatePercent === 0`, read off the BREAKDOWN and never by
 * re-reading siteConfig here. The breakdown is what was actually quoted and
 * charged; a registered supplier in this business always charges the full 18%,
 * so a zero combined rate is exactly the unregistered case, and a page rendered
 * from a stored breakdown keeps matching the way it was billed even if the
 * registration status changes later.
 *
 * `params` is async in Next 16 and must be awaited before it is read.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookingForm } from '@/components/forms/BookingForm'
import { Reveal } from '@/components/motion/reveal'
import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'
import { bookingForm } from '@/content/forms'
import { policies } from '@/content/policies'
import { formatINR } from '@/lib/money'
import { quoteConsultation, resolveConsultation } from '@/lib/pricing'
import { listAvailableSlots } from '@/lib/slots'
import { cgstSgstRatePercent, stateNameForCode } from '@/lib/tax'

/** Prices and slot availability are database state; this page is never static. */
export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const consultation = await resolveConsultation(slug)
  if (consultation === null) return {}

  return {
    title: consultation.name,
    description: consultation.summary,
    alternates: { canonical: `/consultation/${consultation.slug}` },
  }
}

function SummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div
      className={
        emphasis
          ? 'flex items-baseline justify-between gap-4 border-t border-line pt-4 text-[15px] font-semibold'
          : 'flex items-baseline justify-between gap-4 text-[14px]'
      }
    >
      <span className={emphasis ? '' : 'text-muted'}>{label}</span>
      <span className={emphasis ? 'font-display text-[20px]' : ''}>{value}</span>
    </div>
  )
}

export default async function ConsultationBookingPage({ params }: PageProps) {
  const { slug } = await params

  // No client state is known yet, so this is the default place of supply.
  const quote = await quoteConsultation({ slug })
  if (quote === null) notFound()

  const { consultation, gst } = quote
  const slots = await listAvailableSlots(consultation.id)

  const summary = bookingForm.summary

  // Was tax actually charged on THIS quote? See the header note — breakdown only.
  const taxCharged = gst.gstRatePercent !== 0
  const halfRate = cgstSgstRatePercent(gst)
  const placeOfSupply =
    stateNameForCode(gst.placeOfSupplyStateCode) ?? gst.placeOfSupplyStateCode

  return (
    <>
      <Header />
      <main id="top">
        <section>
          <div className="wrap">
            <Reveal className="kicker" style={{ justifyContent: 'flex-start' }}>
              {bookingForm.kicker}
            </Reveal>
            <Reveal delay={70}>
              <h1 className="max-w-[18ch] text-[clamp(30px,4vw,46px)]">{consultation.name}</h1>
              <p className="mt-5 max-w-[58ch] text-[17px] text-muted">{consultation.summary}</p>
            </Reveal>

            <div className="mt-12 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <BookingForm
                consultationName={consultation.name}
                consultationSlug={consultation.slug}
                initialSlots={slots}
                totalPaise={gst.totalPaise}
              />

              {/*
                Sticky on desktop so the number being paid stays in view while
                the picker and the details are worked through. Same shadow as
                the form card beside it, so the two read as one surface.
              */}
              <aside className="rounded-card border border-line bg-card-2 p-7 shadow-[0_2px_10px_rgba(20,10,10,0.05)] lg:sticky lg:top-28">
                <h2 className="font-display text-[17px]">{summary.title}</h2>

                <div className="mt-5 flex flex-col gap-3">
                  <SummaryRow label={summary.session} value={consultation.name} />
                  <SummaryRow
                    label={summary.duration}
                    value={`${consultation.durationMins} ${summary.durationUnit}`}
                  />
                  {taxCharged ? (
                    <>
                      <SummaryRow label={summary.taxable} value={formatINR(gst.taxablePaise)} />

                      {gst.isInterState ? (
                        <SummaryRow
                          label={`${summary.igst} ${gst.gstRatePercent}%`}
                          value={formatINR(gst.igstPaise)}
                        />
                      ) : (
                        <>
                          <SummaryRow
                            label={`${summary.cgst} ${halfRate}%`}
                            value={formatINR(gst.cgstPaise)}
                          />
                          <SummaryRow
                            label={`${summary.sgst} ${halfRate}%`}
                            value={formatINR(gst.sgstPaise)}
                          />
                        </>
                      )}
                    </>
                  ) : null}

                  <SummaryRow emphasis label={summary.total} value={formatINR(gst.totalPaise)} />
                </div>

                {taxCharged ? (
                  <>
                    <dl className="mt-6 flex flex-col gap-1 border-t border-line pt-4 text-[12.5px] text-muted-2">
                      <div className="flex justify-between gap-3">
                        <dt>{summary.sacNote}</dt>
                        <dd>{gst.sacCode}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>{summary.placeOfSupply}</dt>
                        <dd>{placeOfSupply}</dd>
                      </div>
                    </dl>

                    <p className="mt-4 text-[12.5px] text-muted-2">{summary.inclusiveNote}</p>
                  </>
                ) : null}
              </aside>
            </div>

            {/* Referred to by the consent line inside the form. */}
            <div className="mt-14 grid gap-4 md:grid-cols-2">
              {[policies.reschedule, policies.refund].map((policy, index) => (
                <Reveal as="article" className="problem-card" delay={index * 70} key={policy.title}>
                  <h3 className="font-display text-[16px]">{policy.title}</h3>
                  <p className="mt-3 text-[14px] text-muted">{policy.body}</p>
                </Reveal>
              ))}
            </div>

            <p className="mt-10 text-[13.5px]">
              <Link className="text-muted underline underline-offset-4" href="/consultation">
                {bookingForm.backToCatalogue}
              </Link>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

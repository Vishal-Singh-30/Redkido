import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/money'
import { siteConfig } from '@/config/site'
import { updateLeadAction } from '@/app/admin/actions'
import {
  BookingStatusBadge,
  DataGrid,
  DataRow,
  KindBadge,
  LEAD_STATUSES,
  Notice,
  PageHeader,
  Panel,
  adminCopy,
  formatDateTime,
  formatText,
} from '@/components/admin/shell'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/**
 * The booking stores the place-of-supply COLUMNS, not a sentence. This renders
 * the sentence from those columns so the CA can read the reasoning next to the
 * evidence — see adminCopy.leadDetail.tax.derivedWarning.
 */
function placeOfSupplyBasis(booking: { clientGstin: string | null; clientStateCode: string | null }): string {
  const copy = adminCopy.leadDetail.tax
  if (booking.clientGstin && booking.clientGstin.trim().length > 0) return copy.basisRegistered
  if (booking.clientStateCode && booking.clientStateCode.trim().length > 0) return copy.basisAddressOnRecord
  return copy.basisSupplierLocation
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  // params and searchParams are async in Next 16.
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const [{ id }, resolvedSearch] = await Promise.all([params, searchParams])

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      booking: {
        include: {
          slot: true,
          consultationType: true,
        },
      },
    },
  })

  if (!lead) notFound()

  const saved = firstValue(resolvedSearch.saved) === '1'
  const errored = firstValue(resolvedSearch.error) === '1'

  const booking = lead.booking
  const detail = adminCopy.leadDetail

  const taxTotalPaise = booking ? booking.cgstPaise + booking.sgstPaise + booking.igstPaise : 0
  const invariantHolds = booking ? booking.taxablePaise + taxTotalPaise === booking.totalPaise : true

  return (
    <>
      <PageHeader
        title={`${detail.titlePrefix} · ${lead.name}`}
        description={lead.email}
        actions={
          <Link href="/admin/leads" className="text-sm font-semibold text-muted hover:text-ink">
            {adminCopy.common.back}
          </Link>
        }
      />

      {saved ? <Notice tone="success">{detail.manage.saved}</Notice> : null}
      {errored ? <Notice tone="error">{detail.manage.error}</Notice> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title={detail.sections.lead}>
            <DataGrid>
              <DataRow label={detail.fields.kind} value={<KindBadge kind={lead.kind} />} />
              <DataRow label={detail.fields.status} value={adminCopy.leadStatusLabels[lead.status]} />
              <DataRow label={detail.fields.name} value={lead.name} />
              <DataRow label={detail.fields.email} value={lead.email} />
              <DataRow label={detail.fields.phone} value={formatText(lead.phone)} />
              <DataRow label={detail.fields.company} value={formatText(lead.company)} />
              <DataRow label={detail.fields.source} value={formatText(lead.source)} />
              <DataRow label={detail.fields.createdAt} value={formatDateTime(lead.createdAt)} />
              <DataRow label={detail.fields.updatedAt} value={formatDateTime(lead.updatedAt)} />
              <DataRow label={detail.fields.leadId} value={<code className="text-xs">{lead.id}</code>} />
              <DataRow
                label={detail.fields.message}
                wide
                value={<span className="whitespace-pre-wrap">{formatText(lead.message)}</span>}
              />
              <DataRow
                label={detail.fields.notes}
                wide
                value={<span className="whitespace-pre-wrap">{formatText(lead.notes)}</span>}
              />
            </DataGrid>
          </Panel>

          {booking ? (
            <>
              <Panel title={detail.sections.booking}>
                <DataGrid>
                  <DataRow
                    label={detail.booking.status}
                    value={<BookingStatusBadge status={booking.status} />}
                  />
                  <DataRow label={detail.booking.type} value={booking.consultationType.name} />
                  <DataRow
                    label={detail.booking.duration}
                    value={`${booking.consultationType.durationMins} ${detail.booking.durationUnit}`}
                  />
                  <DataRow
                    label={detail.booking.slotStatus}
                    value={adminCopy.slotStatusLabels[booking.slot.status]}
                  />
                  <DataRow label={detail.booking.slotStart} value={formatDateTime(booking.slot.startsAt)} />
                  <DataRow label={detail.booking.slotEnd} value={formatDateTime(booking.slot.endsAt)} />
                  <DataRow label={detail.booking.meetingUrl} value={formatText(booking.meetingUrl)} />
                  <DataRow label={detail.booking.rescheduleCount} value={String(booking.rescheduleCount)} />
                  <DataRow label={detail.booking.createdAt} value={formatDateTime(booking.createdAt)} />
                  <DataRow
                    label={detail.booking.bookingId}
                    value={<code className="text-xs">{booking.id}</code>}
                  />
                </DataGrid>
              </Panel>

              <Panel title={detail.sections.money} description={detail.money.inclusiveNote}>
                {invariantHolds ? null : <Notice tone="error">{detail.money.invariantBroken}</Notice>}
                <dl className="divide-y divide-line">
                  <div className="flex justify-between py-2.5 text-sm">
                    <dt className="text-muted">{detail.money.taxable}</dt>
                    <dd className="font-semibold text-ink">{formatINR(booking.taxablePaise)}</dd>
                  </div>
                  {booking.isInterState ? (
                    <div className="flex justify-between py-2.5 text-sm">
                      <dt className="text-muted">{detail.money.igst}</dt>
                      <dd className="font-semibold text-ink">{formatINR(booking.igstPaise)}</dd>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between py-2.5 text-sm">
                        <dt className="text-muted">{detail.money.cgst}</dt>
                        <dd className="font-semibold text-ink">{formatINR(booking.cgstPaise)}</dd>
                      </div>
                      <div className="flex justify-between py-2.5 text-sm">
                        <dt className="text-muted">{detail.money.sgst}</dt>
                        <dd className="font-semibold text-ink">{formatINR(booking.sgstPaise)}</dd>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between py-2.5 text-sm">
                    <dt className="font-semibold text-ink">{detail.money.total}</dt>
                    <dd className="font-display text-lg font-bold text-red">{formatINR(booking.totalPaise)}</dd>
                  </div>
                  <div className="flex justify-between py-2.5 text-sm">
                    <dt className="text-muted">{detail.money.gstRate}</dt>
                    <dd className="text-ink">{`${booking.gstRatePercent}%`}</dd>
                  </div>
                  <div className="flex justify-between py-2.5 text-sm">
                    <dt className="text-muted">{detail.money.sacCode}</dt>
                    <dd className="text-ink">{booking.sacCode}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-muted-2">{detail.money.invariant}</p>
              </Panel>

              <Panel title={detail.sections.tax}>
                <DataGrid>
                  <DataRow
                    label={detail.tax.supplyType}
                    value={booking.isInterState ? detail.tax.interState : detail.tax.intraState}
                  />
                  <DataRow label={detail.tax.placeOfSupply} value={booking.placeOfSupplyStateCode} />
                  <DataRow label={detail.tax.clientState} value={formatText(booking.clientStateCode)} />
                  <DataRow label={detail.tax.clientGstin} value={formatText(booking.clientGstin)} />
                  <DataRow
                    label={detail.tax.supplierState}
                    value={`${siteConfig.tax.supplierStateName} (${siteConfig.tax.supplierStateCode})`}
                  />
                  <DataRow label={detail.tax.basis} wide value={placeOfSupplyBasis(booking)} />
                </DataGrid>
                <p className="mt-4 text-xs text-muted-2">{detail.tax.derivedWarning}</p>
              </Panel>

              <Panel title={detail.sections.payment}>
                {booking.paidAt ? null : <Notice tone="warning">{detail.payment.unpaid}</Notice>}
                <DataGrid>
                  <DataRow label={detail.payment.paidAt} value={formatDateTime(booking.paidAt)} />
                  <DataRow label={detail.payment.invoiceNumber} value={formatText(booking.invoiceNumber)} />
                  <DataRow label={detail.payment.invoiceFy} value={formatText(booking.invoiceFy)} />
                  <DataRow
                    label={detail.payment.razorpayOrderId}
                    value={<code className="text-xs">{booking.razorpayOrderId}</code>}
                  />
                  <DataRow
                    label={detail.payment.razorpayPaymentId}
                    value={
                      booking.razorpayPaymentId ? (
                        <code className="text-xs">{booking.razorpayPaymentId}</code>
                      ) : (
                        adminCopy.common.empty
                      )
                    }
                  />
                </DataGrid>
              </Panel>

              <Panel title={detail.sections.emails}>
                <DataGrid>
                  <DataRow
                    label={detail.emails.confirmation}
                    value={formatDateTime(booking.confirmationEmailSentAt)}
                  />
                  <DataRow label={detail.emails.reminder} value={formatDateTime(booking.reminderEmailSentAt)} />
                  <DataRow label={detail.emails.ownerAlert} value={formatDateTime(booking.ownerAlertSentAt)} />
                </DataGrid>
                <p className="mt-4 text-xs text-muted-2">{detail.emails.note}</p>
              </Panel>
            </>
          ) : (
            <Panel title={detail.sections.booking}>
              <EmptyBooking />
            </Panel>
          )}
        </div>

        <div className="lg:col-span-1">
          <Panel title={detail.sections.manage}>
            <form action={updateLeadAction} className="space-y-5">
              <input type="hidden" name="leadId" value={lead.id} />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="lead-status" className="text-xs font-semibold text-muted-2 uppercase">
                  {detail.manage.statusLabel}
                </label>
                <select
                  id="lead-status"
                  name="status"
                  defaultValue={lead.status}
                  className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink"
                >
                  {LEAD_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {adminCopy.leadStatusLabels[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="lead-notes" className="text-xs font-semibold text-muted-2 uppercase">
                  {detail.manage.notesLabel}
                </label>
                <textarea
                  id="lead-notes"
                  name="notes"
                  rows={8}
                  maxLength={5000}
                  defaultValue={lead.notes ?? ''}
                  placeholder={detail.manage.notesPlaceholder}
                  className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2"
                />
                <p className="text-xs text-muted-2">{detail.manage.notesHelp}</p>
              </div>

              <button
                type="submit"
                className="w-full rounded-full bg-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-2"
              >
                {detail.manage.submit}
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </>
  )
}

function EmptyBooking() {
  return <p className="text-sm text-muted">{adminCopy.leadDetail.booking.none}</p>
}

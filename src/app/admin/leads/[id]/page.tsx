/**
 * /admin/leads/[id] — one person, everything known about them.
 *
 * The amount breakdown, the place-of-supply audit trail and the payment/invoice
 * panel are gone with the columns behind them; a free call has no money, no tax
 * and no gateway reference to show. What is left is what an admin acts on: the
 * session that was booked, the meeting link, and whether the emails went out.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
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
  SlotStatusBadge,
  adminCopy,
  fieldClass,
  fieldLabelClass,
  formatDate,
  formatDateTime,
  formatText,
  formatTimeRange,
} from '@/components/admin/shell'

const NOTES_MAX_LENGTH = 5000

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
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
    include: { booking: { include: { slot: true } } },
  })

  if (!lead) notFound()

  const saved = firstValue(resolvedSearch.saved) === '1'
  const errored = firstValue(resolvedSearch.error) === '1'

  const booking = lead.booking
  const detail = adminCopy.leadDetail

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
        <div className="min-w-0 space-y-6 lg:col-span-2">
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
              <Panel
                title={detail.sections.booking}
                description={adminCopy.sessions.timezoneNote}
              >
                {booking.meetingUrl ? null : (
                  <Notice tone="warning">{detail.booking.meetingUrlMissing}</Notice>
                )}
                <DataGrid>
                  <DataRow
                    label={detail.booking.status}
                    value={<BookingStatusBadge status={booking.status} />}
                  />
                  <DataRow
                    label={detail.booking.slotStatus}
                    value={<SlotStatusBadge status={booking.slot.status} />}
                  />
                  <DataRow label={detail.booking.sessionDate} value={formatDate(booking.slot.startsAt)} />
                  <DataRow
                    label={detail.booking.sessionTime}
                    value={formatTimeRange(booking.slot.startsAt, booking.slot.endsAt)}
                  />
                  <DataRow label={detail.booking.sessionLabel} value={formatText(booking.slot.label)} />
                  <DataRow
                    label={detail.booking.meetingUrl}
                    value={
                      booking.meetingUrl ? (
                        <a
                          href={booking.meetingUrl}
                          rel="noreferrer noopener"
                          target="_blank"
                          className="font-semibold text-red hover:underline"
                        >
                          {booking.meetingUrl}
                        </a>
                      ) : (
                        adminCopy.common.empty
                      )
                    }
                  />
                  <DataRow label={detail.booking.rescheduleCount} value={String(booking.rescheduleCount)} />
                  <DataRow label={detail.booking.createdAt} value={formatDateTime(booking.createdAt)} />
                  <DataRow
                    label={detail.booking.bookingId}
                    value={<code className="text-xs">{booking.id}</code>}
                  />
                </DataGrid>
                <p className="mt-5">
                  <Link href="/admin/sessions" className="text-sm font-semibold text-red hover:underline">
                    {detail.booking.manageSessions}
                  </Link>
                </p>
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
              <p className="text-sm text-muted">{detail.booking.none}</p>
            </Panel>
          )}
        </div>

        <div className="min-w-0 lg:col-span-1">
          <Panel title={detail.sections.manage}>
            <form action={updateLeadAction} className="space-y-5">
              <input type="hidden" name="leadId" value={lead.id} />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="lead-status" className={fieldLabelClass}>
                  {detail.manage.statusLabel}
                </label>
                <select id="lead-status" name="status" defaultValue={lead.status} className={fieldClass}>
                  {LEAD_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {adminCopy.leadStatusLabels[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="lead-notes" className={fieldLabelClass}>
                  {detail.manage.notesLabel}
                </label>
                <textarea
                  id="lead-notes"
                  name="notes"
                  rows={8}
                  maxLength={NOTES_MAX_LENGTH}
                  defaultValue={lead.notes ?? ''}
                  placeholder={detail.manage.notesPlaceholder}
                  className={fieldClass}
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

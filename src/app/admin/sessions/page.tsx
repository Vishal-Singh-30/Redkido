/**
 * /admin/sessions — the supply side of the product.
 *
 * A visitor can only book a time that exists as a Slot row, so this page is
 * what makes the booking page non-empty. Three things happen here: publish
 * sessions (one at a time, or a whole date range at once), close one without
 * deleting it, and delete one that nobody has taken.
 *
 * It is a server component end to end. Every control is a plain <form> posting
 * to a server action, so the page works with JavaScript off — which matters
 * more here than anywhere else in the admin, because this is the surface that
 * has to work from a phone on a bad connection.
 *
 * Every time shown and every time typed is IST, and the day grouping is done
 * on an IST day key rather than a UTC one — group these in UTC and a 23:30
 * session files itself under the previous day for everybody.
 */

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  createSessionAction,
  createSessionRangeAction,
  deleteSessionAction,
  setSessionStatusAction,
} from '@/app/admin/sessions/actions'
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  SlotStatusBadge,
  adminCopy,
  fieldClass,
  fieldLabelClass,
  formatDayHeading,
  formatTimeRange,
  istDayKey,
  istDayStart,
  isSessionErrorCode,
  isSessionNoticeCode,
  primaryButtonClass,
  quietButtonClass,
} from '@/components/admin/shell'

/** Hard cap on rows rendered. A three-month publish is ~180 sessions. */
const SESSION_LIMIT = 400
const DEFAULT_DURATION_MINUTES = 30
const DEFAULT_RANGE_DAYS = 30
const MS_PER_DAY = 86_400_000

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function parseCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export default async function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  // searchParams is async in Next 16.
  const resolved = await searchParams

  const noticeCode = firstValue(resolved.ok)
  const errorCode = firstValue(resolved.error)
  const createdCount = parseCount(firstValue(resolved.n))
  const skippedCount = parseCount(firstValue(resolved.skipped))

  const now = new Date()
  const todayKey = istDayKey(now)
  const rangeEndKey = istDayKey(new Date(now.getTime() + DEFAULT_RANGE_DAYS * MS_PER_DAY))

  // From midnight IST today, not from `now`: the whole of today stays visible so
  // an admin can see the calls they have already taken as well as the ones left.
  const windowStart = istDayStart(todayKey) ?? now

  const found = await prisma.slot.findMany({
    where: { startsAt: { gte: windowStart } },
    orderBy: { startsAt: 'asc' },
    take: SESSION_LIMIT + 1,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      label: true,
      // Only a CONFIRMED booking owns a session. A cancelled one leaves the row
      // behind but must not be shown as the person who has this time.
      bookings: {
        where: { status: 'CONFIRMED' },
        take: 1,
        select: { id: true, lead: { select: { id: true, name: true } } },
      },
    },
  })

  // Derived from the query rather than hand-written, so a change to the select
  // above cannot leave a stale enum union behind here.
  type SessionRow = (typeof found)[number]

  const truncated = found.length > SESSION_LIMIT
  const sessions: SessionRow[] = truncated ? found.slice(0, SESSION_LIMIT) : found

  // Grouped on the IST calendar day, in the order the query already returned.
  const byDay = new Map<string, SessionRow[]>()
  for (const session of sessions) {
    const key = istDayKey(session.startsAt)
    const bucket = byDay.get(key)
    if (bucket) bucket.push(session)
    else byDay.set(key, [session])
  }

  const copy = adminCopy.sessions
  const countLabel = sessions.length === 1 ? copy.list.countOne : copy.list.countMany

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <span className="text-sm text-muted">
            {sessions.length} {countLabel}
          </span>
        }
      />

      {isSessionNoticeCode(noticeCode) ? (
        <Notice tone="success">
          {noticeCode === 'created'
            ? [
                createdCount === 1 && skippedCount === 0
                  ? copy.notices.createdOne
                  : `${createdCount} ${copy.notices.createdManySuffix}`,
                skippedCount > 0 ? `${skippedCount} ${copy.notices.skippedSuffix}` : '',
              ]
                .filter((part) => part.length > 0)
                .join(' ')
            : copy.notices[noticeCode]}
        </Notice>
      ) : null}

      {isSessionErrorCode(errorCode) ? <Notice tone="error">{copy.errors[errorCode]}</Notice> : null}

      <p className="mb-6 text-xs text-muted-2">{copy.timezoneNote}</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---------------------------------------------------------------- */}
        {/* One session                                                       */}
        {/* ---------------------------------------------------------------- */}
        <Panel title={copy.add.title} description={copy.add.description} className="min-w-0">
          <form action={createSessionAction} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="add-date" className={fieldLabelClass}>
                  {copy.add.dateLabel}
                </label>
                <input
                  id="add-date"
                  name="date"
                  type="date"
                  required
                  min={todayKey}
                  defaultValue={todayKey}
                  className={fieldClass}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="add-time" className={fieldLabelClass}>
                  {copy.add.timeLabel}
                </label>
                <input id="add-time" name="time" type="time" required className={fieldClass} />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="add-duration" className={fieldLabelClass}>
                  {copy.add.durationLabel}
                </label>
                <input
                  id="add-duration"
                  name="durationMinutes"
                  type="number"
                  required
                  min={5}
                  max={480}
                  step={5}
                  defaultValue={DEFAULT_DURATION_MINUTES}
                  className={fieldClass}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="add-label" className={fieldLabelClass}>
                  {copy.add.labelLabel}
                </label>
                <input
                  id="add-label"
                  name="label"
                  type="text"
                  maxLength={80}
                  placeholder={copy.add.labelPlaceholder}
                  className={fieldClass}
                />
              </div>
            </div>

            <p className="text-xs text-muted-2">{copy.add.labelHelp}</p>

            <button type="submit" className={primaryButtonClass}>
              {copy.add.submit}
            </button>
          </form>
        </Panel>

        {/* ---------------------------------------------------------------- */}
        {/* A whole range                                                     */}
        {/* ---------------------------------------------------------------- */}
        <Panel title={copy.bulk.title} description={copy.bulk.description} className="min-w-0">
          <form action={createSessionRangeAction} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="bulk-from" className={fieldLabelClass}>
                  {copy.bulk.fromLabel}
                </label>
                <input
                  id="bulk-from"
                  name="from"
                  type="date"
                  required
                  min={todayKey}
                  defaultValue={todayKey}
                  className={fieldClass}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="bulk-to" className={fieldLabelClass}>
                  {copy.bulk.toLabel}
                </label>
                <input
                  id="bulk-to"
                  name="to"
                  type="date"
                  required
                  min={todayKey}
                  defaultValue={rangeEndKey}
                  className={fieldClass}
                />
              </div>
            </div>

            {/* min-w-0: a fieldset defaults to a content-based minimum width and
                refuses to shrink, which blows the weekday row out of its column
                and gives the whole page a horizontal scrollbar. */}
            <fieldset className="min-w-0">
              <legend className={`${fieldLabelClass} mb-2`}>{copy.bulk.weekdaysLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {copy.weekdayOrder.map((day) => (
                  <label
                    key={day}
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-bg px-3 py-1.5 text-xs font-semibold text-ink"
                  >
                    <input
                      type="checkbox"
                      name="weekday"
                      value={day}
                      defaultChecked={copy.weekdayDefaults.includes(day)}
                      className="accent-red"
                    />
                    {copy.weekdayLabels[day]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="bulk-times" className={fieldLabelClass}>
                  {copy.bulk.timesLabel}
                </label>
                <input
                  id="bulk-times"
                  name="times"
                  type="text"
                  required
                  placeholder={copy.bulk.timesPlaceholder}
                  className={fieldClass}
                />
                <p className="text-xs text-muted-2">{copy.bulk.timesHelp}</p>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="bulk-duration" className={fieldLabelClass}>
                  {copy.add.durationLabel}
                </label>
                <input
                  id="bulk-duration"
                  name="durationMinutes"
                  type="number"
                  required
                  min={5}
                  max={480}
                  step={5}
                  defaultValue={DEFAULT_DURATION_MINUTES}
                  className={fieldClass}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="bulk-label" className={fieldLabelClass}>
                  {copy.add.labelLabel}
                </label>
                <input
                  id="bulk-label"
                  name="label"
                  type="text"
                  maxLength={80}
                  placeholder={copy.add.labelPlaceholder}
                  className={fieldClass}
                />
              </div>
            </div>

            <p className="text-xs text-muted-2">{copy.bulk.note}</p>

            <button type="submit" className={primaryButtonClass}>
              {copy.bulk.submit}
            </button>
          </form>
        </Panel>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* The diary                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-6">
        <Panel title={copy.list.title} description={copy.list.description}>
          {truncated ? <p className="mb-4 text-xs text-muted-2">{copy.list.truncated}</p> : null}

          {sessions.length === 0 ? (
            <EmptyState message={copy.list.empty} />
          ) : (
            <div className="space-y-8">
              {Array.from(byDay.entries()).map(([dayKey, rows]) => (
                <section key={dayKey}>
                  <h3 className="font-display text-sm font-bold text-ink">{formatDayHeading(dayKey)}</h3>

                  {/* Wide content scrolls inside its own box; the page body never does. */}
                  <div className="mt-3 overflow-x-auto rounded-card border border-line">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-line text-xs tracking-wide text-muted-2 uppercase">
                          <th scope="col" className="px-4 py-2.5 font-semibold">
                            {copy.list.columns.time}
                          </th>
                          <th scope="col" className="px-4 py-2.5 font-semibold">
                            {copy.list.columns.label}
                          </th>
                          <th scope="col" className="px-4 py-2.5 font-semibold">
                            {copy.list.columns.status}
                          </th>
                          <th scope="col" className="px-4 py-2.5 font-semibold">
                            {copy.list.columns.who}
                          </th>
                          <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                            {copy.list.columns.actions}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {rows.map((session) => {
                          const booking = session.bookings[0]
                          return (
                            <tr key={session.id} className="align-middle hover:bg-card-2">
                              <td className="px-4 py-3 font-semibold whitespace-nowrap text-ink">
                                {formatTimeRange(session.startsAt, session.endsAt)}
                              </td>
                              <td className="px-4 py-3 text-muted">
                                {session.label ?? adminCopy.common.empty}
                              </td>
                              <td className="px-4 py-3">
                                <SlotStatusBadge status={session.status} />
                              </td>
                              <td className="px-4 py-3">
                                {booking ? (
                                  <Link
                                    href={`/admin/leads/${booking.lead.id}`}
                                    className="font-semibold text-red hover:underline"
                                  >
                                    {booking.lead.name}
                                  </Link>
                                ) : (
                                  <span className="text-muted-2">{adminCopy.common.empty}</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {session.status === 'AVAILABLE' ? (
                                    <form action={setSessionStatusAction}>
                                      <input type="hidden" name="slotId" value={session.id} />
                                      <input type="hidden" name="next" value="BLOCKED" />
                                      <button type="submit" className={quietButtonClass}>
                                        {copy.list.block}
                                      </button>
                                    </form>
                                  ) : null}

                                  {session.status === 'BLOCKED' ? (
                                    <form action={setSessionStatusAction}>
                                      <input type="hidden" name="slotId" value={session.id} />
                                      <input type="hidden" name="next" value="AVAILABLE" />
                                      <button type="submit" className={quietButtonClass}>
                                        {copy.list.unblock}
                                      </button>
                                    </form>
                                  ) : null}

                                  {booking ? (
                                    <span
                                      className="rounded-full border border-line-strong bg-card-2 px-3 py-1 text-xs font-semibold text-muted"
                                      title={copy.list.deleteLockedHint}
                                    >
                                      {copy.list.deleteLocked}
                                    </span>
                                  ) : (
                                    <form action={deleteSessionAction}>
                                      <input type="hidden" name="slotId" value={session.id} />
                                      <button type="submit" className={quietButtonClass}>
                                        {copy.list.delete}
                                      </button>
                                    </form>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

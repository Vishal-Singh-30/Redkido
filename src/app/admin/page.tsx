/**
 * /admin — the dashboard.
 *
 * What it used to show was revenue. There is no revenue: calls are free. The
 * question this page answers now is the one the client actually asked — "who
 * reached out?" — plus the one that keeps the product working: is there
 * anything left on the calendar for the next person to book?
 *
 * Every day bucket is an IST day. Bucketing on UTC would file a 23:30 IST
 * booking under the previous day, and on a Vercel lambda (which runs in UTC)
 * that is every late session, every time.
 */

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { BarChart, LineChart, StatTile, type ChartPoint } from '@/components/admin/charts'
import {
  EmptyState,
  KindBadge,
  LeadStatusBadge,
  Notice,
  PageHeader,
  Panel,
  adminCopy,
  formatDateTime,
  formatDayBucket,
  istDayKey,
  istDayStart,
} from '@/components/admin/shell'

const TREND_DAYS = 30
const HORIZON_DAYS = 7
const DAY_MS = 86_400_000
const RECENT_LIMIT = 10

const countFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export default async function AdminDashboardPage() {
  const now = new Date()

  // The trend window runs from the start of the IST day 29 days ago, so the
  // first bucket is a whole day rather than a partial one.
  const trendStartKey = istDayKey(new Date(now.getTime() - (TREND_DAYS - 1) * DAY_MS))
  const trendStart = istDayStart(trendStartKey) ?? new Date(now.getTime() - TREND_DAYS * DAY_MS)
  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * DAY_MS)

  const [
    totalLeads,
    enquiryCount,
    callCount,
    confirmedBookings,
    upcomingCalls,
    openSessions,
    trendLeads,
    trendBookings,
    recentLeads,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { kind: 'ENQUIRY' } }),
    prisma.lead.count({ where: { kind: 'CALL' } }),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    // On the calendar in the next week and not cancelled — the number that says
    // what this week actually looks like.
    prisma.booking.count({
      where: {
        status: 'CONFIRMED',
        slot: { startsAt: { gte: now, lt: horizonEnd } },
      },
    }),
    // Supply, not demand: published, still open, still in the future. If this
    // is zero the booking page is empty however many leads came in.
    prisma.slot.count({
      where: { status: 'AVAILABLE', startsAt: { gte: now, lt: horizonEnd } },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),
    prisma.booking.findMany({
      where: { status: 'CONFIRMED', createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),
    prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
      select: {
        id: true,
        kind: true,
        status: true,
        name: true,
        email: true,
        createdAt: true,
      },
    }),
  ])

  const leadsByDay = new Map<string, number>()
  for (const lead of trendLeads) {
    const key = istDayKey(lead.createdAt)
    leadsByDay.set(key, (leadsByDay.get(key) ?? 0) + 1)
  }

  const bookingsByDay = new Map<string, number>()
  for (const booking of trendBookings) {
    const key = istDayKey(booking.createdAt)
    bookingsByDay.set(key, (bookingsByDay.get(key) ?? 0) + 1)
  }

  // Walk back from today in whole days. IST is a fixed offset, so subtracting
  // exactly 24h always lands on the previous IST calendar date.
  const bucketKeys = Array.from({ length: TREND_DAYS }, (_, index) =>
    istDayKey(new Date(now.getTime() - (TREND_DAYS - 1 - index) * DAY_MS)),
  )

  const leadPoints: ChartPoint[] = bucketKeys.map((key) => ({
    label: formatDayBucket(key),
    value: leadsByDay.get(key) ?? 0,
  }))

  const bookingPoints: ChartPoint[] = bucketKeys.map((key) => ({
    label: formatDayBucket(key),
    value: bookingsByDay.get(key) ?? 0,
  }))

  const kindBars: ChartPoint[] = [
    { label: adminCopy.kindLabels.ENQUIRY, value: enquiryCount },
    { label: adminCopy.kindLabels.CALL, value: callCount },
  ]

  const copy = adminCopy.dashboard

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />

      {openSessions === 0 ? (
        <Notice tone="warning">
          {copy.noSessions}{' '}
          <Link href="/admin/sessions" className="font-semibold text-red hover:underline">
            {copy.noSessionsCta}
          </Link>
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label={copy.tiles.totalLeads}
          value={countFormatter.format(totalLeads)}
          sub={copy.tiles.totalLeadsSub}
        />
        <StatTile
          label={copy.tiles.enquiries}
          value={countFormatter.format(enquiryCount)}
          sub={copy.tiles.enquiriesSub}
        />
        <StatTile
          label={copy.tiles.calls}
          value={countFormatter.format(confirmedBookings)}
          sub={copy.tiles.callsSub}
        />
        <StatTile
          label={copy.tiles.upcoming}
          value={countFormatter.format(upcomingCalls)}
          sub={copy.tiles.upcomingSub}
          accent
        />
        <StatTile
          label={copy.tiles.openSessions}
          value={countFormatter.format(openSessions)}
          sub={copy.tiles.openSessionsSub}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={copy.trend.title} description={copy.trend.description} className="min-w-0">
          <LineChart
            label={copy.trend.chartLabel}
            height={240}
            series={[
              { name: copy.trend.leadsSeries, points: leadPoints, tone: 'primary' },
              { name: copy.trend.bookingsSeries, points: bookingPoints, tone: 'secondary' },
            ]}
          />
        </Panel>

        <Panel title={copy.byKind.title} description={copy.byKind.description} className="min-w-0">
          <BarChart label={copy.byKind.chartLabel} height={140} data={kindBars} />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title={copy.recent.title} description={copy.recent.description}>
          {recentLeads.length === 0 ? (
            <EmptyState message={copy.recent.empty} />
          ) : (
            <ul className="divide-y divide-line">
              {recentLeads.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <KindBadge kind={lead.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{lead.name}</p>
                    <p className="truncate text-xs text-muted">{lead.email}</p>
                  </div>
                  <LeadStatusBadge status={lead.status} />
                  <span className="text-xs whitespace-nowrap text-muted-2">
                    {formatDateTime(lead.createdAt)}
                  </span>
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="text-xs font-semibold text-red hover:underline"
                  >
                    {copy.recent.view}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}

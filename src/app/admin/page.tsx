import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatINR, type Paise } from '@/lib/money'
import { BarChart, LineChart, StatTile, type ChartPoint } from '@/components/admin/charts'
import {
  EmptyState,
  KindBadge,
  LeadStatusBadge,
  PageHeader,
  Panel,
  adminCopy,
  formatDateTime,
  formatDayBucket,
} from '@/components/admin/shell'

const TREND_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_LIMIT = 10
const REVENUE_BAR_LIMIT = 8

const countFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function bucketKey(value: Date): string {
  return startOfUtcDay(value).toISOString().slice(0, 10)
}

export default async function AdminDashboardPage() {
  const today = startOfUtcDay(new Date())
  const trendStart = new Date(today.getTime() - (TREND_DAYS - 1) * DAY_MS)

  const [
    totalLeads,
    enquiryCount,
    paidBookingCount,
    revenueAggregate,
    trendLeads,
    trendPaidBookings,
    paidBookingsByType,
    recentLeads,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { kind: 'ENQUIRY' } }),
    prisma.booking.count({ where: { status: 'PAID' } }),
    // Revenue is the sum over PAID bookings only. PENDING, FAILED, CANCELLED
    // and REFUNDED rows carry amounts too and must never be counted here.
    prisma.booking.aggregate({ where: { status: 'PAID' }, _sum: { totalPaise: true } }),
    prisma.lead.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),
    prisma.booking.findMany({
      where: { status: 'PAID', paidAt: { gte: trendStart } },
      select: { paidAt: true },
    }),
    prisma.booking.findMany({
      where: { status: 'PAID' },
      select: { totalPaise: true, consultationType: { select: { name: true } } },
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
        booking: { select: { status: true, totalPaise: true } },
      },
    }),
  ])

  const revenuePaise: Paise = revenueAggregate._sum.totalPaise ?? 0

  const leadsByDay = new Map<string, number>()
  for (const lead of trendLeads) {
    const key = bucketKey(lead.createdAt)
    leadsByDay.set(key, (leadsByDay.get(key) ?? 0) + 1)
  }

  const bookingsByDay = new Map<string, number>()
  for (const booking of trendPaidBookings) {
    if (!booking.paidAt) continue
    const key = bucketKey(booking.paidAt)
    bookingsByDay.set(key, (bookingsByDay.get(key) ?? 0) + 1)
  }

  const buckets = Array.from({ length: TREND_DAYS }, (_, index) => new Date(trendStart.getTime() + index * DAY_MS))

  const leadPoints: ChartPoint[] = buckets.map((day) => ({
    label: formatDayBucket(day),
    value: leadsByDay.get(bucketKey(day)) ?? 0,
  }))

  const bookingPoints: ChartPoint[] = buckets.map((day) => ({
    label: formatDayBucket(day),
    value: bookingsByDay.get(bucketKey(day)) ?? 0,
  }))

  // Paise stay integers: this is addition only, never a division.
  const revenueByType = new Map<string, Paise>()
  for (const booking of paidBookingsByType) {
    const name = booking.consultationType.name
    revenueByType.set(name, (revenueByType.get(name) ?? 0) + booking.totalPaise)
  }

  const revenueBars: ChartPoint[] = Array.from(revenueByType.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, REVENUE_BAR_LIMIT)

  return (
    <>
      <PageHeader title={adminCopy.dashboard.title} description={adminCopy.dashboard.description} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={adminCopy.dashboard.tiles.totalLeads}
          value={countFormatter.format(totalLeads)}
          sub={adminCopy.dashboard.tiles.totalLeadsSub}
        />
        <StatTile
          label={adminCopy.dashboard.tiles.enquiries}
          value={countFormatter.format(enquiryCount)}
          sub={adminCopy.dashboard.tiles.enquiriesSub}
        />
        <StatTile
          label={adminCopy.dashboard.tiles.paidConsultations}
          value={countFormatter.format(paidBookingCount)}
          sub={adminCopy.dashboard.tiles.paidConsultationsSub}
        />
        <StatTile
          label={adminCopy.dashboard.tiles.revenue}
          value={formatINR(revenuePaise)}
          sub={adminCopy.dashboard.tiles.revenueSub}
          accent
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={adminCopy.dashboard.trend.title} description={adminCopy.dashboard.trend.description}>
          <LineChart
            label={adminCopy.dashboard.trend.chartLabel}
            height={240}
            format="count"
            series={[
              { name: adminCopy.dashboard.trend.leadsSeries, points: leadPoints, tone: 'primary' },
              { name: adminCopy.dashboard.trend.bookingsSeries, points: bookingPoints, tone: 'secondary' },
            ]}
          />
        </Panel>

        <Panel
          title={adminCopy.dashboard.revenueByType.title}
          description={adminCopy.dashboard.revenueByType.description}
        >
          <BarChart label={adminCopy.dashboard.revenueByType.chartLabel} height={240} format="money" data={revenueBars} />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title={adminCopy.dashboard.recent.title} description={adminCopy.dashboard.recent.description}>
          {recentLeads.length === 0 ? (
            <EmptyState message={adminCopy.dashboard.recent.empty} />
          ) : (
            <ul className="divide-y divide-line">
              {recentLeads.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <KindBadge kind={lead.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{lead.name}</p>
                    <p className="truncate text-xs text-muted">{lead.email}</p>
                  </div>
                  {lead.booking ? (
                    <span className="text-sm font-semibold text-ink">{formatINR(lead.booking.totalPaise)}</span>
                  ) : null}
                  <LeadStatusBadge status={lead.status} />
                  <span className="text-xs whitespace-nowrap text-muted-2">{formatDateTime(lead.createdAt)}</span>
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="text-xs font-semibold text-red hover:underline"
                  >
                    {adminCopy.dashboard.recent.view}
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

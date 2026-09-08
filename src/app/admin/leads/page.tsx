import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/money'
import {
  EmptyState,
  KindBadge,
  LEAD_KINDS,
  LEAD_STATUSES,
  LeadStatusBadge,
  PageHeader,
  Panel,
  adminCopy,
  formatDateTime,
  formatText,
  isLeadKind,
  isLeadStatus,
  type LeadKindValue,
  type LeadStatusValue,
} from '@/components/admin/shell'

const PAGE_SIZE = 25

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function parsePage(value: string | undefined): number {
  if (!value) return 1
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return parsed
}

function buildQuery(params: {
  kind?: LeadKindValue
  status?: LeadStatusValue
  q?: string
  page?: number
}): string {
  const search = new URLSearchParams()
  if (params.kind) search.set('kind', params.kind)
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.page && params.page > 1) search.set('page', String(params.page))
  const serialised = search.toString()
  return serialised.length > 0 ? `/admin/leads?${serialised}` : '/admin/leads'
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  // searchParams is async in Next 16.
  const resolved = await searchParams

  const rawKind = firstValue(resolved.kind)
  const rawStatus = firstValue(resolved.status)
  const kind = isLeadKind(rawKind) ? rawKind : undefined
  const status = isLeadStatus(rawStatus) ? rawStatus : undefined
  const query = (firstValue(resolved.q) ?? '').trim().slice(0, 120)

  // One WHERE across both funnels — the unified Lead model is the whole point.
  const searchFilter = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { email: { contains: query, mode: 'insensitive' as const } },
          { company: { contains: query, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const where = {
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...searchFilter,
  }

  const total = await prisma.lead.count({ where })
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(parsePage(firstValue(resolved.page)), pageCount)

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      kind: true,
      status: true,
      name: true,
      email: true,
      phone: true,
      company: true,
      createdAt: true,
      booking: { select: { status: true, totalPaise: true } },
    },
  })

  const resultLabel = total === 1 ? adminCopy.leads.resultCountOne : adminCopy.leads.resultCountMany

  return (
    <>
      <PageHeader
        title={adminCopy.leads.title}
        description={adminCopy.leads.description}
        actions={
          <span className="text-sm text-muted">
            {total} {resultLabel}
          </span>
        }
      />

      <Panel className="mb-6">
        <form method="get" action="/admin/leads">
          <fieldset className="flex flex-wrap items-end gap-4">
            <legend className="sr-only">{adminCopy.leads.filters.legend}</legend>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="filter-kind" className="text-xs font-semibold text-muted-2 uppercase">
                {adminCopy.leads.filters.kind}
              </label>
              <select
                id="filter-kind"
                name="kind"
                defaultValue={kind ?? ''}
                className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink"
              >
                <option value="">{adminCopy.leads.filters.anyKind}</option>
                {LEAD_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {adminCopy.kindLabels[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="filter-status" className="text-xs font-semibold text-muted-2 uppercase">
                {adminCopy.leads.filters.status}
              </label>
              <select
                id="filter-status"
                name="status"
                defaultValue={status ?? ''}
                className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink"
              >
                <option value="">{adminCopy.leads.filters.anyStatus}</option>
                {LEAD_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {adminCopy.leadStatusLabels[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <label htmlFor="filter-q" className="text-xs font-semibold text-muted-2 uppercase">
                {adminCopy.leads.filters.search}
              </label>
              <input
                id="filter-q"
                name="q"
                type="search"
                defaultValue={query}
                placeholder={adminCopy.leads.filters.searchPlaceholder}
                className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-full bg-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-2"
              >
                {adminCopy.common.apply}
              </button>
              <Link href="/admin/leads" className="text-sm font-semibold text-muted hover:text-ink">
                {adminCopy.common.reset}
              </Link>
            </div>
          </fieldset>
        </form>
      </Panel>

      {leads.length === 0 ? (
        <EmptyState message={adminCopy.leads.empty} />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-wide text-muted-2 uppercase">
                <th scope="col" className="px-4 py-3 font-semibold">
                  {adminCopy.leads.columns.kind}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {adminCopy.leads.columns.name}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {adminCopy.leads.columns.contact}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {adminCopy.leads.columns.company}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {adminCopy.leads.columns.status}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  {adminCopy.leads.columns.amount}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {adminCopy.leads.columns.created}
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{adminCopy.leads.view}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.map((lead) => (
                <tr key={lead.id} className="align-top hover:bg-card-2">
                  <td className="px-4 py-3">
                    <KindBadge kind={lead.kind} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{lead.name}</td>
                  <td className="px-4 py-3 text-muted">
                    <span className="block">{lead.email}</span>
                    <span className="block text-xs text-muted-2">{formatText(lead.phone)}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatText(lead.company)}</td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-ink">
                    {lead.booking ? formatINR(lead.booking.totalPaise) : adminCopy.common.empty}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-2">{formatDateTime(lead.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="text-sm font-semibold text-red hover:underline"
                    >
                      {adminCopy.leads.view}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4" aria-label={adminCopy.leads.pagination.pageLabel}>
        {page > 1 ? (
          <Link
            href={buildQuery({ kind, status, q: query, page: page - 1 })}
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-ink hover:border-red hover:text-red"
          >
            {adminCopy.leads.pagination.previous}
          </Link>
        ) : (
          <span />
        )}

        <span className="text-sm text-muted">
          {adminCopy.leads.pagination.pageLabel} {page} {adminCopy.leads.pagination.ofLabel} {pageCount}
        </span>

        {page < pageCount ? (
          <Link
            href={buildQuery({ kind, status, q: query, page: page + 1 })}
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-ink hover:border-red hover:text-red"
          >
            {adminCopy.leads.pagination.next}
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  )
}

/**
 * Hand-built SVG charts. Server components — no charting library, no client
 * JavaScript, no dependency of any kind.
 *
 * Rules that hold for every chart here:
 *   - Money arrives as INTEGER PAISE and is rendered with formatINR. No float
 *     ever touches an amount; the only division is geometry (pixels), never money.
 *   - Empty input renders an explicit "no data" state. A chart must never emit
 *     a path containing NaN, which is what a naive value/max does on an empty
 *     or all-zero dataset.
 *   - Every chart is role="img" with a <title>, and is followed by a
 *     visually-hidden table carrying the same numbers, so the figures are
 *     reachable by a screen reader and by copy-paste.
 *   - All copy comes from adminCopy. No literal strings below.
 */

import type { ReactNode } from 'react'
import { formatINR, type Paise } from '@/lib/money'
import { adminCopy } from '@/components/admin/shell'

export type ChartPoint = {
  /** Axis / row label, already formatted for display. */
  label: string
  /** Paise when format is 'money', a plain count otherwise. */
  value: number
}

export type ChartSeries = {
  name: string
  points: ChartPoint[]
  /** Two visual roles only, so the palette stays the monochrome red scale. */
  tone?: 'primary' | 'secondary'
}

export type ValueFormat = 'count' | 'money'

const VIEW_WIDTH = 720

const TONE_STROKE: Record<'primary' | 'secondary', string> = {
  primary: 'var(--color-red)',
  secondary: 'var(--color-muted-2)',
}

const countFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function formatValue(value: number, format: ValueFormat): string {
  if (format === 'money') {
    const paise: Paise = Math.round(value)
    return formatINR(paise)
  }
  return countFormatter.format(value)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ChartFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{label}</figcaption>
      {children}
    </figure>
  )
}

function NoData() {
  return (
    <p className="flex min-h-32 items-center justify-center rounded-card border border-dashed border-line-strong bg-bg-2 px-4 py-10 text-sm text-muted">
      {adminCopy.charts.empty}
    </p>
  )
}

/* ==========================================================================
   StatTile — headline numbers.
   ========================================================================== */

export function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  /** Already formatted for display (formatINR for money). */
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-card border p-5 ${
        accent ? 'border-red/35 bg-red/8' : 'border-line bg-card'
      }`}
    >
      <p className="text-xs font-semibold tracking-wide text-muted-2 uppercase">{label}</p>
      <p
        className={`mt-2 font-display text-3xl leading-none font-extrabold tracking-tight ${
          accent ? 'text-red' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-2 text-xs text-muted">{sub}</p> : null}
    </div>
  )
}

/* ==========================================================================
   LineChart — one or more series over the same time axis.
   ========================================================================== */

export function LineChart({
  series,
  height = 220,
  label,
  format = 'count',
}: {
  series: ChartSeries[]
  height?: number
  label: string
  format?: ValueFormat
}) {
  const populated = series.filter((s) => s.points.length > 0)
  if (populated.length === 0) {
    return (
      <ChartFrame label={label}>
        <NoData />
      </ChartFrame>
    )
  }

  // The axis is whichever series carries the most buckets; callers build the
  // buckets from the same date range, so in practice they are all equal.
  const axis = populated.reduce((longest, s) => (s.points.length > longest.points.length ? s : longest))
  const count = axis.points.length

  const padTop = 16
  const padRight = 16
  const padBottom = 30
  const padLeft = 56
  const innerWidth = VIEW_WIDTH - padLeft - padRight
  const innerHeight = height - padTop - padBottom

  const rawMax = Math.max(0, ...populated.flatMap((s) => s.points.map((p) => p.value)))
  // A zero-only dataset still draws a flat baseline; dividing by zero would not.
  const max = rawMax > 0 ? rawMax : 1

  const x = (index: number): number =>
    count === 1 ? padLeft + innerWidth / 2 : padLeft + (index / (count - 1)) * innerWidth
  const y = (value: number): number => padTop + innerHeight - (value / max) * innerHeight

  const gridTicks = [0, 0.5, 1]

  // At most six x labels, evenly spaced, always including the last bucket.
  const labelStride = Math.max(1, Math.ceil(count / 6))

  const titleId = `line-${slugify(label)}`

  return (
    <ChartFrame label={label}>
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        width="100%"
        height={height}
        className="block"
      >
        <title id={titleId}>{label}</title>

        {gridTicks.map((tick) => {
          const lineY = padTop + innerHeight - tick * innerHeight
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={VIEW_WIDTH - padRight}
                y1={lineY}
                y2={lineY}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={padLeft - 10}
                y={lineY + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-muted-2)"
              >
                {formatValue(Math.round(max * tick), format)}
              </text>
            </g>
          )
        })}

        {populated.map((s) => {
          const stroke = TONE_STROKE[s.tone ?? 'primary']
          const path = s.points
            .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`)
            .join(' ')
          return (
            <g key={s.name}>
              <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {count <= 32
                ? s.points.map((point, index) => (
                    <circle
                      key={`${s.name}-${point.label}`}
                      cx={x(index)}
                      cy={y(point.value)}
                      r={point.value > 0 ? 2.5 : 1.5}
                      fill={stroke}
                    />
                  ))
                : null}
            </g>
          )
        })}

        {axis.points.map((point, index) =>
          index % labelStride === 0 || index === count - 1 ? (
            <text
              key={point.label}
              x={x(index)}
              y={height - 10}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-muted-2)"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-4">
        {populated.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-xs text-muted">
            <span
              aria-hidden="true"
              className="h-2 w-4 rounded-full"
              style={{ backgroundColor: TONE_STROKE[s.tone ?? 'primary'] }}
            />
            {s.name}
          </li>
        ))}
      </ul>

      <table className="sr-only">
        <caption>{`${label} — ${adminCopy.charts.tableCaptionSuffix}`}</caption>
        <thead>
          <tr>
            <th scope="col">{adminCopy.charts.periodColumn}</th>
            {populated.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {axis.points.map((point, index) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              {populated.map((s) => (
                <td key={s.name}>{formatValue(s.points[index]?.value ?? 0, format)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ChartFrame>
  )
}

/* ==========================================================================
   BarChart — horizontal bars, because category names need room to read.
   ========================================================================== */

export function BarChart({
  data,
  height = 220,
  label,
  format = 'money',
}: {
  data: ChartPoint[]
  height?: number
  label: string
  format?: ValueFormat
}) {
  if (data.length === 0) {
    return (
      <ChartFrame label={label}>
        <NoData />
      </ChartFrame>
    )
  }

  const rowHeight = 46
  const svgHeight = Math.max(height, data.length * rowHeight + 8)
  const padX = 8
  const trackWidth = VIEW_WIDTH - padX * 2

  const rawMax = Math.max(0, ...data.map((point) => point.value))
  const max = rawMax > 0 ? rawMax : 1

  const titleId = `bar-${slugify(label)}`

  return (
    <ChartFrame label={label}>
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${VIEW_WIDTH} ${svgHeight}`}
        width="100%"
        height={svgHeight}
        className="block"
      >
        <title id={titleId}>{label}</title>
        {data.map((point, index) => {
          const top = index * rowHeight + 4
          const barWidth = Math.max(point.value > 0 ? 3 : 0, (point.value / max) * trackWidth)
          return (
            <g key={point.label}>
              <text x={padX} y={top + 14} fontSize={12} fill="var(--color-ink)" fontWeight={600}>
                {point.label}
              </text>
              <text
                x={VIEW_WIDTH - padX}
                y={top + 14}
                textAnchor="end"
                fontSize={12}
                fill="var(--color-muted)"
              >
                {formatValue(point.value, format)}
              </text>
              <rect
                x={padX}
                y={top + 22}
                width={trackWidth}
                height={12}
                rx={6}
                fill="var(--color-card-2)"
              />
              <rect x={padX} y={top + 22} width={barWidth} height={12} rx={6} fill="var(--color-red)" />
            </g>
          )
        })}
      </svg>

      <table className="sr-only">
        <caption>{`${label} — ${adminCopy.charts.tableCaptionSuffix}`}</caption>
        <thead>
          <tr>
            <th scope="col">{adminCopy.charts.categoryColumn}</th>
            <th scope="col">{adminCopy.charts.valueColumn}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{formatValue(point.value, format)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartFrame>
  )
}

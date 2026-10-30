// Small, dependency-free charts drawn with HTML. Each mark has its own hover and
// keyboard tooltip, and every chart has a table twin so no value depends on hover.
import { useId, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { inr, inrCompact, inrSigned } from '../../lib/format'

interface TipState {
  x: number
  y: number
  title: string
  rows: { label: string; value: string; color?: string }[]
}

function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const show = (e: PointerEvent<HTMLElement>, content: Omit<TipState, 'x' | 'y'>) => setTip({ x: e.clientX, y: e.clientY, ...content })
  const showFocus = (e: FocusEvent<HTMLElement>, content: Omit<TipState, 'x' | 'y'>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ x: r.left + r.width / 2, y: r.top, ...content })
  }
  return { tip, show, showFocus, hide: () => setTip(null) }
}

function Tooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  const left = typeof window !== 'undefined' ? Math.min(tip.x + 14, window.innerWidth - 240) : tip.x
  return (
    <div className="pointer-events-none fixed z-[70] w-56 rounded-2xl bg-night p-3 text-xs text-white" style={{ left: Math.max(8, left), top: Math.max(8, tip.y - 12) }} role="status">
      <p className="mb-1.5 font-bold text-white">{tip.title}</p>
      <ul className="flex flex-col gap-1">
        {tip.rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-night-ink">
              {row.color && <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} aria-hidden="true" />}
              {row.label}
            </span>
            <span className="font-bold text-white tabular">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Card with a chart/table switch; the table is the same data without any hover. */
export function ChartCard({ title, description, chart, table, legend, className }: { title: string; description?: ReactNode; chart: ReactNode; table: ReactNode; legend?: ReactNode; className?: string }) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart')
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('rounded-3xl bg-surface p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-bold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
        </div>
        <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="group" aria-label={`${title}: view`}>
          {(['chart', 'table'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              aria-label={m === 'chart' ? 'Show chart' : 'Show table'}
              onClick={() => setMode(m)}
              className={cn('grid size-8 cursor-pointer place-items-center rounded-md transition-colors', mode === m ? 'bg-surface text-ink' : 'text-ink-3 hover:text-ink')}
            >
              {m === 'chart' ? <BarChart3 className="size-4" aria-hidden="true" /> : <Table2 className="size-4" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
      {mode === 'chart' ? (
        <div className="mt-4">
          {legend && <div className="mb-3">{legend}</div>}
          {chart}
        </div>
      ) : (
        <div className="relative mt-4 overflow-x-auto">{table}</div>
      )}
    </section>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export function SimpleTable({ head, rows, align }: { head: string[]; rows: (string | number)[][]; align?: ('left' | 'right')[] }) {
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b border-line text-xs font-bold uppercase tracking-wide text-ink-3">
          {head.map((h, i) => (
            <th key={h} scope="col" className={cn('px-2 py-2', align?.[i] === 'right' ? 'text-right' : 'text-left')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={String(row[0])}>
            {row.map((cell, i) => (
              <td key={i} className={cn('px-2 py-2 whitespace-nowrap', i === 0 ? 'font-semibold text-ink' : 'text-ink-2 tabular', align?.[i] === 'right' && 'text-right')}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export interface DivergingDatum {
  label: string
  value: number
}

const POSITIVE = '#2a78d6'
const NEGATIVE = '#e34948'

/** Bars either side of zero: blue for profit, red for loss, always with a signed label. */
export function DivergingBars({ data }: { data: DivergingDatum[] }) {
  const { tip, show, showFocus, hide } = useTooltip()
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)))
  const hasNegative = data.some((d) => d.value < 0)
  const hasPositive = data.some((d) => d.value > 0)
  // Keep room on the empty side only if it is used.
  const leftShare = hasNegative && hasPositive ? 50 : hasNegative ? 100 : 0
  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {data.map((d) => {
          const share = (Math.abs(d.value) / max) * (hasNegative && hasPositive ? 50 : 100)
          const content = { title: d.label, rows: [{ label: d.value >= 0 ? 'Profit per month' : 'Loss per month', value: inrSigned(d.value) }] }
          return (
            <li key={d.label} className="grid grid-cols-[72px_1fr_84px] items-center gap-2">
              <span className="truncate text-sm font-semibold text-ink">{d.label}</span>
              <div
                className="relative h-5 cursor-default rounded-sm"
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${inrSigned(d.value)} a month`}
                onPointerMove={(e) => show(e, content)}
                onPointerLeave={hide}
                onFocus={(e) => showFocus(e, content)}
                onBlur={hide}
              >
                <span className="absolute inset-y-0 w-px bg-ink-3/50" style={{ left: `${leftShare}%` }} aria-hidden="true" />
                <span
                  className="absolute inset-y-0.5 animate-grow-x transition-[width,left] duration-300 hover:opacity-85"
                  style={{
                    background: d.value >= 0 ? POSITIVE : NEGATIVE,
                    width: `${Math.max(share, 0.6)}%`,
                    left: d.value >= 0 ? `${leftShare}%` : `${leftShare - share}%`,
                    borderRadius: d.value >= 0 ? '0 4px 4px 0' : '4px 0 0 4px',
                    transformOrigin: d.value >= 0 ? 'left' : 'right',
                  }}
                />
              </div>
              <span className="text-right text-sm font-bold text-ink tabular">{inrSigned(d.value)}</span>
            </li>
          )
        })}
      </ul>
      <Tooltip tip={tip} />
    </>
  )
}

export interface StackSegment {
  label: string
  value: number
  color: string
}

/** One horizontal stacked bar per row, on a shared scale, with a 2px surface gap between segments. */
export function StackedBars({ rows }: { rows: { label: string; segments: StackSegment[] }[] }) {
  const { tip, show, showFocus, hide } = useTooltip()
  const max = Math.max(1, ...rows.map((r) => r.segments.reduce((sum, s) => sum + s.value, 0)))
  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const total = row.segments.reduce((sum, s) => sum + s.value, 0)
          const content = {
            title: row.label,
            rows: [...row.segments.map((s) => ({ label: s.label, value: inr(s.value), color: s.color })), { label: 'Total', value: inr(total) }],
          }
          return (
            <li key={row.label} className="grid grid-cols-[72px_1fr_60px] items-center gap-2">
              <span className="truncate text-sm font-semibold text-ink">{row.label}</span>
              <div
                className="flex h-5 origin-left animate-grow-x cursor-default gap-0.5"
                tabIndex={0}
                role="img"
                aria-label={`${row.label}: ${row.segments.map((s) => `${s.label} ${inr(s.value)}`).join(', ')}`}
                onPointerMove={(e) => show(e, content)}
                onPointerLeave={hide}
                onFocus={(e) => showFocus(e, content)}
                onBlur={hide}
              >
                {row.segments
                  .filter((s) => s.value > 0)
                  .map((s, i, all) => (
                    <span
                      key={s.label}
                      className="transition-[width] duration-300"
                      style={{
                        background: s.color,
                        width: `${(s.value / max) * 100}%`,
                        borderRadius: i === all.length - 1 ? '0 4px 4px 0' : undefined,
                      }}
                    />
                  ))}
              </div>
              <span className="text-right text-sm font-bold text-ink tabular">{inrCompact(total)}</span>
            </li>
          )
        })}
      </ul>
      <Tooltip tip={tip} />
    </>
  )
}

/** Columns for a distribution, one hue, with a hairline marking a limit. */
export function Histogram({ bins, unit, limit, limitLabel }: { bins: { from: number; to: number; count: number }[]; unit: string; limit?: number; limitLabel?: string }) {
  const { tip, show, showFocus, hide } = useTooltip()
  const max = Math.max(1, ...bins.map((b) => b.count))
  const first = bins[0]?.from ?? 0
  const last = bins[bins.length - 1]?.to ?? 1
  const limitAt = limit === undefined ? null : Math.min(100, Math.max(0, ((limit - first) / (last - first)) * 100))
  return (
    <>
      <div className="relative h-40 border-b border-ink-3/40">
        {limitAt !== null && (
          <div className="absolute inset-y-0 z-10 w-px bg-ink" style={{ left: `${limitAt}%` }} aria-hidden="true">
            <span className={cn('absolute top-0 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white', limitAt > 70 ? 'right-1' : 'left-1')}>{limitLabel}</span>
          </div>
        )}
        <div className="flex h-full items-end gap-0.5">
          {bins.map((bin) => {
            const content = { title: `${bin.from}–${bin.to} ${unit}`, rows: [{ label: 'Children', value: String(bin.count) }] }
            return (
              <div
                key={bin.from}
                className="flex h-full flex-1 cursor-default items-end"
                tabIndex={0}
                role="img"
                aria-label={`${bin.from} to ${bin.to} ${unit}: ${bin.count} children`}
                onPointerMove={(e) => show(e, content)}
                onPointerLeave={hide}
                onFocus={(e) => showFocus(e, content)}
                onBlur={hide}
              >
                <div className="w-full origin-bottom animate-grow-y rounded-t transition-[height] duration-300 hover:opacity-85" style={{ height: `${(bin.count / max) * 100}%`, minHeight: bin.count > 0 ? 3 : 0, background: POSITIVE }} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="relative mt-1 flex justify-between text-xs text-ink-3 tabular">
        <span>{first}</span>
        <span>
          {last} {unit}
        </span>
      </div>
      <Tooltip tip={tip} />
    </>
  )
}

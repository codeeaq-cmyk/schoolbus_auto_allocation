import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function StatTile({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&>svg]:size-5" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-3">{label}</p>
        <p className="mt-0.5 text-2xl font-bold leading-tight text-ink">{value}</p>
        {detail && <p className="mt-0.5 text-xs text-ink-3">{detail}</p>}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, children, action, className }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-ink [&>svg]:size-7" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-3">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm font-semibold text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight text-ink text-balance sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Initials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-sm font-extrabold text-ink" aria-hidden="true">
      {initials}
    </span>
  )
}

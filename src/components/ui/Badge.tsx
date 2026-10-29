import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-ink-2 ring-line',
  primary: 'bg-primary-soft text-primary ring-line-strong',
  success: 'bg-success-soft text-success-ink ring-success/25',
  warning: 'bg-warning-soft text-warning-ink ring-warning/40',
  danger: 'bg-danger-soft text-danger-ink ring-danger/25',
}

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>
      {icon && <span className="-ml-0.5 [&>svg]:size-3.5" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  )
}

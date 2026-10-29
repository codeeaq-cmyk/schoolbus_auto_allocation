import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-line bg-surface shadow-card', className)} {...props} />
}

interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
  as?: 'h2' | 'h3'
}

export function CardHeader({ title, description, icon, actions, className, as: Heading = 'h2' }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start gap-3 px-5 pt-5', className)}>
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Heading className="text-[15px] font-bold leading-snug text-ink">{title}</Heading>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

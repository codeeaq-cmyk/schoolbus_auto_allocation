import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function StatTile({ label, value, detail, icon, className }: { label: string; value: ReactNode; detail?: ReactNode; icon: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3.5 rounded-3xl bg-surface p-5', className)}>
      <span
        className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary [&>svg]:size-5"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-3">{label}</p>
        <p className="mt-0.5 text-2xl font-extrabold leading-tight tracking-tight text-ink">{value}</p>
        {detail && <p className="mt-1 text-xs leading-relaxed text-ink-3">{detail}</p>}
      </div>
    </div>
  )
}

/** A little bus travelling a dashed road: the empty states' way of saying "nothing here yet". */
export function RoadIllustration() {
  return (
    <div className="relative mx-auto h-16 w-52" aria-hidden="true">
      <svg viewBox="0 0 208 64" className="absolute inset-0 size-full">
        <path d="M6 44 C 50 8, 90 60, 130 30 S 190 18, 202 40" fill="none" stroke="var(--color-line-strong)" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
      </svg>
      <motion.span
        className="gradient-amber absolute grid size-9 place-items-center rounded-xl text-on-accent"
        style={{ left: 0, top: 26 }}
        animate={{ x: [0, 56, 110, 164, 0], y: [0, -8, -4, -10, 0] }}
        transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 }}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6v6" />
          <path d="M15 6v6" />
          <path d="M2 12h19.6" />
          <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
          <circle cx="7" cy="18" r="2" />
          <path d="M9 18h5" />
          <circle cx="16" cy="18" r="2" />
        </svg>
      </motion.span>
    </div>
  )
}

export function EmptyState({ icon, title, children, action, className, illustrated }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string; illustrated?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {illustrated ? (
        <RoadIllustration />
      ) : (
        <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-ink [&>svg]:size-7" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="mt-5 text-lg font-bold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-3">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm font-bold text-primary">{eyebrow}</div>}
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink text-balance sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-sm font-extrabold text-primary', className)} aria-hidden="true">
      {initials}
    </span>
  )
}

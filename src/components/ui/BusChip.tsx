import { inkOn, routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import type { Bus } from '../../lib/types'

/** A bus's identity: its route color always travels with its label, never alone. */
export function BusChip({ bus, variant = 'dot', className }: { bus: Pick<Bus, 'label' | 'colorSlot'>; variant?: 'dot' | 'solid'; className?: string }) {
  const color = routeColor(bus.colorSlot)
  if (variant === 'solid') {
    return (
      <span
        className={cn('inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold whitespace-nowrap', className)}
        style={{ background: color, color: inkOn(color) }}
      >
        {bus.label}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold whitespace-nowrap', className)}>
      <span className="size-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: color }} aria-hidden="true" />
      {bus.label}
    </span>
  )
}

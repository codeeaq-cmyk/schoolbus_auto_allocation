import { CircleCheck, CircleSlash, TriangleAlert } from 'lucide-react'
import { routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { Badge } from './Badge'

function capacityState(used: number, capacity: number) {
  if (capacity > 0 && used >= capacity) return 'full' as const
  if (capacity > 0 && used / capacity >= 0.8) return 'almost' as const
  return 'open' as const
}

export function CapacityBadge({ used, capacity }: { used: number; capacity: number }) {
  const state = capacityState(used, capacity)
  if (state === 'full')
    return (
      <Badge tone="danger" icon={<CircleSlash />}>
        Full
      </Badge>
    )
  if (state === 'almost')
    return (
      <Badge tone="warning" icon={<TriangleAlert />}>
        {capacity - used} left
      </Badge>
    )
  return (
    <Badge tone="success" icon={<CircleCheck />}>
      {capacity - used} seats free
    </Badge>
  )
}

/** Seats taken vs capacity. Fill carries the bus identity; state is spelled out in the badge. */
export function CapacityMeter({ used, capacity, colorSlot, className }: { used: number; capacity: number; colorSlot: number; className?: string }) {
  const pct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={used}
      aria-valuetext={`${used} of ${capacity} seats taken`}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%`, background: routeColor(colorSlot) }}
      />
    </div>
  )
}

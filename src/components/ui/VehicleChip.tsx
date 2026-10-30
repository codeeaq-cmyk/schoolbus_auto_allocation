import { Bus, Van } from 'lucide-react'
import { inkOn, routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import type { Vehicle, VehicleType } from '../../lib/types'

export function VehicleIcon({ type, className }: { type: VehicleType; className?: string }) {
  const Icon = type === 'bus' ? Bus : Van
  return <Icon className={className} aria-hidden="true" />
}

/** A vehicle's identity: its route color always travels with its label, never alone. */
export function VehicleChip({ vehicle, variant = 'dot', className }: { vehicle: Pick<Vehicle, 'label' | 'colorSlot' | 'type'>; variant?: 'dot' | 'solid'; className?: string }) {
  const color = routeColor(vehicle.colorSlot)
  if (variant === 'solid') {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold whitespace-nowrap', className)} style={{ background: color, color: inkOn(color) }}>
        <VehicleIcon type={vehicle.type} className="size-3.5" />
        {vehicle.label}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold whitespace-nowrap', className)}>
      <span className="size-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: color }} aria-hidden="true" />
      {vehicle.label}
    </span>
  )
}

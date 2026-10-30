import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { VehicleChip } from '../../components/ui/VehicleChip'
import type { Vehicle } from '../../lib/types'

/** Key for route colors and markers; collapsible so it never hides much of the map. */
export function MapLegend({ vehicles, roadWidths }: { vehicles: Vehicle[]; roadWidths?: boolean }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-5rem)] rounded-xl border border-line bg-surface/95 text-xs shadow-card backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 font-bold text-ink"
      >
        Legend
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line px-3 py-2.5 text-ink-2">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              <VehicleChip vehicle={vehicle} />
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-ink-3" aria-hidden="true" />
            Stop: any vehicle
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] bg-ink-3" aria-hidden="true" />
            Stop: van only
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-dashed border-ink-2 bg-white" aria-hidden="true" />
            Waitlisted home
          </li>
          {roadWidths && (
            <>
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-3.5 rounded-sm bg-[#2a78d6]" aria-hidden="true" />
                Road fits a bus
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-3.5 rounded-sm bg-[#eb6834]" aria-hidden="true" />
                Van only
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  )
}

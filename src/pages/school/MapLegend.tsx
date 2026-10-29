import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { BusChip } from '../../components/ui/BusChip'
import type { Bus } from '../../lib/types'

/** Key for route colors and home markers; collapsible so it never hides much of the map. */
export function MapLegend({ buses }: { buses: Bus[] }) {
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
          {buses.map((bus) => (
            <li key={bus.id}>
              <BusChip bus={bus} />
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-dashed border-ink-2 bg-white" aria-hidden="true" />
            Waitlisted
          </li>
          <li className="flex items-center gap-1.5">
            <span className="grid size-3.5 place-items-center rounded bg-ink" aria-hidden="true" />
            School
          </li>
        </ul>
      )}
    </div>
  )
}

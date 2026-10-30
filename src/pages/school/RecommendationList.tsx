import { ArrowDownRight, ArrowUpRight, Lightbulb, LoaderCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toast-context'
import type { Recommendation } from '../../lib/engine/recommend'
import { inrSigned, kmValue, plural } from '../../lib/format'
import { navigate } from '../../lib/router'
import { addVehicle, applyPlan, switchVehicleType, updateVehicle } from '../../store/actions'
import { useRecommendations, useStore } from '../../store/context'
import { uid } from '../../store/state'

export function RecommendationList({ limit }: { limit?: number }) {
  const { update } = useStore()
  const { items, analysing } = useRecommendations()
  const toast = useToast()
  const shown = limit ? items.slice(0, limit) : items

  const run = (item: Recommendation) => {
    const action = item.action
    if (!action) return
    switch (action.kind) {
      case 'apply-plan':
        update((s) => applyPlan(s, action.plan, action.summary))
        toast({ tone: 'success', title: 'New plan applied', description: 'Parents see their updated stops and times straight away.' })
        break
      case 'add-vehicle': {
        const id = uid('veh')
        update((s) => addVehicle(s, { ...action.vehicle, id }))
        toast({ tone: 'success', title: `${action.vehicle.label} added`, description: 'Drag its flag on the map to the real starting point.' })
        navigate(`/school/fleet?bus=${id}`)
        break
      }
      case 'bench-vehicle':
        update((s) => updateVehicle(s, action.vehicleId, { enabled: false }))
        toast({ tone: 'success', title: 'Vehicle benched', description: 'Its riders moved to the rest of the fleet.' })
        break
      case 'swap-type':
        update((s) => switchVehicleType(s, action.vehicleId, action.type))
        toast({ tone: 'success', title: 'Vehicle switched', description: 'Routes were re-planned for the new vehicle.' })
        break
      case 'open-vehicle':
        navigate(`/school/fleet?bus=${action.vehicleId}`)
        break
    }
  }

  if (shown.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-3">
        {analysing ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Lightbulb className="size-4" aria-hidden="true" />}
        {analysing ? 'Pricing possible improvements…' : 'Nothing to change right now. The plan is in good shape.'}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {shown.map((item) => (
        <li key={item.id} className="rounded-xl border border-line p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="font-bold text-ink">{item.title}</p>
            {item.profitDelta !== null && (
              <span className={`inline-flex items-center gap-0.5 text-sm font-bold tabular ${item.profitDelta >= 0 ? 'text-success-ink' : 'text-danger-ink'}`}>
                {item.profitDelta >= 0 ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <ArrowDownRight className="size-4" aria-hidden="true" />}
                {inrSigned(item.profitDelta)}/mo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">{item.detail}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-3">
              {[
                item.seatedDelta ? `${item.seatedDelta > 0 ? '+' : ''}${plural(item.seatedDelta, 'child', 'children')} seated` : null,
                item.kmDelta !== null ? `${item.kmDelta <= 0 ? '−' : '+'}${kmValue(Math.abs(item.kmDelta))} a day` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {item.action && item.actionLabel && (
              <Button size="sm" variant={item.action.kind === 'open-vehicle' ? 'secondary' : 'primary'} onClick={() => run(item)}>
                {item.actionLabel}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

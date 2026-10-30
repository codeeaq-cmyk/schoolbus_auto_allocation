import { ArrowDownRight, ArrowUpRight, Lightbulb, LoaderCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toast-context'
import type { Recommendation } from '../../lib/engine/recommend'
import { inrSigned, kmValue, plural } from '../../lib/format'
import { EASE_OUT } from '../../lib/motion'
import { navigate } from '../../lib/router'
import { addVehicle, applyPlan, switchVehicleType, updateVehicle } from '../../store/actions'
import { useRecommendations, useStore } from '../../store/context'
import { uid } from '../../store/state'

export function RecommendationList({ limit }: { limit?: number }) {
  const { update } = useStore()
  const { items, analysing } = useRecommendations()
  const toast = useToast()
  const [showAll, setShowAll] = useState(false)
  const shown = limit && !showAll ? items.slice(0, limit) : items
  const hidden = items.length - shown.length

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
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary" aria-hidden="true">
          {analysing ? <LoaderCircle className="size-6 animate-spin" /> : <Lightbulb className="size-6" />}
        </span>
        <p className="text-sm text-ink-3">{analysing ? 'Pricing possible improvements…' : 'Nothing to change right now. The plan is in good shape.'}</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {shown.map((item, i) => (
          <motion.li
            key={item.id}
            layout="position"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.36, ease: EASE_OUT, delay: i * 0.03 }}
            className="rounded-2xl bg-muted p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 font-bold text-ink">{item.title}</p>
              {item.profitDelta !== null && (
                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm font-bold tabular ${item.profitDelta >= 0 ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink'}`}>
                  {item.profitDelta >= 0 ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <ArrowDownRight className="size-4" aria-hidden="true" />}
                  {inrSigned(item.profitDelta)}/mo
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{item.detail}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
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
          </motion.li>
        ))}
      </AnimatePresence>
      {hidden > 0 && (
        <li>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll(true)}>
            Show {hidden} more
          </Button>
        </li>
      )}
    </ul>
  )
}

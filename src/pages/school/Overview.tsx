import { ArrowRight, Armchair, Fuel, Hand, Hourglass, Layers, Lightbulb, LoaderCircle, MapPinOff, Sparkles, Timer, Wand2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { BaseMap } from '../../components/map/BaseMap'
import { LiveVehicles, RoadAccessLayer } from '../../components/map/layers'
import { NetworkLayers } from '../../components/map/NetworkLayers'
import { SimulationPanel } from '../../components/SimulationPanel'
import { Button } from '../../components/ui/Button'
import { CapacityBadge, CapacityMeter } from '../../components/ui/CapacityMeter'
import { Card } from '../../components/ui/Card'
import { Segmented } from '../../components/ui/controls'
import { Dialog } from '../../components/ui/Dialog'
import { PageHeader, StatTile } from '../../components/ui/misc'
import { AnimatedNumber, Stagger, StaggerItem } from '../../components/ui/motion'
import { useToast } from '../../components/ui/toast-context'
import { VehicleChip } from '../../components/ui/VehicleChip'
import { compareWithManual } from '../../lib/engine/baseline'
import { waitReasonText } from '../../lib/engine/explain'
import { cn } from '../../lib/cn'
import { inr, inrSigned, kmValue, percent, plural } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { EASE_OUT } from '../../lib/motion'
import { href, navigate } from '../../lib/router'
import { timeAgo } from '../../lib/time'
import { clearOverrides, countOverrides, reoptimise } from '../../store/actions'
import { useRecommendations, useStore } from '../../store/context'
import { MapLegend } from './MapLegend'
import { RecommendationList } from './RecommendationList'

type Panel = 'ideas' | 'waitlist' | 'activity'

export function Overview() {
  const { state, view, fleet, routeStatus, update } = useStore()
  const { items } = useRecommendations()
  const toast = useToast()
  const [showRoads, setShowRoads] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [panel, setPanel] = useState<Panel>('ideas')
  const [optimising, setOptimising] = useState(false)
  const routes = [...view.routes.values()]
  const savings = useMemo(() => compareWithManual(state, fleet), [state, fleet])
  const overrides = countOverrides(state)
  const { settings, plan } = state

  const vanStops = plan.stops.filter((s) => s.access === 'van').length
  const buses = state.vehicles.filter((v) => v.enabled && v.type === 'bus').length
  const vans = state.vehicles.filter((v) => v.enabled && v.type === 'van').length
  const waiting = state.students.filter((s) => view.students.get(s.id)?.status === 'waitlisted').sort((a, b) => a.registeredAt - b.registeredAt)

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Transport autopilot"
        description={`Boarding points, vehicles and routes for ${settings.name} are planned for you. Overrule anything, and the plan works around your change.`}
      />

      <Stagger className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <StaggerItem className="sm:col-span-2 xl:col-span-1">
          <div className="gradient-night relative h-full overflow-hidden rounded-3xl p-5 text-white">
            <p className="text-sm font-medium text-night-ink">Monthly profit</p>
            <p className="mt-1 text-[40px] font-extrabold leading-none tracking-tight">
              <AnimatedNumber value={fleet.profit} from={0} format={inr} />
            </p>
            <p className="mt-2 text-sm text-night-ink">
              {inr(fleet.revenue)} fees − {inr(fleet.cost)} costs · {percent(fleet.margin)} margin
            </p>
            <a href={href('/school/analytics')} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:underline">
              {inrSigned(savings.profit)} against planning by hand
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </StaggerItem>
        <StaggerItem>
          <StatTile className="h-full" icon={<Armchair />} label="Children seated" value={`${fleet.seated} / ${fleet.seats}`} detail={`${percent(fleet.seats ? fleet.seated / fleet.seats : 0)} of seats filled · ${fleet.waitlisted} waiting`} />
        </StaggerItem>
        <StaggerItem>
          <StatTile className="h-full" icon={<Fuel />} label="Fleet distance" value={`${Math.round(fleet.kmDaily)} km/day`} detail={`${Math.round(fleet.litres)} L diesel a month · ${kmValue(Math.max(0, savings.kmDaily))} less than by hand`} />
        </StaggerItem>
        <StaggerItem>
          <StatTile className="h-full" icon={<Timer />} label="Average ride" value={`${Math.round(fleet.rideAvg)} min`} detail={`Longest ${Math.round(fleet.rideMax)} min · limit ${settings.maxRideMin} min`} />
        </StaggerItem>
      </Stagger>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="relative h-[520px] overflow-hidden xl:h-[640px]">
          <BaseMap center={settings.location} zoom={12} label="Map of all routes, boarding points and homes">
            {showRoads && <RoadAccessLayer />}
            <NetworkLayers state={state} view={view} routeStatus={routeStatus} showHomes onSelectVehicle={(id) => navigate(`/school/fleet?bus=${id}`)} />
            <LiveVehicles routes={routes} settings={settings} />
          </BaseMap>
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
            <div className="glass pointer-events-auto rounded-2xl px-3.5 py-2.5">
              <h2 className="text-sm font-bold text-ink">Live plan</h2>
              <p className="text-xs text-ink-3">
                {plan.stops.length} stops ({vanStops} van only) · {plural(buses, 'bus', 'buses')}, {plural(vans, 'van')}
              </p>
            </div>
            <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
              <Button size="md" variant={showRoads ? 'primary' : 'secondary'} aria-pressed={showRoads} onClick={() => setShowRoads((v) => !v)}>
                <Layers className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Road widths</span>
              </Button>
              <SimulationPanel />
            </div>
          </div>
          <MapLegend vehicles={state.vehicles.filter((v) => v.enabled)} roadWidths={showRoads} />
        </Card>

        <Card className="flex h-[520px] flex-col xl:h-[640px]">
          <div className="p-4 pb-0">
            <Segmented
              label="Show"
              value={panel}
              onChange={setPanel}
              options={[
                {
                  id: 'ideas',
                  label: (
                    <>
                      <Lightbulb className="size-4" aria-hidden="true" />
                      Ideas
                      {items.length > 0 && <span className="rounded-full bg-primary-soft px-1.5 text-xs font-bold text-primary tabular">{items.length}</span>}
                    </>
                  ),
                },
                {
                  id: 'waitlist',
                  label: (
                    <>
                      <Hourglass className="size-4" aria-hidden="true" />
                      Waiting
                      {waiting.length > 0 && <span className="rounded-full bg-warning-soft px-1.5 text-xs font-bold text-warning-ink tabular">{waiting.length}</span>}
                    </>
                  ),
                },
                {
                  id: 'activity',
                  label: (
                    <>
                      <Sparkles className="size-4" aria-hidden="true" />
                      Log
                    </>
                  ),
                },
              ]}
            />
          </div>
          <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto p-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={panel} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.28, ease: EASE_OUT } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
                {panel === 'ideas' && <RecommendationList />}
                {panel === 'waitlist' &&
                  (waiting.length === 0 ? (
                    <p className="py-10 text-center text-sm text-ink-3">Every child who asked for a seat has one.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {waiting.map((s) => {
                        const student = view.students.get(s.id)
                        const reason = student?.status === 'waitlisted' ? student.reason : 'seats-full'
                        return (
                          <li key={s.id} className="flex items-start gap-3 rounded-2xl bg-muted/70 p-3">
                            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning-ink" aria-hidden="true">
                              {reason === 'too-far' || reason === 'no-road' ? <MapPinOff className="size-4" /> : <Hourglass className="size-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-ink">{s.name}</p>
                              <p className="truncate text-xs text-ink-3">{s.address}</p>
                              <p className="mt-1 text-xs leading-relaxed text-ink-2">{waitReasonText(reason, settings)}</p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ))}
                {panel === 'activity' && (
                  <ul className="flex flex-col gap-3">
                    {state.activity.slice(0, 20).map((entry) => (
                      <li key={entry.id} className="flex items-start gap-2.5">
                        <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', entry.kind === 'auto' ? 'bg-primary-soft text-primary' : 'bg-warning-soft text-warning-ink')}>
                          {entry.kind === 'auto' ? <Sparkles className="size-3.5" aria-label="Automatic" /> : <Hand className="size-3.5" aria-label="Manual" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-ink-2">{entry.text}</p>
                          <p className="text-xs text-ink-3">{timeAgo(entry.at)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex flex-wrap items-center gap-2 p-4">
            <Button
              size="sm"
              disabled={optimising}
              onClick={() => {
                setOptimising(true)
                // Let the button repaint before the search takes the main thread for a moment.
                window.setTimeout(() => {
                  const before = plan
                  let changed = false
                  update((s) => {
                    const next = reoptimise(s)
                    changed = next.plan.seats !== before.seats
                    return next
                  })
                  setOptimising(false)
                  toast(
                    changed
                      ? { tone: 'success', title: 'Better plan applied', description: 'Your manual choices were kept.' }
                      : { tone: 'info', title: 'Already the best plan found', description: 'Nothing needed to change.' },
                  )
                }, 40)
              }}
            >
              {optimising ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Wand2 className="size-4" aria-hidden="true" />}
              {optimising ? 'Searching…' : 'Re-optimise now'}
            </Button>
            {overrides.total > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setConfirmClear(true)}>
                <Hand className="size-4" aria-hidden="true" />
                Clear {plural(overrides.total, 'manual change')}
              </Button>
            )}
            <span className="ml-auto text-xs text-ink-3">Planned {timeAgo(plan.optimisedAt)}</span>
          </div>
        </Card>
      </div>

      <section aria-labelledby="fleet-heading" className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="fleet-heading" className="text-lg font-extrabold tracking-tight text-ink">
            Your fleet
          </h2>
          <p className="text-sm text-ink-3">Walks average {formatDistance(fleet.walkAvg)}</p>
        </div>
        <Stagger inView as="ul" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {fleet.vehicles.map((v) => (
            <StaggerItem as="li" key={v.vehicle.id}>
              <a href={href(`/school/fleet?bus=${v.vehicle.id}`)} className="flex h-full flex-col gap-3 rounded-3xl bg-surface p-4 transition-colors hover:bg-primary-soft">
                <div className="flex items-center justify-between gap-2">
                  <VehicleChip vehicle={v.vehicle} variant="solid" className="text-sm" />
                  {v.vehicle.enabled ? <CapacityBadge used={v.riders} capacity={v.vehicle.seats} /> : <span className="text-xs font-semibold text-ink-3">Benched</span>}
                </div>
                <CapacityMeter used={v.riders} capacity={v.vehicle.seats} colorSlot={v.vehicle.colorSlot} />
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className={cn('text-lg font-extrabold leading-tight tabular', v.profit < 0 ? 'text-danger-ink' : 'text-ink')}>{inrSigned(v.profit)}</p>
                    <p className="text-xs text-ink-3">a month</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-ink tabular">
                      {v.riders}/{v.vehicle.seats}
                    </p>
                    <p className="text-xs text-ink-3">{kmValue(v.kmDaily)}/day</p>
                  </div>
                </div>
              </a>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <Dialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        size="sm"
        title="Clear every manual change?"
        description={`This drops ${plural(overrides.total, 'manual choice')} (pinned vehicles and stops, custom fees, hand-placed stops, locked routes) and re-plans everything automatically.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                update(clearOverrides)
                setConfirmClear(false)
                toast({ tone: 'success', title: 'Back to fully automatic' })
              }}
            >
              Clear and re-plan
            </Button>
          </>
        }
      />
    </div>
  )
}

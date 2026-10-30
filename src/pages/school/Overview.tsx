import { ArrowRight, Armchair, Fuel, Hand, Hourglass, IndianRupee, Layers, MapPinOff, Route, Sparkles, Timer, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BaseMap } from '../../components/map/BaseMap'
import { LiveVehicles, RoadAccessLayer } from '../../components/map/layers'
import { NetworkLayers } from '../../components/map/NetworkLayers'
import { SimulationPanel } from '../../components/SimulationPanel'
import { Button } from '../../components/ui/Button'
import { CapacityMeter } from '../../components/ui/CapacityMeter'
import { Card, CardHeader } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { PageHeader, StatTile } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { VehicleChip } from '../../components/ui/VehicleChip'
import { compareWithManual } from '../../lib/engine/baseline'
import { waitReasonText } from '../../lib/engine/explain'
import { cn } from '../../lib/cn'
import { inr, inrSigned, kmValue, percent, plural } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { timeAgo } from '../../lib/time'
import { clearOverrides, countOverrides, reoptimise } from '../../store/actions'
import { useStore } from '../../store/context'
import { MapLegend } from './MapLegend'
import { RecommendationList } from './RecommendationList'

export function Overview() {
  const { state, view, fleet, routeStatus, update } = useStore()
  const toast = useToast()
  const [showRoads, setShowRoads] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const routes = [...view.routes.values()]
  const savings = useMemo(() => compareWithManual(state, fleet), [state, fleet])
  const overrides = countOverrides(state)
  const { settings, plan } = state

  const vanStops = plan.stops.filter((s) => s.access === 'van').length
  const buses = state.vehicles.filter((v) => v.enabled && v.type === 'bus').length
  const vans = state.vehicles.filter((v) => v.enabled && v.type === 'van').length

  const waiting = state.students.filter((s) => view.students.get(s.id)?.status === 'waitlisted').sort((a, b) => a.registeredAt - b.registeredAt)

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <PageHeader
        title="Transport autopilot"
        description={`The system plans boarding points, vehicles and routes for ${settings.name}. You can overrule any decision, and it plans around your change.`}
        actions={<SimulationPanel />}
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<IndianRupee />} label="Monthly profit" value={inr(fleet.profit)} detail={`${inr(fleet.revenue)} fees − ${inr(fleet.cost)} costs · ${percent(fleet.margin)} margin`} />
        <StatTile icon={<Armchair />} label="Children seated" value={`${fleet.seated} / ${fleet.seats}`} detail={`${percent(fleet.seats ? fleet.seated / fleet.seats : 0)} of seats filled · ${fleet.waitlisted} waiting`} />
        <StatTile icon={<Fuel />} label="Fleet distance" value={`${Math.round(fleet.kmDaily)} km/day`} detail={`${Math.round(fleet.litres)} L diesel a month`} />
        <StatTile icon={<Timer />} label="Average ride" value={`${Math.round(fleet.rideAvg)} min`} detail={`Longest ${Math.round(fleet.rideMax)} min · limit ${settings.maxRideMin} min`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="overflow-hidden">
            <CardHeader
              title="Live plan"
              description="Each dot is a child's home, in the color of their vehicle. Click a route to open it."
              actions={
                <Button size="sm" variant={showRoads ? 'primary' : 'secondary'} aria-pressed={showRoads} onClick={() => setShowRoads((v) => !v)}>
                  <Layers className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Road widths</span>
                </Button>
              }
            />
            <div className="relative mt-4 h-[460px] border-t border-line xl:h-[580px]">
              <BaseMap center={settings.location} zoom={12} label="Map of all routes, boarding points and homes">
                {showRoads && <RoadAccessLayer />}
                <NetworkLayers state={state} view={view} routeStatus={routeStatus} showHomes onSelectVehicle={(id) => navigate(`/school/fleet?bus=${id}`)} />
                <LiveVehicles routes={routes} settings={settings} />
              </BaseMap>
              <MapLegend vehicles={state.vehicles.filter((v) => v.enabled)} roadWidths={showRoads} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Vehicles" description="Seats filled and what each vehicle earns after its costs." />
            <ul className="flex flex-col p-3">
              {fleet.vehicles.map((v) => (
                <li key={v.vehicle.id}>
                  <a href={href(`/school/fleet?bus=${v.vehicle.id}`)} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-muted sm:grid-cols-[110px_1fr_90px_90px]">
                    <VehicleChip vehicle={v.vehicle} className="text-sm text-ink" />
                    <span className="text-right text-sm font-bold text-ink tabular sm:order-3">
                      {v.riders}/{v.vehicle.seats}
                    </span>
                    <CapacityMeter used={v.riders} capacity={v.vehicle.seats} colorSlot={v.vehicle.colorSlot} className="col-span-2 sm:order-2 sm:col-span-1" />
                    <span className={cn('text-sm font-bold tabular sm:order-4 sm:text-right', v.profit < 0 ? 'text-danger-ink' : 'text-ink')}>{v.vehicle.enabled ? inrSigned(v.profit) : 'Benched'}</span>
                    <span className="text-right text-xs text-ink-3 sm:hidden">{kmValue(v.kmDaily)}/day</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              icon={<Sparkles className="size-5" />}
              title={settings.autopilot ? 'Autopilot is on' : 'Autopilot is off'}
              description={settings.autopilot ? 'Plans update by themselves when the fleet or rules change.' : 'New requests are placed automatically; everything else waits for you.'}
              actions={
                <a href={href('/school/settings')} className="text-sm font-bold text-primary hover:underline">
                  Change
                </a>
              }
            />
            <ul className="mt-3 flex flex-col gap-2 px-5 text-sm text-ink-2">
              <li className="flex justify-between gap-3">
                <span>Boarding points</span>
                <strong className="text-ink">
                  {plan.stops.length} ({vanStops} van only)
                </strong>
              </li>
              <li className="flex justify-between gap-3">
                <span>Fleet in use</span>
                <strong className="text-ink">
                  {plural(buses, 'bus', 'buses')}, {plural(vans, 'van')}
                </strong>
              </li>
              <li className="flex justify-between gap-3">
                <span>Average walk to stop</span>
                <strong className="text-ink">{formatDistance(fleet.walkAvg)}</strong>
              </li>
              <li className="flex justify-between gap-3">
                <span>Last planned</span>
                <strong className="text-ink">{timeAgo(plan.optimisedAt)}</strong>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line p-4">
              <Button
                size="sm"
                onClick={() => {
                  update(reoptimise)
                  toast({ tone: 'success', title: 'Plan re-optimised', description: 'Boarding points and routes rebuilt; your manual choices were kept.' })
                }}
              >
                <Wand2 className="size-4" aria-hidden="true" />
                Re-optimise now
              </Button>
              {overrides.total > 0 && (
                <Button size="sm" variant="secondary" onClick={() => setConfirmClear(true)}>
                  <Hand className="size-4" aria-hidden="true" />
                  Clear {plural(overrides.total, 'manual change')}
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<Route className="size-5" />}
              title="Why automatic"
              description="Against the same fleet planned by hand, area by area."
              actions={
                <a href={href('/school/analytics')} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                  Details
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              }
            />
            <dl className="grid grid-cols-3 gap-2 p-5 text-center">
              {[
                ['Profit', `${inrSigned(savings.profit)}`, 'a month'],
                ['Distance', `${kmValue(Math.max(0, savings.kmDaily))}`, 'less a day'],
                ['Diesel', `${Math.round(Math.max(0, savings.litresMonthly))} L`, 'less a month'],
              ].map(([label, value, sub]) => (
                <div key={label} className="rounded-xl bg-muted px-2 py-3">
                  <dt className="text-xs font-semibold text-ink-3">{label}</dt>
                  <dd className="mt-0.5 text-[15px] font-extrabold text-ink">{value}</dd>
                  <dd className="text-xs text-ink-3">{sub}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Suggested improvements" description="Each one is priced by actually planning it." />
            <div className="p-5">
              <RecommendationList limit={3} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title={`Waitlist (${waiting.length})`}
              actions={
                waiting.length > 0 && (
                  <a href={href('/school/students?status=waitlisted')} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                    All
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                )
              }
            />
            {waiting.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-ink-3">Every child who asked for a seat has one.</p>
            ) : (
              <ul className="flex flex-col p-3">
                {waiting.slice(0, 5).map((s) => {
                  const student = view.students.get(s.id)
                  const reason = student?.status === 'waitlisted' ? student.reason : 'seats-full'
                  return (
                    <li key={s.id} className="flex items-start gap-3 rounded-xl px-2.5 py-2">
                      {reason === 'too-far' || reason === 'no-road' ? <MapPinOff className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden="true" /> : <Hourglass className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden="true" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {s.name} <span className="font-normal text-ink-3">· {s.address}</span>
                        </p>
                        <p className="text-xs text-ink-3">{waitReasonText(reason, settings)}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity" description="What the system did, and what people changed." />
            <ul className="flex max-h-72 flex-col gap-2.5 overflow-y-auto p-5">
              {state.activity.slice(0, 12).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5">
                  {entry.kind === 'auto' ? <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Automatic" /> : <Hand className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-label="Manual" />}
                  <div className="min-w-0">
                    <p className="text-sm text-ink-2">{entry.text}</p>
                    <p className="text-xs text-ink-3">{timeAgo(entry.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

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

import { ArrowRight, Armchair, Bus, Footprints, Hourglass, Inbox, MapPinOff } from 'lucide-react'
import { BaseMap } from '../../components/map/BaseMap'
import { LiveBuses } from '../../components/map/layers'
import { NetworkLayers } from '../../components/map/NetworkLayers'
import { SimulationPanel } from '../../components/SimulationPanel'
import { Badge } from '../../components/ui/Badge'
import { BusChip } from '../../components/ui/BusChip'
import { CapacityBadge, CapacityMeter } from '../../components/ui/CapacityMeter'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState, PageHeader, StatTile } from '../../components/ui/misc'
import { formatDistance } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { timeAgo } from '../../lib/time'
import { useStore } from '../../store/context'
import { MapLegend } from './MapLegend'

export function Overview() {
  const { state, result, routeStatus } = useStore()
  const routes = [...result.routes.values()]
  const seats = state.buses.reduce((sum, b) => sum + b.capacity, 0)

  let assigned = 0
  let walkTotal = 0
  let noCoverage = 0
  let full = 0
  for (const a of result.byStudent.values()) {
    if (a.status === 'assigned') {
      assigned++
      walkTotal += a.walkMeters
    } else if (a.reason === 'no-coverage') noCoverage++
    else full++
  }
  const waitlisted = noCoverage + full
  const fillPct = seats > 0 ? Math.round((assigned / seats) * 100) : 0

  const waiting = state.students
    .filter((s) => result.byStudent.get(s.id)?.status === 'waitlisted')
    .sort((a, b) => a.registeredAt - b.registeredAt)
  const recent = [...state.students].sort((a, b) => b.registeredAt - a.registeredAt).slice(0, 6)

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <PageHeader
        title="Transport overview"
        description="Seats are assigned automatically from each family's home pin. Change a bus or a route and every assignment updates instantly."
        actions={<SimulationPanel />}
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Bus />} label="Buses" value={state.buses.length} detail={`${seats} seats in total`} />
        <StatTile icon={<Armchair />} label="Students seated" value={`${assigned} / ${seats}`} detail={`${fillPct}% of seats filled`} />
        <StatTile icon={<Hourglass />} label="Waitlisted" value={waitlisted} detail={`${full} waiting for a seat · ${noCoverage} outside routes`} />
        <StatTile
          icon={<Footprints />}
          label="Average walk to pickup"
          value={assigned ? formatDistance(walkTotal / assigned) : '—'}
          detail={`Limit ${formatDistance(state.settings.maxWalkMeters)}`}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <CardHeader title="Route network" description="Each dot is a student's home, colored by the bus they ride. Click a route to edit it." />
          <div className="relative mt-4 h-[460px] border-t border-line xl:h-[560px]">
            <BaseMap center={state.settings.location} zoom={12} label="Map of all bus routes, stops and student homes">
              <NetworkLayers
                state={state}
                result={result}
                routeStatus={routeStatus}
                showHomes
                onSelectBus={(id) => navigate(`/school/fleet?bus=${id}`)}
              />
              <LiveBuses routes={routes} settings={state.settings} />
            </BaseMap>
            <MapLegend buses={state.buses} />
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Seats by bus" description="Seats taken and seats left on each bus." />
            <ul className="flex flex-col gap-1 p-3">
              {state.buses.map((bus) => {
                const used = result.load.get(bus.id) ?? 0
                return (
                  <li key={bus.id}>
                    <a
                      href={href(`/school/fleet?bus=${bus.id}`)}
                      className="flex flex-col gap-2 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-muted"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <BusChip bus={bus} className="text-sm text-ink" />
                          <span className="truncate text-xs text-ink-3">{bus.plate}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-bold text-ink tabular">
                            {used}/{bus.capacity}
                          </span>
                          <CapacityBadge used={used} capacity={bus.capacity} />
                        </span>
                      </div>
                      <CapacityMeter used={used} capacity={bus.capacity} colorSlot={bus.colorSlot} />
                    </a>
                  </li>
                )
              })}
              {state.buses.length === 0 && (
                <EmptyState icon={<Bus />} title="No buses yet" action={<a className="font-bold text-primary" href={href('/school/fleet')}>Add your first bus</a>} />
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Waitlist"
              description={waiting.length ? 'Waiting longest first.' : undefined}
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
              <p className="px-5 pb-5 pt-2 text-sm text-ink-3">Every student who asked for a bus has a seat.</p>
            ) : (
              <ul className="flex flex-col p-3">
                {waiting.slice(0, 5).map((s) => {
                  const a = result.byStudent.get(s.id)
                  const reason = a?.status === 'waitlisted' ? a.reason : null
                  const nearest = a?.status === 'waitlisted' && a.nearestBusId ? state.buses.find((b) => b.id === a.nearestBusId) : undefined
                  return (
                    <li key={s.id} className="flex items-start gap-3 rounded-xl px-2.5 py-2">
                      {reason === 'no-coverage' ? (
                        <MapPinOff className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden="true" />
                      ) : (
                        <Hourglass className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {s.name} <span className="font-normal text-ink-3">· {s.grade}</span>
                        </p>
                        <p className="text-xs text-ink-3">
                          {reason === 'no-coverage'
                            ? `No route within ${formatDistance(state.settings.maxWalkMeters)}${a?.status === 'waitlisted' && a.nearestMeters ? ` (closest ${formatDistance(a.nearestMeters)})` : ''}`
                            : `${nearest?.label ?? 'Nearby buses'} full: add seats or a bus`}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Latest requests" description="From the parent app." />
            {recent.length === 0 ? (
              <EmptyState icon={<Inbox />} title="No requests yet" />
            ) : (
              <ul className="flex flex-col p-3">
                {recent.map((s) => {
                  const a = result.byStudent.get(s.id)
                  const bus = a?.status === 'assigned' ? state.buses.find((b) => b.id === a.busId) : undefined
                  return (
                    <li key={s.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                        <p className="text-xs text-ink-3">{timeAgo(s.registeredAt)}</p>
                      </div>
                      {bus ? (
                        <BusChip bus={bus} variant="solid" />
                      ) : (
                        <Badge tone="warning" icon={<Hourglass />}>
                          Waitlisted
                        </Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

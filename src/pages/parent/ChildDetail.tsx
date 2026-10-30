import { ArrowLeft, BellRing, Bus, Check, MapPinned, Pencil, School, Sparkles, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Marker, Polyline } from 'react-leaflet'
import { BaseMap, FitBounds } from '../../components/map/BaseMap'
import { homeIcon, pickupIcon } from '../../components/map/icons'
import { CoverageLayer, LiveVehicles, RouteLine, SchoolMarker, StartMarker, StopMarkers } from '../../components/map/layers'
import { SimulationPanel } from '../../components/SimulationPanel'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Select } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/misc'
import { ConfettiBurst } from '../../components/ui/motion'
import { useToast } from '../../components/ui/toast-context'
import { VehicleIcon } from '../../components/ui/VehicleChip'
import { routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { effectiveWalk } from '../../lib/engine/boarding'
import { explainSeat } from '../../lib/engine/explain'
import { liveVehicle, type RouteView, type StudentView } from '../../lib/engine/view'
import { formatDistance, haversine } from '../../lib/geo'
import { EASE_OUT } from '../../lib/motion'
import { href, navigate } from '../../lib/router'
import { formatClock, formatDuration } from '../../lib/time'
import type { Settings } from '../../lib/types'
import { useSimClock } from '../../sim/context'
import { pinStudentStop, removeStudent } from '../../store/actions'
import { useStore } from '../../store/context'
import { DEMO_PARENT } from '../../store/state'
import { BoardingPass, WaitlistCard } from './BoardingPass'

type Seated = Extract<StudentView, { status: 'seated' }>

export function ChildDetail({ id, isNew }: { id: string; isNew: boolean }) {
  const { state, view, routeStatus, update } = useStore()
  const toast = useToast()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const child = state.students.find((s) => s.id === id && s.parentId === DEMO_PARENT.id)

  if (!child) {
    return (
      <EmptyState icon={<MapPinned />} title="This request isn't available" action={<ButtonLink href={href('/parent')}>Back to my children</ButtonLink>} className="py-20">
        It may have been cancelled, or the demo data was reset.
      </EmptyState>
    )
  }

  const student = view.students.get(child.id)
  const seated = student?.status === 'seated' ? student : null
  const route = seated?.route
  const firstName = child.name.split(' ')[0]
  const routes = [...view.routes.values()]
  const walk = effectiveWalk(state.settings)

  const nearbyStops = state.plan.stops
    .map((stop) => ({ stop, meters: haversine(child.home, stop.position) }))
    .filter((o) => o.meters <= walk * 1.5 || o.stop.id === child.pinnedStopId)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, 6)

  const cancel = () => {
    update((s) => removeStudent(s, child.id))
    toast({ tone: 'info', title: 'Request cancelled', description: `${firstName}'s seat has been released to the next child in the queue.` })
    navigate('/parent')
  }

  const fitPoints = [child.home, state.settings.location, ...(route ? route.stops.map((s) => s.position) : [])]

  return (
    <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(380px,460px)_1fr]">
      <div className="relative flex min-w-0 flex-col gap-5">
        {isNew && seated && <ConfettiBurst />}
        <a href={href('/parent')} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink-3 transition-colors hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" />
          My children
        </a>

        {isNew && (
          <motion.div
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className={cn('flex items-center gap-3 rounded-2xl p-3.5', seated ? 'bg-success-soft' : 'bg-warning-soft')}
          >
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-white', seated ? 'bg-success' : 'bg-warning')}>
              <Check className="size-4" strokeWidth={3} aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-ink">{seated ? `Seat confirmed. ${firstName} rides ${seated.vehicle.label} from ${seated.stop.name}.` : `Request received. ${firstName} is in the queue, and you'll see the vehicle here as soon as there's a seat.`}</p>
          </motion.div>
        )}

        {seated ? <BoardingPass student={seated} /> : student?.status === 'waitlisted' ? <WaitlistCard student={student} settings={state.settings} /> : null}

        <div className="flex flex-wrap gap-2">
          <ButtonLink href={href(`/parent/request?edit=${child.id}`)} variant="secondary" size="sm">
            <Pencil className="size-4" aria-hidden="true" />
            Change home location
          </ButtonLink>
          <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} className="text-danger-ink hover:bg-danger-soft hover:text-danger-ink">
            <Trash2 className="size-4" aria-hidden="true" />
            Cancel request
          </Button>
        </div>

        {seated && route && <LiveTripCard route={route} seated={seated} settings={state.settings} firstName={firstName} />}

        {seated && route && <RouteTimeline route={route} seated={seated} settings={state.settings} schoolName={state.settings.name} />}

        {seated && (
          <Card>
            <CardHeader icon={<Sparkles className="size-5" />} title="Why this boarding point" />
            <ul className="flex list-disc flex-col gap-1 px-5 pb-4 pl-10 pt-3 text-sm leading-relaxed text-ink-2">
              {explainSeat(seated).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {nearbyStops.length > 1 && (
              <div className="p-5 pt-1">
                <Field label="Prefer another stop?" hint="Your choice is kept when routes are re-planned.">
                  {(p) => (
                    <Select
                      {...p}
                      value={child.pinnedStopId ?? 'auto'}
                      onChange={(e) => {
                        update((s) => pinStudentStop(s, child.id, e.target.value === 'auto' ? null : e.target.value))
                        toast({ tone: 'success', title: 'Boarding point updated', description: 'The pickup time has been recalculated.' })
                      }}
                    >
                      <option value="auto">Automatic (recommended)</option>
                      {nearbyStops.map(({ stop, meters }) => (
                        <option key={stop.id} value={stop.id}>
                          {stop.name} · {formatDistance(meters)} walk
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="h-[56vh] min-h-[340px] overflow-hidden rounded-3xl lg:sticky lg:top-[5.5rem] lg:h-[calc(100dvh-7rem)]">
        <BaseMap center={child.home} zoom={14} label={`Map of ${firstName}'s route, boarding point and home`}>
          <FitBounds points={fitPoints} fitKey={`child-${child.id}-${route?.vehicle.id ?? 'none'}`} />
          {!seated && <CoverageLayer routes={routes} meters={state.settings.maxWalkMeters} />}
          {!seated && routes.map((r) => <RouteLine key={r.vehicle.id} route={r} emphasis="dim" approximate={routeStatus[r.vehicle.id] === 'straight'} />)}
          {seated && route && (
            <>
              <RouteLine route={route} emphasis="focus" approximate={routeStatus[route.vehicle.id] === 'straight'} />
              <StopMarkers route={route} />
              <StartMarker vehicle={route.vehicle} />
              <Polyline positions={[child.home, seated.position]} pathOptions={{ color: '#15163a', weight: 2.5, dashArray: '2 7', lineCap: 'round', interactive: false }} />
              <Marker position={seated.position} icon={pickupIcon(routeColor(route.vehicle.colorSlot))} keyboard={false} title="Boarding point" />
              <LiveVehicles routes={[route]} settings={state.settings} />
            </>
          )}
          <SchoolMarker position={state.settings.location} name={state.settings.name} />
          <Marker position={child.home} icon={homeIcon()} zIndexOffset={800} keyboard={false} title="Home" />
        </BaseMap>
      </div>

      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        size="sm"
        title={`Cancel ${firstName}'s request?`}
        description={seated ? 'The seat is released and goes to the next child waiting.' : 'You will leave the waitlist.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              Keep request
            </Button>
            <Button variant="danger" onClick={cancel}>
              Cancel request
            </Button>
          </>
        }
      />
    </div>
  )
}

function milestone(route: RouteView, seated: Seated, clock: number, settings: Settings, firstName: string) {
  const live = liveVehicle(route, clock, settings)
  const stop = route.stops.find((s) => s.stop.id === seated.stop.id)
  const stopAlong = stop?.along ?? 0
  const minutes = seated.pickup - clock
  const scale = route.metersToSchool / Math.max(route.schoolAlong, 1)
  const meters = (stopAlong - live.along) * scale
  const { label } = route.vehicle
  if (live.phase === 'arrived') return { live, stopAlong, tone: 'done' as const, title: `${firstName} has reached school`, body: `Arrived at ${formatClock(route.arrival)}.` }
  if (minutes <= 0) return { live, stopAlong, tone: 'done' as const, title: `${firstName} is on board`, body: `Reaching school at ${formatClock(route.arrival)}.` }
  if (live.phase === 'scheduled') return { live, stopAlong, tone: 'idle' as const, title: `${label} hasn't left yet`, body: `Leaves ${route.vehicle.start.name} at ${formatClock(route.departure)}.` }
  if (minutes <= 3) return { live, stopAlong, tone: 'alert' as const, title: 'Head out now', body: `${label} is ${formatDistance(Math.max(0, meters))} away, about ${formatDuration(minutes)}.` }
  return { live, stopAlong, tone: 'moving' as const, title: `Arriving in ${formatDuration(minutes)}`, body: `${label} is ${formatDistance(meters)} from ${seated.stop.name}.` }
}

/** Plays tomorrow's run and shows how far away the vehicle is. Re-renders every simulation tick. */
function LiveTripCard({ route, seated, settings, firstName }: { route: RouteView; seated: Seated; settings: Settings; firstName: string }) {
  const clock = useSimClock()
  const status = clock === null ? null : milestone(route, seated, clock, settings, firstName)
  const progress = status ? Math.min(1, status.live.along / Math.max(1, status.stopAlong)) : 0

  return (
    <section aria-labelledby="live-heading" className="gradient-night rounded-3xl p-5 text-white">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-accent" aria-hidden="true">
          {status?.tone === 'alert' ? <BellRing className="size-5 animate-pulse" /> : status?.tone === 'done' ? <School className="size-5" /> : <Bus className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="live-heading" className="text-base font-bold">
            {status ? status.title : 'Live tracking'}
          </h2>
          <p className="mt-0.5 text-sm text-night-ink">{status ? status.body : "See how tomorrow's morning run plays out, sped up."}</p>
        </div>
      </div>

      {status && (
        <div className="mt-5">
          <div className="relative h-7" role="progressbar" aria-label="Progress towards your boarding point" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${progress})` }} />
            </div>
            <span className="absolute top-0 grid size-7 -translate-x-1/2 place-items-center rounded-full bg-accent text-on-accent" style={{ left: `${Math.max(3.5, Math.min(96.5, progress * 100))}%` }} aria-hidden="true">
              <VehicleIcon type={route.vehicle.type} className="size-4" />
            </span>
          </div>
          <div className="mt-1.5 flex justify-between gap-3 text-xs font-semibold text-night-ink">
            <span className="truncate">{route.vehicle.start.name}</span>
            <span className="truncate">
              {seated.stop.name} · {formatClock(seated.pickup)}
            </span>
          </div>
        </div>
      )}

      {/* Announce only milestone changes, not every tick. */}
      <p className="sr-only" aria-live="polite">
        {status?.title}
      </p>
      <div className="mt-4">
        <SimulationPanel label="Simulate tomorrow's pickup" startAt={route.departure - 1} />
      </div>
    </section>
  )
}

function RouteTimeline({ route, seated, settings, schoolName }: { route: RouteView; seated: Seated; settings: Settings; schoolName: string }) {
  const clock = useSimClock()
  const color = routeColor(route.vehicle.colorSlot)
  const rows = [
    { key: 'start', label: route.vehicle.start.name, time: route.departure, kind: 'start' as const },
    ...route.stops.map((s) => ({ key: s.stop.id, label: s.stop.name, time: s.pickup, kind: s.stop.id === seated.stop.id ? ('mine' as const) : ('stop' as const) })),
    { key: 'school', label: schoolName, time: route.arrival, kind: 'school' as const },
  ]

  return (
    <Card>
      <CardHeader title="Morning route" description={`${route.stops.length} stops · ${formatDistance(route.metersToSchool)} · ${formatDuration(route.arrival - route.departure)} at about ${route.vehicle.type === 'bus' ? settings.speedBusKmh : settings.speedVanKmh} km/h`} />
      <ol className="relative flex flex-col px-5 py-4">
        {rows.map((row, i) => {
          const passed = clock !== null && clock >= row.time
          return (
            <li key={row.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < rows.length - 1 && <span className="absolute left-[11px] top-6 h-full w-0.5 transition-opacity duration-500" style={{ background: color, opacity: passed ? 1 : 0.3 }} aria-hidden="true" />}
              <span
                className={cn('relative z-10 mt-0.5 size-6 shrink-0 rounded-full border-2 border-white transition-transform duration-300', row.kind === 'mine' && 'ring-4 ring-primary/20', passed && 'scale-110')}
                style={{ background: row.kind === 'school' ? 'var(--color-ink)' : row.kind === 'mine' ? 'var(--color-primary)' : color }}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span className={cn('truncate text-sm', row.kind === 'mine' || row.kind === 'school' ? 'font-bold text-ink' : 'text-ink-2')}>
                  {row.label}
                  {row.kind === 'mine' ? ' (your stop)' : row.kind === 'start' ? ' (start)' : ''}
                </span>
                <span className="shrink-0 text-sm font-semibold text-ink tabular">{formatClock(row.time)}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

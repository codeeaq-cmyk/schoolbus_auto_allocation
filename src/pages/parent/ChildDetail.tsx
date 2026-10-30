import { ArrowLeft, BellRing, Bus, CircleCheck, MapPinned, PartyPopper, Pencil, School, Sparkles, Trash2 } from 'lucide-react'
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
import { EmptyState, Initials } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { effectiveWalk } from '../../lib/engine/boarding'
import { explainSeat } from '../../lib/engine/explain'
import { liveVehicle, type RouteView, type StudentView } from '../../lib/engine/view'
import { formatDistance, haversine } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { formatClock, formatDuration } from '../../lib/time'
import type { Settings } from '../../lib/types'
import { useSimClock } from '../../sim/context'
import { pinStudentStop, removeStudent } from '../../store/actions'
import { useStore } from '../../store/context'
import { DEMO_PARENT } from '../../store/state'
import { AssignmentDetails, StatusBadge } from './AssignmentDetails'

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
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(380px,480px)_1fr]">
      <div className="flex min-w-0 flex-col gap-5">
        <a href={href('/parent')} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" />
          My children
        </a>

        {isNew && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft p-4 animate-rise">
            {seated ? <PartyPopper className="mt-0.5 size-5 shrink-0 text-success-ink" aria-hidden="true" /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-ink" aria-hidden="true" />}
            <div>
              <p className="font-bold text-success-ink">Request received</p>
              <p className="text-sm text-ink-2">{seated ? `${firstName} has a seat on ${seated.vehicle.label}, boarding at ${seated.stop.name}. The school can already see it.` : `${firstName} is on the waitlist. You'll see the vehicle here as soon as a seat is assigned.`}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <Initials name={child.name} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{child.name}</h1>
            <p className="text-sm text-ink-3">
              {child.grade} · {child.address}
            </p>
          </div>
          <StatusBadge student={student} />
        </div>

        <Card className="p-5">
          <AssignmentDetails student={student} settings={state.settings} />
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <ButtonLink href={href(`/parent/request?edit=${child.id}`)} variant="secondary" size="sm">
              <Pencil className="size-4" aria-hidden="true" />
              Change home location
            </ButtonLink>
            <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} className="text-danger-ink hover:bg-danger-soft hover:text-danger-ink">
              <Trash2 className="size-4" aria-hidden="true" />
              Cancel request
            </Button>
          </div>
        </Card>

        {seated && (
          <Card>
            <CardHeader icon={<Sparkles className="size-5" />} title="Why this boarding point" />
            <ul className="flex list-disc flex-col gap-1 px-5 pb-4 pl-10 pt-3 text-sm text-ink-2">
              {explainSeat(seated).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {nearbyStops.length > 1 && (
              <div className="border-t border-line p-5">
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

        {seated && route && (
          <>
            <LiveTripCard route={route} seated={seated} settings={state.settings} firstName={firstName} />
            <RouteTimeline route={route} seated={seated} schoolName={state.settings.name} />
          </>
        )}
      </div>

      <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border border-line shadow-card lg:sticky lg:top-[5.5rem] lg:h-[calc(100dvh-7rem)]">
        <BaseMap center={child.home} zoom={14} label={`Map of ${firstName}'s route, boarding point and home`}>
          <FitBounds points={fitPoints} fitKey={`child-${child.id}-${route?.vehicle.id ?? 'none'}`} />
          {!seated && <CoverageLayer routes={routes} meters={state.settings.maxWalkMeters} />}
          {!seated && routes.map((r) => <RouteLine key={r.vehicle.id} route={r} emphasis="dim" approximate={routeStatus[r.vehicle.id] !== 'road'} />)}
          {seated && route && (
            <>
              <RouteLine route={route} emphasis="focus" approximate={routeStatus[route.vehicle.id] !== 'road'} />
              <StopMarkers route={route} />
              <StartMarker vehicle={route.vehicle} />
              <Polyline positions={[child.home, seated.position]} pathOptions={{ color: '#1e1b4b', weight: 2.5, dashArray: '4 6', interactive: false }} />
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
    <Card>
      <CardHeader icon={<Bus className="size-5" />} title="Live tracking" description={clock === null ? "Watch tomorrow's morning run play out, sped up." : `${route.vehicle.label} · simulated`} />
      <div className="flex flex-col gap-4 p-5">
        {status && (
          <div className={cn('flex items-start gap-3 rounded-xl p-3.5', status.tone === 'alert' ? 'bg-warning-soft' : status.tone === 'done' ? 'bg-success-soft' : 'bg-muted')}>
            {status.tone === 'alert' ? <BellRing className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden="true" /> : status.tone === 'done' ? <School className="mt-0.5 size-5 shrink-0 text-success-ink" aria-hidden="true" /> : <Bus className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden="true" />}
            <div className="min-w-0">
              <p className={cn('font-bold', status.tone === 'alert' ? 'text-warning-ink' : status.tone === 'done' ? 'text-success-ink' : 'text-ink')}>{status.title}</p>
              <p className="text-sm text-ink-2">{status.body}</p>
            </div>
          </div>
        )}
        {status && (
          <div>
            <div className="flex justify-between gap-3 text-xs font-semibold text-ink-3">
              <span className="truncate">{route.vehicle.start.name}</span>
              <span className="truncate">
                {seated.stop.name} · {formatClock(seated.pickup)}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progress towards your boarding point" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: routeColor(route.vehicle.colorSlot) }} />
            </div>
          </div>
        )}
        {/* Announce only milestone changes, not every tick. */}
        <p className="sr-only" aria-live="polite">
          {status?.title}
        </p>
        <SimulationPanel label="Simulate tomorrow's pickup" className="self-start" startAt={route.departure - 1} />
      </div>
    </Card>
  )
}

function RouteTimeline({ route, seated, schoolName }: { route: RouteView; seated: Seated; schoolName: string }) {
  const color = routeColor(route.vehicle.colorSlot)
  const rows = [
    { key: 'start', label: route.vehicle.start.name, time: route.departure, kind: 'start' as const },
    ...route.stops.map((s) => ({ key: s.stop.id, label: s.stop.name, time: s.pickup, kind: s.stop.id === seated.stop.id ? ('mine' as const) : ('stop' as const) })),
    { key: 'school', label: schoolName, time: route.arrival, kind: 'school' as const },
  ]

  return (
    <Card>
      <CardHeader title="Morning route" description={`${route.stops.length} stops · ${formatDistance(route.metersToSchool)} · ${formatDuration(route.arrival - route.departure)}`} />
      <ol className="relative flex flex-col px-5 py-4">
        {rows.map((row, i) => (
          <li key={row.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < rows.length - 1 && <span className="absolute left-[11px] top-6 h-full w-0.5" style={{ background: color, opacity: 0.35 }} aria-hidden="true" />}
            <span
              className={cn('relative z-10 mt-0.5 size-6 shrink-0 rounded-full border-2 border-white shadow-sm', row.kind === 'mine' && 'ring-4 ring-primary/20')}
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
        ))}
      </ol>
    </Card>
  )
}

import { ArrowLeft, BellRing, Bus, CircleCheck, MapPinned, PartyPopper, Pencil, School, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Marker, Polyline } from 'react-leaflet'
import { BaseMap, FitBounds } from '../../components/map/BaseMap'
import { homeIcon, pickupIcon } from '../../components/map/icons'
import { CoverageLayer, LiveBuses, RouteLine, SchoolMarker, StopMarkers } from '../../components/map/layers'
import { SimulationPanel } from '../../components/SimulationPanel'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState, Initials } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { liveBus, timeAtAlong, type BusRoute } from '../../lib/assign'
import { routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { formatDistance } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { formatClock, formatDuration } from '../../lib/time'
import type { Assignment, SchoolSettings } from '../../lib/types'
import { useSimClock } from '../../sim/context'
import { useStore } from '../../store/context'
import { DEMO_PARENT } from '../../store/state'
import { AssignmentDetails, StatusBadge } from './AssignmentDetails'

type Assigned = Extract<Assignment, { status: 'assigned' }>

export function ChildDetail({ id, isNew }: { id: string; isNew: boolean }) {
  const { state, result, routeStatus, dispatch } = useStore()
  const toast = useToast()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const student = state.students.find((s) => s.id === id && s.parentId === DEMO_PARENT.id)

  if (!student) {
    return (
      <EmptyState icon={<MapPinned />} title="This request isn't available" action={<ButtonLink href={href('/parent')}>Back to my children</ButtonLink>} className="py-20">
        It may have been cancelled, or the demo data was reset.
      </EmptyState>
    )
  }

  const assignment = result.byStudent.get(student.id)
  const assigned = assignment?.status === 'assigned' ? assignment : null
  const routeId = assignment?.status === 'assigned' ? assignment.busId : assignment?.nearestBusId
  const route = routeId ? result.routes.get(routeId) : undefined
  const firstName = student.name.split(' ')[0]

  const cancel = () => {
    dispatch({ type: 'student/remove', id: student.id })
    toast({ tone: 'info', title: 'Bus request cancelled', description: `${firstName}'s seat has been released to the next child in the queue.` })
    navigate('/parent')
  }

  const fitPoints = [student.home, state.settings.location, ...(route ? route.bus.stops.map((s) => s.position) : [])]

  return (
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(380px,460px)_1fr]">
      <div className="flex min-w-0 flex-col gap-5">
        <a href={href('/parent')} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" />
          My children
        </a>

        {isNew && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft p-4 animate-rise">
            {assigned ? <PartyPopper className="mt-0.5 size-5 shrink-0 text-success-ink" aria-hidden="true" /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-ink" aria-hidden="true" />}
            <div>
              <p className="font-bold text-success-ink">Request received</p>
              <p className="text-sm text-ink-2">
                {assigned && route
                  ? `${firstName} has been placed on ${route.bus.label}. The school transport team can already see it.`
                  : `${firstName} is on the waitlist. You'll see the bus here as soon as a seat is assigned.`}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <Initials name={student.name} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{student.name}</h1>
            <p className="text-sm text-ink-3">
              {student.grade} · {student.address}
            </p>
          </div>
          <StatusBadge assignment={assignment} />
        </div>

        <Card className="p-5">
          <AssignmentDetails student={student} assignment={assignment} result={result} students={state.students} settings={state.settings} />
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <ButtonLink href={href(`/parent/request?edit=${student.id}`)} variant="secondary" size="sm">
              <Pencil className="size-4" aria-hidden="true" />
              Change home location
            </ButtonLink>
            <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} className="text-danger-ink hover:bg-danger-soft hover:text-danger-ink">
              <Trash2 className="size-4" aria-hidden="true" />
              Cancel request
            </Button>
          </div>
        </Card>

        {assigned && route && (
          <>
            <LiveTripCard route={route} assignment={assigned} settings={state.settings} firstName={firstName} />
            <RouteTimeline route={route} assignment={assigned} settings={state.settings} schoolName={state.settings.name} />
          </>
        )}
      </div>

      <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border border-line shadow-card lg:sticky lg:top-[5.5rem] lg:h-[calc(100dvh-7rem)]">
        <BaseMap center={student.home} zoom={14} label={`Map of ${firstName}'s bus route, pickup point and home`}>
          <FitBounds points={fitPoints} fitKey={`child-${student.id}-${route?.bus.id ?? 'none'}`} />
          {!assigned && <CoverageLayer routes={[...result.routes.values()]} meters={state.settings.maxWalkMeters} />}
          {!assigned && [...result.routes.values()].map((r) => <RouteLine key={r.bus.id} route={r} emphasis={r.bus.id === route?.bus.id ? 'normal' : 'dim'} approximate={routeStatus[r.bus.id] !== 'road'} />)}
          {assigned && route && (
            <>
              <RouteLine route={route} emphasis="focus" approximate={routeStatus[route.bus.id] !== 'road'} />
              <StopMarkers route={route} settings={state.settings} />
              <Polyline positions={[student.home, assigned.pickup]} pathOptions={{ color: '#1e1b4b', weight: 2.5, dashArray: '4 6', interactive: false }} />
              <Marker position={assigned.pickup} icon={pickupIcon(routeColor(route.bus.colorSlot))} keyboard={false} title="Pickup point" />
              <LiveBuses routes={[route]} settings={state.settings} />
            </>
          )}
          <SchoolMarker position={state.settings.location} name={state.settings.name} />
          <Marker position={student.home} icon={homeIcon()} zIndexOffset={800} keyboard={false} title="Home" />
        </BaseMap>
      </div>

      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        size="sm"
        title={`Cancel ${firstName}'s bus request?`}
        description={assigned ? 'The seat is released and goes to the next child waiting for this bus.' : 'You will leave the waitlist.'}
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

function milestone(route: BusRoute, assignment: Assigned, clock: number, settings: SchoolSettings, firstName: string) {
  const live = liveBus(route, clock, settings)
  const minutesToPickup = assignment.pickupMinutes - clock
  const meters = assignment.alongMeters - live.along
  if (live.phase === 'arrived') return { live, tone: 'done' as const, title: `${firstName} has reached school`, body: `Arrived at ${formatClock(route.arrival)}.` }
  if (meters <= 0) return { live, tone: 'done' as const, title: `${firstName} is on board`, body: `Reaching school at ${formatClock(route.arrival)}.` }
  if (live.phase === 'scheduled')
    return { live, tone: 'idle' as const, title: `${route.bus.label} hasn't left yet`, body: `Leaves ${route.bus.stops[0]?.name ?? 'the first stop'} at ${formatClock(route.departure)}.` }
  if (minutesToPickup <= 3)
    return { live, tone: 'alert' as const, title: 'Head out now', body: `${route.bus.label} is ${formatDistance(meters)} away, about ${formatDuration(minutesToPickup)}.` }
  return { live, tone: 'moving' as const, title: `Arriving in ${formatDuration(minutesToPickup)}`, body: `${route.bus.label} is ${formatDistance(meters)} from your pickup point.` }
}

/** Plays tomorrow's run and shows how far away the bus is. Re-renders every simulation tick. */
function LiveTripCard({ route, assignment, settings, firstName }: { route: BusRoute; assignment: Assigned; settings: SchoolSettings; firstName: string }) {
  const clock = useSimClock()
  const state = clock === null ? null : milestone(route, assignment, clock, settings, firstName)
  const progress = state ? Math.min(1, state.live.along / Math.max(1, assignment.alongMeters)) : 0

  return (
    <Card>
      <CardHeader
        icon={<Bus className="size-5" />}
        title="Live bus tracking"
        description={clock === null ? "Watch tomorrow's morning run play out, sped up." : `${route.bus.label} · simulated`}
      />
      <div className="flex flex-col gap-4 p-5">
        {state && (
          <div
            className={cn(
              'flex items-start gap-3 rounded-xl p-3.5',
              state.tone === 'alert' ? 'bg-warning-soft' : state.tone === 'done' ? 'bg-success-soft' : 'bg-muted',
            )}
          >
            {state.tone === 'alert' ? (
              <BellRing className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden="true" />
            ) : state.tone === 'done' ? (
              <School className="mt-0.5 size-5 shrink-0 text-success-ink" aria-hidden="true" />
            ) : (
              <Bus className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className={cn('font-bold', state.tone === 'alert' ? 'text-warning-ink' : state.tone === 'done' ? 'text-success-ink' : 'text-ink')}>{state.title}</p>
              <p className="text-sm text-ink-2">{state.body}</p>
            </div>
          </div>
        )}
        {state && (
          <div>
            <div className="flex justify-between text-xs font-semibold text-ink-3">
              <span>{route.bus.stops[0]?.name ?? 'Start'}</span>
              <span>Your pickup · {formatClock(assignment.pickupMinutes)}</span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Bus progress towards your pickup point"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: routeColor(route.bus.colorSlot) }} />
            </div>
          </div>
        )}
        {/* Announce only milestone changes, not every tick. */}
        <p className="sr-only" aria-live="polite">
          {state?.title}
        </p>
        <SimulationPanel label="Simulate tomorrow's pickup" className="self-start" startAt={route.departure - 1} />
      </div>
    </Card>
  )
}

function RouteTimeline({ route, assignment, settings, schoolName }: { route: BusRoute; assignment: Assigned; settings: SchoolSettings; schoolName: string }) {
  const color = routeColor(route.bus.colorSlot)
  const rows = [
    ...route.bus.stops.map((stop, i) => ({ key: stop.id, label: stop.name, along: route.stopAlong[i], kind: 'stop' as const })),
    { key: 'pickup', label: 'Your pickup point', along: assignment.alongMeters, kind: 'pickup' as const },
  ].sort((a, b) => a.along - b.along)

  return (
    <Card>
      <CardHeader title="Morning route" description={`${route.bus.stops.length} stops · ${formatDistance(route.geometry.length)} · ${formatDuration(route.arrival - route.departure)}`} />
      <ol className="relative flex flex-col px-5 py-4">
        {[...rows, { key: 'school', label: schoolName, along: route.geometry.length, kind: 'school' as const }].map((row, i, all) => (
          <li key={row.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < all.length - 1 && <span className="absolute left-[11px] top-6 h-full w-0.5" style={{ background: color, opacity: 0.35 }} aria-hidden="true" />}
            <span
              className={cn(
                'relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 border-white text-[10px] font-extrabold shadow-sm',
                row.kind === 'pickup' && 'ring-4 ring-primary/20',
              )}
              style={{ background: row.kind === 'school' ? 'var(--color-ink)' : row.kind === 'pickup' ? 'var(--color-primary)' : color }}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <span className={cn('truncate text-sm', row.kind === 'stop' ? 'text-ink-2' : 'font-bold text-ink')}>{row.label}</span>
              <span className="shrink-0 text-sm font-semibold text-ink tabular">{formatClock(timeAtAlong(route, row.along, settings))}</span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

import { BadgeCheck, Clock4, Footprints, Hourglass, MapPin, MapPinOff, Phone, Pin } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/ui/Badge'
import { BusChip } from '../../components/ui/BusChip'
import { arrivalMinutes, waitlistPosition, type AssignmentResult } from '../../lib/assign'
import { formatDistance } from '../../lib/geo'
import { formatClock } from '../../lib/time'
import type { Assignment, SchoolSettings, Student } from '../../lib/types'

export function StatusBadge({ assignment }: { assignment: Assignment | undefined }) {
  if (!assignment) return null
  if (assignment.status === 'assigned') {
    return (
      <Badge tone="success" icon={<BadgeCheck />}>
        Seat confirmed
      </Badge>
    )
  }
  return (
    <Badge tone="warning" icon={<Hourglass />}>
      Waitlisted
    </Badge>
  )
}

function Fact({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-ink-2 [&>svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
        <p className="font-bold text-ink">{value}</p>
        {sub && <p className="text-sm text-ink-3">{sub}</p>}
      </div>
    </div>
  )
}

interface DetailsProps {
  student: Student
  assignment: Assignment | undefined
  result: AssignmentResult
  students: Student[]
  settings: SchoolSettings
  compact?: boolean
}

/** What the parent needs to know: which bus, where, when, and who to call. */
export function AssignmentDetails({ student, assignment, result, students, settings, compact }: DetailsProps) {
  if (!assignment) return null
  const firstName = student.name.split(' ')[0]

  if (assignment.status === 'assigned') {
    const bus = result.routes.get(assignment.busId)?.bus
    if (!bus) return null
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <BusChip bus={bus} variant="solid" className="text-sm" />
          <span className="text-sm font-medium text-ink-3">{bus.plate}</span>
          {assignment.manual && (
            <Badge tone="primary" icon={<Pin />}>
              Assigned by school
            </Badge>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact icon={<Clock4 />} label="Morning pickup" value={formatClock(assignment.pickupMinutes)} sub={`Reaches school ${formatClock(arrivalMinutes(settings))}`} />
          <Fact
            icon={<MapPin />}
            label="Pickup point"
            value={assignment.nearestStop ? `Near ${assignment.nearestStop.name}` : 'On the route'}
            sub="Roadside, on the bus route"
          />
          <Fact icon={<Footprints />} label="Walk from home" value={formatDistance(assignment.walkMeters)} sub={`About ${Math.max(1, Math.round(assignment.walkMeters / 75))} min on foot`} />
          {!compact && (
            <Fact
              icon={<Phone />}
              label="Driver"
              value={bus.driverName}
              sub={
                <a className="font-semibold text-primary underline-offset-2 hover:underline" href={`tel:${bus.driverPhone.replace(/\s/g, '')}`}>
                  {bus.driverPhone}
                </a>
              }
            />
          )}
        </div>
      </div>
    )
  }

  const nearestBus = assignment.nearestBusId ? result.routes.get(assignment.nearestBusId)?.bus : undefined
  const position = waitlistPosition(result, students, student.id)
  return (
    <div className="flex flex-col gap-3">
      {assignment.reason === 'buses-full' ? (
        <>
          <p className="text-[15px] text-ink-2">
            {nearestBus ? (
              <>
                <BusChip bus={nearestBus} className="text-ink" /> passes {formatDistance(assignment.nearestMeters ?? 0)} from home, but every seat
                on the buses near you is taken.
              </>
            ) : (
              'Every bus near you is full.'
            )}
          </p>
          {position && (
            <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-semibold text-warning-ink">
              {firstName} is #{position} in the queue. When a seat opens up, it's assigned automatically and you'll see it here.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="flex items-start gap-2 text-[15px] text-ink-2">
            <MapPinOff className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden="true" />
            <span>
              No bus route passes within {formatDistance(settings.maxWalkMeters)} of your home
              {assignment.nearestMeters !== null && nearestBus && (
                <>
                  {' '}
                  (the closest is <BusChip bus={nearestBus} className="text-ink" />, {formatDistance(assignment.nearestMeters)} away)
                </>
              )}
              .
            </span>
          </p>
          <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-semibold text-warning-ink">
            The transport team can see your request. If they extend a route to your area, {firstName} gets a seat automatically.
          </p>
        </>
      )}
    </div>
  )
}

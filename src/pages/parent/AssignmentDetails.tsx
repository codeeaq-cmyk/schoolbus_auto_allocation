import { BadgeCheck, Clock4, Footprints, Hourglass, IndianRupee, MapPin, MapPinOff, Moon, Phone, Pin } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/ui/Badge'
import { VehicleChip } from '../../components/ui/VehicleChip'
import { waitReasonText } from '../../lib/engine/explain'
import { VEHICLE_NAMES } from '../../lib/engine/presets'
import type { StudentView } from '../../lib/engine/view'
import { inr } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { formatClock } from '../../lib/time'
import type { Settings } from '../../lib/types'

export function StatusBadge({ student }: { student: StudentView | undefined }) {
  if (!student) return null
  if (student.status === 'seated') {
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
  student: StudentView | undefined
  settings: Settings
  compact?: boolean
}

/** What the parent needs to know: which vehicle, where, when, how much and who to call. */
export function AssignmentDetails({ student, settings, compact }: DetailsProps) {
  if (!student) return null

  if (student.status === 'seated') {
    const { vehicle, stop } = student
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <VehicleChip vehicle={vehicle} variant="solid" className="text-sm" />
          <span className="text-sm font-medium text-ink-3">
            {VEHICLE_NAMES[vehicle.type]}
            {vehicle.plate ? ` · ${vehicle.plate}` : ''}
          </span>
          {(student.student.pinnedVehicleId || student.student.pinnedStopId) && (
            <Badge tone="primary" icon={<Pin />}>
              Set by hand
            </Badge>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact icon={<MapPin />} label="Boarding point" value={stop.name} sub={`${formatDistance(student.walkMeters)} walk, about ${Math.max(1, Math.round(student.walkMeters / 75))} min`} />
          <Fact icon={<Clock4 />} label="Morning pickup" value={formatClock(student.pickup)} sub={`At school by ${formatClock(student.route.arrival)}`} />
          <Fact icon={<Moon />} label="Evening drop" value={`About ${formatClock(student.dropoff)}`} sub={`${Math.round(student.rideMin)} min on board`} />
          <Fact icon={<IndianRupee />} label="Transport fee" value={`${inr(student.fee)} a month`} sub={student.student.feeOverride !== null ? 'Set by the school' : 'Based on distance to school'} />
          {!compact && (
            <Fact
              icon={<Phone />}
              label="Driver"
              value={vehicle.driverName}
              sub={
                vehicle.driverPhone ? (
                  <a className="font-semibold text-primary underline-offset-2 hover:underline" href={`tel:${vehicle.driverPhone.replace(/\s/g, '')}`}>
                    {vehicle.driverPhone}
                  </a>
                ) : undefined
              }
            />
          )}
          {!compact && <Fact icon={<Footprints />} label="Starts from" value={vehicle.start.name} sub={`Leaves at ${formatClock(student.route.departure)}`} />}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-[15px] text-ink-2">
        <MapPinOff className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden="true" />
        <span>{waitReasonText(student.reason, settings)}</span>
      </p>
      <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-semibold text-warning-ink">The school's transport team can see this request. The fee will be about {inr(student.fee)} a month once a seat is assigned.</p>
    </div>
  )
}

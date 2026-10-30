import { BadgeCheck, Footprints, Hourglass, IndianRupee, MapPinOff, Moon, Phone, Timer } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/ui/Badge'
import { VehicleIcon } from '../../components/ui/VehicleChip'
import { cn } from '../../lib/cn'
import { inkOn, routeColor } from '../../lib/colors'
import { waitReasonText } from '../../lib/engine/explain'
import { VEHICLE_NAMES } from '../../lib/engine/presets'
import type { StudentView } from '../../lib/engine/view'
import { inr } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { EASE_OUT } from '../../lib/motion'
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
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-tonal text-ink-2 [&>svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-3">{label}</p>
        <p className="truncate text-sm font-bold text-ink">{value}</p>
        {sub && <p className="truncate text-xs text-ink-3">{sub}</p>}
      </div>
    </div>
  )
}

type Seated = Extract<StudentView, { status: 'seated' }>

/** Everything a family needs for the morning, on one ticket. */
export function BoardingPass({ student, compact, onCard }: { student: Seated; compact?: boolean; onCard?: boolean }) {
  const { vehicle, stop, route } = student
  const color = routeColor(vehicle.colorSlot)
  const manual = student.student.pinnedVehicleId || student.student.pinnedStopId
  return (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <div className="ticket-top gradient-night rounded-t-3xl px-5 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-night-ink">Boarding pass</p>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: color, color: inkOn(color) }}>
            <VehicleIcon type={vehicle.type} className="size-3.5" />
            {vehicle.label}
          </span>
        </div>
        <h3 className="mt-2 truncate text-xl font-extrabold">{student.student.name}</h3>
        <p className="truncate text-sm text-night-ink">
          {student.student.grade} · {VEHICLE_NAMES[vehicle.type]}
          {vehicle.plate ? ` ${vehicle.plate}` : ''}
          {manual ? ' · Set by hand' : ''}
        </p>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="min-w-0">
            <p className="text-2xl font-extrabold leading-none tracking-tight tabular">{formatClock(student.pickup)}</p>
            <p className="mt-1.5 truncate text-xs font-medium text-night-ink">{stop.name}</p>
          </div>
          <div className="relative flex h-6 w-16 items-center sm:w-24" aria-hidden="true">
            <span className="w-full border-t-2 border-dashed border-white/25" />
            <motion.span
              className="absolute grid size-6 place-items-center rounded-full bg-accent text-on-accent"
              initial={{ left: '0%' }}
              animate={{ left: 'calc(100% - 1.5rem)' }}
              transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse', repeatDelay: 0.5 }}
            >
              <VehicleIcon type={vehicle.type} className="size-3.5" />
            </motion.span>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-2xl font-extrabold leading-none tracking-tight tabular">{formatClock(route.arrival)}</p>
            <p className="mt-1.5 truncate text-xs font-medium text-night-ink">At school</p>
          </div>
        </div>
      </div>

      <div className={cn('ticket-bottom grid grid-cols-2 gap-x-3 gap-y-3.5 rounded-b-3xl px-5 py-4', onCard ? 'bg-muted' : 'bg-surface')}>
        <Fact icon={<Footprints />} label="Walk from home" value={formatDistance(student.walkMeters)} sub={`About ${Math.max(1, Math.round(student.walkMeters / 75))} min`} />
        <Fact icon={<Moon />} label="Evening drop" value={`About ${formatClock(student.dropoff)}`} />
        <Fact icon={<Timer />} label="On board" value={`${Math.round(student.rideMin)} min`} />
        <Fact icon={<IndianRupee />} label="Fee a month" value={inr(student.fee)} sub={student.student.feeOverride !== null ? 'Set by the school' : undefined} />
        {!compact && (
          <div className="col-span-2 flex items-center justify-between gap-3 rounded-2xl bg-muted px-3.5 py-2.5">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink-3">Your driver</span>
              <span className="block truncate text-sm font-bold text-ink">{vehicle.driverName}</span>
            </span>
            {vehicle.driverPhone && (
              <a href={`tel:${vehicle.driverPhone.replace(/\s/g, '')}`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-surface px-3 text-sm font-bold text-primary transition-colors">
                <Phone className="size-4" aria-hidden="true" />
                Call
              </a>
            )}
          </div>
        )}
      </div>
    </motion.article>
  )
}

/** The honest version when no seat can be offered yet: why, and what happens next. */
export function WaitlistCard({ student, settings }: { student: Extract<StudentView, { status: 'waitlisted' }>; settings: Settings }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, ease: EASE_OUT }} className="rounded-3xl bg-warning-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface text-warning-ink" aria-hidden="true">
          {student.reason === 'too-far' || student.reason === 'no-road' ? <MapPinOff className="size-5" /> : <Hourglass className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="font-bold text-ink">{student.student.name || 'Your child'} is on the waitlist</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{waitReasonText(student.reason, settings)}</p>
          <p className="mt-2 text-sm font-semibold text-warning-ink">The school can see this request. Expect a fee of about {inr(student.fee)} a month once seated.</p>
        </div>
      </div>
    </motion.div>
  )
}

import { ChevronRight, Download, Hourglass, MapPinOff, RotateCcw, Search, Sparkles, Trash2, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { DecisionChip } from '../../components/ui/AutoChip'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Segmented } from '../../components/ui/controls'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select } from '../../components/ui/Field'
import { EmptyState, Initials, PageHeader } from '../../components/ui/misc'
import { Stagger, StaggerItem } from '../../components/ui/motion'
import { useToast } from '../../components/ui/toast-context'
import { VehicleChip } from '../../components/ui/VehicleChip'
import { cn } from '../../lib/cn'
import { downloadCsv } from '../../lib/csv'
import { effectiveWalk } from '../../lib/engine/boarding'
import { explainSeat, waitReasonText } from '../../lib/engine/explain'
import { canReach, seatCounts } from '../../lib/engine/plan'
import { feeForStop, type StudentView } from '../../lib/engine/view'
import { inr } from '../../lib/format'
import { formatDistance, haversine } from '../../lib/geo'
import { formatClock, timeAgo } from '../../lib/time'
import type { Student, WaitReason } from '../../lib/types'
import { pinStudentStop, pinStudentVehicle, removeStudent, setStudentFee, updateStudent } from '../../store/actions'
import { useStore } from '../../store/context'

type StatusFilter = 'all' | 'seated' | 'waitlisted'

const WAIT_LABEL: Record<WaitReason, string> = {
  'too-far': 'Beyond the ride limit',
  'no-road': 'No road in reach',
  'no-van': 'Needs a van seat',
  'no-route': 'No route passes nearby',
  'seats-full': 'Waiting for a seat',
}

function WaitBadge({ reason }: { reason: WaitReason }) {
  return (
    <Badge tone="warning" icon={reason === 'too-far' || reason === 'no-road' ? <MapPinOff /> : <Hourglass />}>
      Waitlisted
    </Badge>
  )
}

export function Students({ initialStatus }: { initialStatus: string | null }) {
  const { state, view } = useStore()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>(initialStatus === 'seated' || initialStatus === 'waitlisted' ? initialStatus : 'all')
  const [vehicleFilter, setVehicleFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = editingId ? state.students.find((s) => s.id === editingId) : undefined

  const counts = { all: state.students.length, seated: 0, waitlisted: 0 }
  for (const student of view.students.values()) counts[student.status]++

  const needle = query.trim().toLowerCase()
  const rows = state.students
    .map((student) => view.students.get(student.id)!)
    .filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (vehicleFilter !== 'all' && !(row.status === 'seated' && row.vehicle.id === vehicleFilter)) return false
      if (!needle) return true
      const s = row.student
      return [s.name, s.parentName, s.parentPhone, s.grade, s.address, row.status === 'seated' ? row.stop.name : ''].some((v) => v.toLowerCase().includes(needle))
    })
    .sort((a, b) => b.student.registeredAt - a.student.registeredAt)

  const exportCsv = () =>
    downloadCsv('students.csv', [
      ['Child', 'Class', 'Parent', 'Phone', 'Status', 'Vehicle', 'Boarding point', 'Pickup', 'Drop', 'Walk (m)', 'Ride (min)', 'Fee a month', 'Address'],
      ...rows.map((row) => {
        const s = row.student
        const seated = row.status === 'seated' ? row : null
        return [
          s.name,
          s.grade,
          s.parentName,
          s.parentPhone,
          seated ? 'Seated' : `Waitlisted (${row.status === 'waitlisted' ? WAIT_LABEL[row.reason] : ''})`,
          seated?.vehicle.label ?? '',
          seated?.stop.name ?? '',
          seated ? formatClock(seated.pickup) : '',
          seated ? formatClock(seated.dropoff) : '',
          seated ? Math.round(seated.walkMeters) : '',
          seated ? Math.round(seated.rideMin) : '',
          row.fee,
          s.address,
        ]
      }),
    ])

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Students"
        description="Everyone who asked for a seat and what the system decided. Open any child to see why, or to overrule it."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-4" aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <label htmlFor="student-search" className="sr-only">
            Search students
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input id="student-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, parent, stop…" className="pl-9" />
        </div>
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={(['all', 'seated', 'waitlisted'] as const).map((s) => ({
            id: s,
            label: (
              <>
                <span className="capitalize">{s}</span>
                <span className="text-xs font-bold text-ink-3 tabular">{counts[s]}</span>
              </>
            ),
          }))}
        />
        <div className="lg:w-52">
          <label htmlFor="vehicle-filter" className="sr-only">
            Filter by vehicle
          </label>
          <Select id="vehicle-filter" value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}>
            <option value="all">All vehicles</option>
            {state.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-ink-3 lg:ml-auto" aria-live="polite">
          Showing {rows.length} of {state.students.length}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="mt-4">
          <EmptyState icon={<UsersRound />} title="No students match">
            Try a different search or filter.
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Phones get cards rather than a table that scrolls sideways. */}
          <Stagger as="ul" className="mt-4 flex flex-col gap-2.5 lg:hidden">
            {rows.slice(0, 60).map((row) => (
              <StaggerItem as="li" key={row.student.id}>
                <button type="button" onClick={() => setEditingId(row.student.id)} aria-label={`Review ${row.student.name}`} className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-surface p-3.5 text-left transition-[background-color,transform] hover:bg-primary-soft active:scale-[0.99]">
                  <Initials name={row.student.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{row.student.name}</span>
                    <span className="block truncate text-xs text-ink-3">{row.status === 'seated' ? `${row.stop.name} · ${formatClock(row.pickup)}` : WAIT_LABEL[row.reason]}</span>
                  </span>
                  {row.status === 'seated' ? <VehicleChip vehicle={row.vehicle} variant="solid" /> : <WaitBadge reason={row.reason} />}
                  <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                </button>
              </StaggerItem>
            ))}
            {rows.length > 60 && <li className="py-2 text-center text-sm text-ink-3">Showing the 60 newest. Search to find others.</li>}
          </Stagger>

          <Card className="relative mt-4 hidden overflow-hidden lg:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Students and their automatic or manual transport decisions</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-3">
                  <th scope="col" className="px-5 py-3.5">Child</th>
                  <th scope="col" className="px-3 py-3.5">Vehicle</th>
                  <th scope="col" className="px-3 py-3.5">Boarding point</th>
                  <th scope="col" className="px-3 py-3.5">Pickup</th>
                  <th scope="col" className="px-3 py-3.5 text-right">Walk</th>
                  <th scope="col" className="px-3 py-3.5 text-right">Ride</th>
                  <th scope="col" className="px-3 py-3.5 text-right">Fee</th>
                  <th scope="col" className="px-3 py-3.5">Requested</th>
                  <th scope="col" className="px-5 py-3.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {rows.map((row) => (
                  <Row key={row.student.id} row={row} maxRide={state.settings.maxRideMin} onOpen={() => setEditingId(row.student.id)} />
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {editing && <StudentDialog key={editing.id} student={editing} onClose={() => setEditingId(null)} />}
    </div>
  )
}

function Row({ row, maxRide, onOpen }: { row: StudentView; maxRide: number; onOpen: () => void }) {
  const s = row.student
  const overLimit = row.status === 'seated' && row.rideMin > maxRide
  return (
    <tr className="group cursor-pointer transition-colors hover:bg-primary-soft/50" onClick={onOpen}>
      <td className="whitespace-nowrap px-5 py-3">
        <span className="flex items-center gap-3">
          <Initials name={s.name} className="size-9 rounded-xl text-xs" />
          <span>
            <span className="block font-semibold text-ink">{s.name}</span>
            <span className="block text-xs text-ink-3">{s.grade}</span>
          </span>
        </span>
      </td>
      <td className="px-3 py-3">
        {row.status === 'seated' ? (
          <span className="flex items-center gap-2">
            <VehicleChip vehicle={row.vehicle} variant="solid" />
            {s.pinnedVehicleId && <DecisionChip manual />}
          </span>
        ) : (
          <WaitBadge reason={row.reason} />
        )}
      </td>
      <td className="px-3 py-3">
        {row.status === 'seated' ? (
          <span className="flex items-center gap-2">
            <span className="max-w-[220px] truncate text-ink-2">{row.stop.name}</span>
            {s.pinnedStopId && <DecisionChip manual />}
          </span>
        ) : (
          <span className="text-xs text-ink-3">{WAIT_LABEL[row.reason]}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink tabular">{row.status === 'seated' ? formatClock(row.pickup) : '—'}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right text-ink-2 tabular">{row.status === 'seated' ? formatDistance(row.walkMeters) : '—'}</td>
      <td className={cn('whitespace-nowrap px-3 py-3 text-right tabular', overLimit ? 'font-bold text-danger-ink' : 'text-ink-2')}>{row.status === 'seated' ? `${Math.round(row.rideMin)} min` : '—'}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right text-ink-2 tabular">
        {inr(row.fee)}
        {s.feeOverride !== null && <span className="sr-only"> (set by hand)</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-ink-3">{timeAgo(s.registeredAt)}</td>
      <td className="px-5 py-2 text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-xl px-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary-soft"
        >
          Review
          <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      </td>
    </tr>
  )
}

/** Why the system decided what it did, and the controls to overrule it. */
function StudentDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const { state, view, update } = useStore()
  const toast = useToast()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [fee, setFee] = useState(student.feeOverride === null ? '' : String(student.feeOverride))
  const row = view.students.get(student.id)!
  const seat = state.plan.seats[student.id]
  const counts = seatCounts(state.plan)
  const stopNow = seat ? state.plan.stops.find((s) => s.id === seat.stopId) : undefined
  const reasons = explainSeat(row)
  const walk = effectiveWalk(state.settings)

  // Boarding points a child could reasonably walk to.
  const stops = state.plan.stops
    .map((stop) => ({ stop, walk: haversine(student.home, stop.position) }))
    .filter(({ walk: d, stop }) => d <= walk * 2 || stop.id === student.pinnedStopId)
    .sort((a, b) => a.walk - b.walk)

  const hasOverride = student.pinnedVehicleId || student.pinnedStopId || student.feeOverride !== null
  const standardFee = stopNow ? feeForStop(stopNow.position, state.settings) : feeForStop(student.home, state.settings)

  return (
    <Dialog open drawer onOpenChange={(open) => !open && onClose()} title={student.name} description={`${student.grade} · ${student.address} · ${student.parentName}, ${student.parentPhone}`}>
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl bg-primary-soft/70 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Why this decision
          </p>
          {row.status === 'seated' ? (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-2">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{waitReasonText(row.reason, state.settings)}</p>
          )}
        </div>

        <Field label="Vehicle" hint={student.pinnedVehicleId ? 'Pinned by hand: the detour limit is ignored for this child' : 'Chosen automatically'}>
          {(p) => (
            <Select
              {...p}
              value={student.pinnedVehicleId ?? 'auto'}
              onChange={(e) => {
                update((s) => pinStudentVehicle(s, student.id, e.target.value === 'auto' ? null : e.target.value))
                toast({ tone: 'success', title: 'Vehicle updated', description: 'Pinned children keep their seat when routes are re-planned.' })
              }}
            >
              <option value="auto">Automatic{row.status === 'seated' && !student.pinnedVehicleId ? ` (${row.vehicle.label})` : ''}</option>
              {state.vehicles
                .filter((v) => v.enabled)
                .map((v) => {
                  const onIt = seat?.vehicleId === v.id
                  const free = v.seats - (counts.get(v.id) ?? 0)
                  const reachable = !stopNow || canReach(v, stopNow)
                  return (
                    <option key={v.id} value={v.id} disabled={!reachable || (!onIt && free <= 0)}>
                      {v.label} · {!reachable ? "can't reach this stop" : onIt ? 'current' : free > 0 ? `${free} free` : 'full'}
                    </option>
                  )
                })}
            </Select>
          )}
        </Field>

        <Field label="Boarding point" hint={student.pinnedStopId ? 'Chosen by hand' : `Chosen automatically, within ${formatDistance(walk)} on foot`}>
          {(p) => (
            <Select
              {...p}
              value={student.pinnedStopId ?? 'auto'}
              onChange={(e) => {
                update((s) => pinStudentStop(s, student.id, e.target.value === 'auto' ? null : e.target.value))
                toast({ tone: 'success', title: 'Boarding point updated' })
              }}
            >
              <option value="auto">Automatic{row.status === 'seated' && !student.pinnedStopId ? ` (${row.stop.name})` : ''}</option>
              {stops.map(({ stop, walk: d }) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name} · {formatDistance(d)} walk
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Monthly fee" hint={`Standard fee for this distance: ${inr(standardFee)}. Leave blank to use it.`}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              step={50}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              onBlur={() => {
                const value = fee.trim() === '' ? null : Math.max(0, Number(fee))
                if (value !== student.feeOverride) update((s) => setStudentFee(s, student.id, value))
              }}
              placeholder={String(standardFee)}
            />
          )}
        </Field>

        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" className="text-danger-ink hover:bg-danger-soft hover:text-danger-ink" onClick={() => setConfirmRemove(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Remove
          </Button>
          <div className="flex gap-2">
            {hasOverride && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  update((s) => updateStudent(s, student.id, { pinnedVehicleId: null, pinnedStopId: null, feeOverride: null }))
                  setFee('')
                  toast({ tone: 'success', title: 'Back on automatic' })
                }}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Reset to automatic
              </Button>
            )}
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        size="sm"
        title={`Remove ${student.name}?`}
        description="Their request is deleted and the seat goes to the next child waiting."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                update((s) => removeStudent(s, student.id))
                toast({ tone: 'info', title: `${student.name} removed` })
                setConfirmRemove(false)
                onClose()
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </Dialog>
  )
}

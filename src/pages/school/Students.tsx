import { Download, Hourglass, MapPinOff, Pin, Search, Trash2, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { BusChip } from '../../components/ui/BusChip'
import { Card } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { Input, Select } from '../../components/ui/Field'
import { EmptyState, PageHeader } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { cn } from '../../lib/cn'
import { downloadCsv } from '../../lib/csv'
import { formatDistance, projectOnRoute } from '../../lib/geo'
import { formatClock, timeAgo } from '../../lib/time'
import type { Student } from '../../lib/types'
import { useStore } from '../../store/context'

type StatusFilter = 'all' | 'assigned' | 'waitlisted'

export function Students({ initialStatus }: { initialStatus: string | null }) {
  const { state, result, dispatch } = useStore()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>(initialStatus === 'assigned' || initialStatus === 'waitlisted' ? initialStatus : 'all')
  const [busFilter, setBusFilter] = useState('all')
  const [removing, setRemoving] = useState<Student | null>(null)

  // Distance from every home to every route, used to label the manual-assign options.
  const distances = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const s of state.students) {
      const perBus = new Map<string, number>()
      for (const route of result.routes.values()) {
        const p = projectOnRoute(s.home, route.geometry)
        if (p) perBus.set(route.bus.id, p.distance)
      }
      map.set(s.id, perBus)
    }
    return map
  }, [state.students, result.routes])

  const counts = { all: state.students.length, assigned: 0, waitlisted: 0 }
  for (const a of result.byStudent.values()) counts[a.status]++

  const needle = query.trim().toLowerCase()
  const rows = state.students
    .map((student) => ({ student, assignment: result.byStudent.get(student.id)! }))
    .filter(({ student, assignment }) => {
      if (status !== 'all' && assignment.status !== status) return false
      if (busFilter !== 'all' && !(assignment.status === 'assigned' && assignment.busId === busFilter)) return false
      if (!needle) return true
      return [student.name, student.parentName, student.parentPhone, student.grade, student.address].some((v) => v.toLowerCase().includes(needle))
    })
    .sort((a, b) => b.student.registeredAt - a.student.registeredAt)

  const reassign = (student: Student, value: string) => {
    const manualBusId = value === 'auto' ? null : value
    dispatch({ type: 'student/update', id: student.id, patch: { manualBusId } })
    const bus = state.buses.find((b) => b.id === manualBusId)
    toast({
      tone: 'success',
      title: bus ? `${student.name} pinned to ${bus.label}` : `${student.name} back on automatic`,
      description: bus ? 'Pinned students keep their seat ahead of automatic matches.' : 'The nearest route with a free seat will be used.',
    })
  }

  const exportCsv = () =>
    downloadCsv('students.csv', [
      ['Student', 'Class', 'Parent', 'Phone', 'Status', 'Bus', 'Pickup time', 'Near stop', 'Walk (m)', 'Address'],
      ...rows.map(({ student, assignment }) => {
        const bus = assignment.status === 'assigned' ? state.buses.find((b) => b.id === assignment.busId) : undefined
        return [
          student.name,
          student.grade,
          student.parentName,
          student.parentPhone,
          assignment.status === 'assigned' ? 'Assigned' : assignment.reason === 'no-coverage' ? 'Waitlisted (outside routes)' : 'Waitlisted (buses full)',
          bus?.label ?? '',
          assignment.status === 'assigned' ? formatClock(assignment.pickupMinutes) : '',
          assignment.status === 'assigned' ? (assignment.nearestStop?.name ?? '') : '',
          assignment.status === 'assigned' ? Math.round(assignment.walkMeters) : '',
          student.address,
        ]
      }),
    ])

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <PageHeader
        title="Students"
        description="Everyone who asked for a bus, with the seat they were given. Pin a student to a bus to override automatic matching."
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
          <Input id="student-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, parent, phone…" className="pl-9" />
        </div>
        <div className="flex items-center rounded-xl bg-muted p-1" role="group" aria-label="Filter by status">
          {(['all', 'assigned', 'waitlisted'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                'flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold capitalize transition-colors',
                status === s ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
              )}
            >
              {s}
              <span className="rounded-md bg-muted px-1.5 text-xs tabular">{counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="lg:w-56">
          <label htmlFor="bus-filter" className="sr-only">
            Filter by bus
          </label>
          <Select id="bus-filter" value={busFilter} onChange={(e) => setBusFilter(e.target.value)}>
            <option value="all">All buses</option>
            {state.buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-ink-3 lg:ml-auto" aria-live="polite">
          Showing {rows.length} of {state.students.length}
        </p>
      </div>

      <Card className="mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<UsersRound />} title="No students match">
            Try a different search or filter.
          </EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <caption className="sr-only">Students and their bus assignments</caption>
              <thead>
                <tr className="border-b border-line bg-muted/70 text-left text-xs font-bold uppercase tracking-wide text-ink-3">
                  <th scope="col" className="px-4 py-3">Student</th>
                  <th scope="col" className="px-4 py-3">Parent</th>
                  <th scope="col" className="px-4 py-3">Bus</th>
                  <th scope="col" className="px-4 py-3">Pickup</th>
                  <th scope="col" className="px-4 py-3 text-right">Walk</th>
                  <th scope="col" className="px-4 py-3">Requested</th>
                  <th scope="col" className="px-4 py-3">Assign</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ student, assignment }) => {
                  const bus = assignment.status === 'assigned' ? state.buses.find((b) => b.id === assignment.busId) : undefined
                  return (
                    <tr key={student.id} className="transition-colors hover:bg-muted/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-semibold text-ink">{student.name}</p>
                        <p className="text-xs text-ink-3">{student.grade}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="text-ink-2">{student.parentName}</p>
                        <p className="text-xs text-ink-3 tabular">{student.parentPhone}</p>
                      </td>
                      <td className="px-4 py-3">
                        {assignment.status === 'assigned' && bus ? (
                          <span className="flex items-center gap-2">
                            <BusChip bus={bus} variant="solid" />
                            {assignment.manual && (
                              <Badge tone="primary" icon={<Pin />}>
                                Pinned
                              </Badge>
                            )}
                          </span>
                        ) : assignment.status === 'waitlisted' ? (
                          <span className="flex flex-col items-start gap-1">
                            <Badge tone="warning" icon={assignment.reason === 'no-coverage' ? <MapPinOff /> : <Hourglass />}>
                              Waitlisted
                            </Badge>
                            <span className="text-xs text-ink-3">{assignment.reason === 'no-coverage' ? 'Outside every route' : 'Nearby buses full'}</span>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {assignment.status === 'assigned' ? (
                          <>
                            <p className="font-semibold text-ink tabular">{formatClock(assignment.pickupMinutes)}</p>
                            <p className="max-w-[200px] truncate text-xs text-ink-3">near {assignment.nearestStop?.name ?? 'route'}</p>
                          </>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        {assignment.status === 'assigned' ? (
                          <span className={cn(assignment.walkMeters > state.settings.maxWalkMeters && 'font-semibold text-warning-ink')}>{formatDistance(assignment.walkMeters)}</span>
                        ) : assignment.nearestMeters !== null ? (
                          <span className="text-ink-3">{formatDistance(assignment.nearestMeters)}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-3">{timeAgo(student.registeredAt)}</td>
                      <td className="px-4 py-3">
                        <Select
                          aria-label={`Bus for ${student.name}`}
                          value={student.manualBusId ?? 'auto'}
                          onChange={(e) => reassign(student, e.target.value)}
                          className="h-9! min-w-[200px] text-sm"
                        >
                          <option value="auto">Automatic</option>
                          {state.buses.map((b) => {
                            const onIt = assignment.status === 'assigned' && assignment.busId === b.id
                            const free = b.capacity - (result.load.get(b.id) ?? 0)
                            const distance = distances.get(student.id)?.get(b.id)
                            const routable = b.stops.length > 0
                            return (
                              <option key={b.id} value={b.id} disabled={!routable || (!onIt && free <= 0)}>
                                {b.label} · {!routable ? 'no route' : onIt ? 'current' : free > 0 ? `${free} free` : 'full'}
                                {distance !== undefined && routable ? ` · ${formatDistance(distance)}` : ''}
                              </option>
                            )
                          })}
                        </Select>
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => setRemoving(student)}
                          aria-label={`Remove ${student.name}`}
                          title="Remove"
                          className="grid size-9 cursor-pointer place-items-center rounded-lg text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger-ink"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        size="sm"
        title={`Remove ${removing?.name}?`}
        description="Their bus request is deleted and the seat goes to the next student waiting."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (removing) {
                  dispatch({ type: 'student/remove', id: removing.id })
                  toast({ tone: 'info', title: `${removing.name} removed` })
                }
                setRemoving(null)
              }}
            >
              Remove student
            </Button>
          </>
        }
      />
    </div>
  )
}

import type { Marker as LeafletMarker } from 'leaflet'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Download,
  LoaderCircle,
  MapPinPlus,
  Pencil,
  Pin,
  Plus,
  Route as RouteIcon,
  School,
  Spline,
  Trash2,
  TriangleAlert,
  UsersRound,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import { BaseMap, FitBounds, MapClick } from '../../components/map/BaseMap'
import { stopIcon } from '../../components/map/icons'
import { NetworkLayers } from '../../components/map/NetworkLayers'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { BusChip } from '../../components/ui/BusChip'
import { CapacityBadge, CapacityMeter } from '../../components/ui/CapacityMeter'
import { Stepper, Tabs } from '../../components/ui/controls'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { busManifest, networkBounds, timeAtAlong, type BusRoute } from '../../lib/assign'
import { inkOn, nextColorSlot, routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { downloadCsv } from '../../lib/csv'
import { formatDistance } from '../../lib/geo'
import { navigate } from '../../lib/router'
import { reverseGeocode } from '../../lib/services'
import { formatClock, formatDuration } from '../../lib/time'
import type { Bus, LatLng } from '../../lib/types'
import { useStore, type RouteStatus } from '../../store/context'
import { uid } from '../../store/state'
import { BusFormDialog, type BusFields } from './BusFormDialog'

const select = (id: string | null) => navigate(id ? `/school/fleet?bus=${id}` : '/school/fleet')

export function Fleet({ selectedId }: { selectedId: string | null }) {
  const { state, result, routeStatus, dispatch } = useStore()
  const toast = useToast()
  const [dialog, setDialog] = useState<'add' | 'edit' | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const bus = selectedId ? state.buses.find((b) => b.id === selectedId) : undefined
  const route = bus ? result.routes.get(bus.id) : undefined
  // Placing stops is the obvious next step for a bus without a route.
  const adding = !!bus && (addingFor === bus.id || bus.stops.length === 0)

  const addBus = (fields: BusFields) => {
    const id = uid('bus')
    dispatch({
      type: 'bus/add',
      bus: { id, ...fields, colorSlot: nextColorSlot(state.buses.map((b) => b.colorSlot)), stops: [], path: null, pathKey: null },
    })
    setDialog(null)
    setAddingFor(id)
    select(id)
    toast({ tone: 'success', title: `${fields.label} added`, description: 'Click on the map to place its first stop.' })
  }

  const addStop = (p: LatLng) => {
    if (!bus) return
    const name = `Stop ${bus.stops.length + 1}`
    const stop = { id: uid('stop'), name, position: p }
    dispatch({ type: 'bus/update', id: bus.id, patch: { stops: [...bus.stops, stop] } })
    reverseGeocode(p).then((label) => {
      if (label) dispatch({ type: 'stop/rename', busId: bus.id, stopId: stop.id, name: label.split(', ').slice(0, 2).join(', '), onlyIf: name })
    })
  }

  const moveStop = (index: number, p: LatLng) => {
    if (!bus) return
    dispatch({ type: 'bus/update', id: bus.id, patch: { stops: bus.stops.map((s, i) => (i === index ? { ...s, position: p } : s)) } })
  }

  const focusPoints = bus && bus.stops.length > 0 ? [...bus.stops.map((s) => s.position), state.settings.location] : networkBounds(state, [...result.routes.values()])

  return (
    <div className="grid flex-1 grid-cols-1 lg:h-[calc(100dvh-7.25rem)] lg:grid-cols-[minmax(380px,440px)_1fr]">
      <div className={cn('relative order-first h-[50vh] min-h-[340px] border-b border-line lg:order-none lg:col-start-2 lg:row-start-1 lg:h-auto lg:border-b-0 lg:border-l', adding && 'map-crosshair')}>
        <BaseMap center={state.settings.location} zoom={12} label={adding ? `Route editor for ${bus?.label}. Click the map to add a stop.` : 'Fleet route map'}>
          <FitBounds points={focusPoints} fitKey={`fleet-${bus?.id ?? 'all'}`} />
          <NetworkLayers
            state={state}
            result={result}
            routeStatus={routeStatus}
            focusBusId={bus?.id}
            showStops={!bus}
            showHomes={!!bus}
            onSelectBus={adding ? undefined : (id) => select(id)}
            fit={false}
          />
          {bus && <EditableStops bus={bus} onMove={moveStop} />}
          {adding && <MapClick onClick={addStop} />}
        </BaseMap>
        {adding && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
            <div className="flex items-center gap-2 rounded-full bg-ink/90 px-3.5 py-2 text-xs font-semibold text-white shadow-float">
              <MapPinPlus className="size-4" aria-hidden="true" />
              Click the map to add stop {bus!.stops.length + 1} · drag stops to move them
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto">
        {bus && route ? (
          <BusEditor
            key={bus.id}
            bus={bus}
            route={route}
            status={routeStatus[bus.id]}
            adding={adding}
            onToggleAdding={() => setAddingFor(adding ? null : bus.id)}
            onEdit={() => setDialog('edit')}
          />
        ) : (
          <BusList onAdd={() => setDialog('add')} missing={!!selectedId && !bus} />
        )}
      </div>

      <BusFormDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        mode={dialog === 'edit' ? 'edit' : 'add'}
        initial={
          dialog === 'edit' && bus
            ? bus
            : { label: `Bus ${String(state.buses.length + 1).padStart(2, '0')}`, plate: '', capacity: 12, driverName: '', driverPhone: '' }
        }
        onSubmit={(fields) => {
          if (dialog === 'edit' && bus) {
            dispatch({ type: 'bus/update', id: bus.id, patch: fields })
            setDialog(null)
            toast({ tone: 'success', title: `${fields.label} updated` })
          } else addBus(fields)
        }}
      />
    </div>
  )
}

function EditableStops({ bus, onMove }: { bus: Bus; onMove: (index: number, p: LatLng) => void }) {
  const color = routeColor(bus.colorSlot)
  return (
    <>
      {bus.stops.map((stop, i) => (
        <Marker
          key={stop.id}
          position={stop.position}
          icon={stopIcon(color, String(i + 1), true)}
          draggable
          zIndexOffset={600}
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as LeafletMarker).getLatLng()
              onMove(i, { lat: ll.lat, lng: ll.lng })
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -14]} className="route-tooltip">
            {i + 1}. {stop.name} · drag to move
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}

function BusList({ onAdd, missing }: { onAdd: () => void; missing: boolean }) {
  const { state, result, routeStatus } = useStore()
  const seats = state.buses.reduce((sum, b) => sum + b.capacity, 0)
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Fleet & routes</h1>
          <p className="text-sm text-ink-3">
            {state.buses.length} buses · {seats} seats
          </p>
        </div>
        <Button onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Add bus
        </Button>
      </div>

      {missing && (
        <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning-ink">That bus no longer exists. It may have been removed in another tab.</p>
      )}

      {state.buses.length === 0 ? (
        <EmptyState icon={<RouteIcon />} title="No buses yet" action={<Button onClick={onAdd}>Add your first bus</Button>}>
          Add a bus, set its seats, then click the map to draw its route.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {state.buses.map((bus) => {
            const used = result.load.get(bus.id) ?? 0
            const route = result.routes.get(bus.id)
            return (
              <li key={bus.id}>
                <button
                  type="button"
                  onClick={() => select(bus.id)}
                  className="group flex w-full cursor-pointer flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-float"
                >
                  <div className="flex w-full items-center gap-2">
                    <BusChip bus={bus} variant="solid" className="text-sm" />
                    <span className="truncate text-sm text-ink-3">{bus.plate}</span>
                    <ChevronRight className="ml-auto size-5 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  <div className="flex w-full items-center justify-between gap-2 text-sm">
                    <span className="truncate text-ink-2">{bus.driverName}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-ink tabular">
                        {used}/{bus.capacity}
                      </span>
                      <CapacityBadge used={used} capacity={bus.capacity} />
                    </span>
                  </div>
                  <CapacityMeter used={used} capacity={bus.capacity} colorSlot={bus.colorSlot} />
                  {route && bus.stops.length > 0 ? (
                    <RouteSummary route={route} status={routeStatus[bus.id]} />
                  ) : (
                    <Badge tone="warning" icon={<TriangleAlert />}>
                      No route yet
                    </Badge>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="rounded-2xl border border-dashed border-line-strong bg-primary-soft/60 p-4 text-sm text-ink-2">
        <strong className="text-ink">Try it:</strong> open a full bus and add a few seats. Waitlisted students are seated immediately, and their parents see it
        in the parent app.
      </p>
    </div>
  )
}

function RouteSummary({ route, status }: { route: BusRoute; status: RouteStatus | undefined }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-3">
      {status === 'loading' ? (
        <span className="flex items-center gap-1 text-primary">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          Snapping to roads…
        </span>
      ) : status === 'straight' ? (
        <span className="flex items-center gap-1 text-warning-ink">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          Approximate path (road service offline)
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <Spline className="size-3.5" aria-hidden="true" />
          Road route
        </span>
      )}
      <span aria-hidden="true">·</span>
      <span>{route.bus.stops.length} stops</span>
      <span aria-hidden="true">·</span>
      <span>{formatDistance(route.geometry.length)}</span>
      <span aria-hidden="true">·</span>
      <span>
        {formatClock(route.departure)} → {formatClock(route.arrival)}
      </span>
    </span>
  )
}

interface EditorProps {
  bus: Bus
  route: BusRoute
  status: RouteStatus | undefined
  adding: boolean
  onToggleAdding: () => void
  onEdit: () => void
}

function BusEditor({ bus, route, status, adding, onToggleAdding, onEdit }: EditorProps) {
  const { state, result, dispatch } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<'route' | 'students'>('route')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const used = result.load.get(bus.id) ?? 0
  const manifest = busManifest(result, state.students, bus.id)
  const waitingNearby = state.students.filter((s) => {
    const a = result.byStudent.get(s.id)
    return a?.status === 'waitlisted' && a.reason === 'buses-full' && a.nearestBusId === bus.id
  }).length

  const setStops = (stops: Bus['stops']) => dispatch({ type: 'bus/update', id: bus.id, patch: { stops } })
  const swap = (i: number, j: number) => {
    const stops = [...bus.stops]
    ;[stops[i], stops[j]] = [stops[j], stops[i]]
    setStops(stops)
  }

  const remove = () => {
    dispatch({ type: 'bus/remove', id: bus.id })
    setConfirmDelete(false)
    select(null)
    toast({ tone: 'info', title: `${bus.label} removed`, description: used ? `${used} students were re-matched to other buses or the waitlist.` : undefined })
  }

  const exportManifest = () =>
    downloadCsv(`${bus.label.replace(/\s+/g, '-').toLowerCase()}-manifest.csv`, [
      ['Order', 'Student', 'Class', 'Parent', 'Phone', 'Pickup time', 'Near stop', 'Walk (m)', 'Address'],
      ...manifest.map(({ student, assignment }, i) => [
        i + 1,
        student.name,
        student.grade,
        student.parentName,
        student.parentPhone,
        formatClock(assignment.pickupMinutes),
        assignment.nearestStop?.name ?? '',
        Math.round(assignment.walkMeters),
        student.address,
      ]),
    ])

  return (
    <div className="flex flex-col">
      <div className="border-b border-line p-5">
        <button type="button" onClick={() => select(null)} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All buses
        </button>
        <div className="mt-3 flex items-start gap-3">
          <span className="mt-1 size-4 shrink-0 rounded-full ring-4 ring-white" style={{ background: routeColor(bus.colorSlot) }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold tracking-tight text-ink">{bus.label}</h1>
            <p className="truncate text-sm text-ink-3">
              {[bus.plate, bus.driverName, bus.driverPhone].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${bus.label} details`}>
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label={`Remove ${bus.label}`} className="hover:bg-danger-soft hover:text-danger-ink">
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-muted p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">Seats</p>
              <p className="text-xs text-ink-3">
                {used} taken{waitingNearby > 0 ? ` · ${waitingNearby} waiting for this bus` : ''}
              </p>
            </div>
            <Stepper label="Seats" value={bus.capacity} min={1} max={80} onChange={(capacity) => dispatch({ type: 'bus/update', id: bus.id, patch: { capacity } })} />
          </div>
          <div className="flex items-center gap-3">
            <CapacityMeter used={used} capacity={bus.capacity} colorSlot={bus.colorSlot} className="flex-1" />
            <CapacityBadge used={used} capacity={bus.capacity} />
          </div>
        </div>
      </div>

      <Tabs
        label={`${bus.label} details`}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'route', label: <><RouteIcon className="size-4" aria-hidden="true" />Route</> },
          { id: 'students', label: <><UsersRound className="size-4" aria-hidden="true" />Students ({manifest.length})</> },
        ]}
      >
        {tab === 'route' ? (
          <div className="flex flex-col gap-4 p-5">
            {bus.stops.length > 0 && <RouteSummary route={route} status={status} />}
            <Button variant={adding ? 'primary' : 'secondary'} aria-pressed={adding} onClick={onToggleAdding} className="self-start" disabled={bus.stops.length === 0}>
              {adding ? <X className="size-4" aria-hidden="true" /> : <MapPinPlus className="size-4" aria-hidden="true" />}
              {adding ? 'Done adding stops' : 'Add stops on the map'}
            </Button>

            {bus.stops.length === 0 ? (
              <EmptyState icon={<MapPinPlus />} title="Draw this bus's route" className="rounded-2xl border border-dashed border-line-strong py-8">
                Click the map to place the first pickup stop, then keep clicking in the order the bus drives. Every route ends at school.
              </EmptyState>
            ) : (
              <ol className="flex flex-col gap-1.5" aria-label="Stops in driving order">
                {bus.stops.map((stop, i) => (
                  <li key={stop.id} className="flex items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5 pl-2.5">
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold"
                      style={{ background: routeColor(bus.colorSlot), color: inkOn(routeColor(bus.colorSlot)) }}
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <input
                      key={`${stop.id}|${stop.name}`}
                      defaultValue={stop.name}
                      aria-label={`Stop ${i + 1} name`}
                      onBlur={(e) => {
                        const name = e.target.value.trim()
                        if (name && name !== stop.name) dispatch({ type: 'stop/rename', busId: bus.id, stopId: stop.id, name })
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                      className="h-9 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm font-semibold text-ink transition-colors hover:bg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="shrink-0 px-1 text-xs font-semibold text-ink-3 tabular">{formatClock(timeAtAlong(route, route.stopAlong[i], state.settings))}</span>
                    <IconButton label={`Move ${stop.name} earlier`} disabled={i === 0} onClick={() => swap(i, i - 1)}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label={`Move ${stop.name} later`} disabled={i === bus.stops.length - 1} onClick={() => swap(i, i + 1)}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton label={`Remove ${stop.name}`} onClick={() => setStops(bus.stops.filter((s) => s.id !== stop.id))} danger>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                ))}
                <li className="flex items-center gap-2.5 rounded-xl bg-ink px-2.5 py-2.5 text-white">
                  <School className="size-5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{state.settings.name}</span>
                  <span className="text-xs font-semibold tabular">{formatClock(route.arrival)}</span>
                </li>
              </ol>
            )}
            {bus.stops.length > 0 && (
              <p className="text-xs text-ink-3">
                Drag stop markers on the map to fine-tune them. Paths follow real roads ({formatDuration(route.arrival - route.departure)} at {state.settings.avgSpeedKmh} km/h).
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5">
            {manifest.length === 0 ? (
              <EmptyState icon={<UsersRound />} title="No students on this bus yet">
                {bus.stops.length === 0 ? 'Draw a route first. Students who live nearby are added automatically.' : 'No family within walking distance of this route has asked for a bus yet.'}
              </EmptyState>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-ink-3">In pickup order</p>
                  <Button variant="secondary" size="sm" onClick={exportManifest}>
                    <Download className="size-4" aria-hidden="true" />
                    Export CSV
                  </Button>
                </div>
                <ol className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {manifest.map(({ student, assignment }, i) => (
                    <li key={student.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="w-5 shrink-0 text-xs font-bold text-ink-3 tabular">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                          {student.name}
                          {assignment.manual && <Pin className="size-3.5 shrink-0 text-primary" aria-label="Assigned manually" />}
                        </p>
                        <p className="truncate text-xs text-ink-3">
                          {student.grade} · near {assignment.nearestStop?.name ?? 'route'} · {formatDistance(assignment.walkMeters)} walk
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-ink tabular">{formatClock(assignment.pickupMinutes)}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </Tabs>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        size="sm"
        title={`Remove ${bus.label}?`}
        description={
          used > 0
            ? `${used} students ride this bus. They'll be moved to other buses within walking distance where there are seats; the rest join the waitlist.`
            : 'Its route and stops will be deleted.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep bus
            </Button>
            <Button variant="danger" onClick={remove}>
              Remove bus
            </Button>
          </>
        }
      />
    </div>
  )
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-3 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        danger ? 'hover:bg-danger-soft hover:text-danger-ink' : 'hover:bg-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

import type { Marker as LeafletMarker } from 'leaflet'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Download,
  Flag,
  Layers,
  LoaderCircle,
  Lock,
  LockOpen,
  MapPinPlus,
  Pencil,
  Plus,
  Route as RouteIcon,
  School,
  Spline,
  Trash2,
  TriangleAlert,
  UsersRound,
  X,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import { DecisionChip } from '../../components/ui/AutoChip'
import { BaseMap, FitBounds, MapClick } from '../../components/map/BaseMap'
import { startIcon, stopIcon } from '../../components/map/icons'
import { RoadAccessLayer } from '../../components/map/layers'
import { NetworkLayers } from '../../components/map/NetworkLayers'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { CapacityBadge, CapacityMeter } from '../../components/ui/CapacityMeter'
import { Segmented, Stepper, Tabs } from '../../components/ui/controls'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/misc'
import { Stagger, StaggerItem } from '../../components/ui/motion'
import { useToast } from '../../components/ui/toast-context'
import { VehicleChip, VehicleIcon } from '../../components/ui/VehicleChip'
import { inkOn, nextColorSlot, routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { downloadCsv } from '../../lib/csv'
import { vehicleEconomics } from '../../lib/engine/economics'
import { VEHICLE_NAMES, VEHICLE_PRESETS } from '../../lib/engine/presets'
import { canReach } from '../../lib/engine/plan'
import type { RouteStatus, RouteView } from '../../lib/engine/view'
import { inr, inrSigned, kmValue, plural } from '../../lib/format'
import { formatDistance, haversine } from '../../lib/geo'
import { EASE_OUT } from '../../lib/motion'
import { navigate } from '../../lib/router'
import { hasRoadData, nameForPoint, nearestRoad } from '../../lib/roads'
import { formatClock, formatDuration } from '../../lib/time'
import type { AppState, BoardingPoint, LatLng, NamedPoint, Vehicle, VehicleType } from '../../lib/types'
import {
  addManualStop,
  addVehicle,
  moveStop,
  moveStopInRoute,
  pinStopVehicle,
  removeStop,
  removeVehicle,
  renameStop,
  setRouteLocked,
  setStopAccess,
  updateVehicle,
} from '../../store/actions'
import { useStore } from '../../store/context'
import { uid } from '../../store/state'
import { MapLegend } from './MapLegend'
import { VehicleFormDialog, type VehicleFields } from './VehicleFormDialog'

const selectVehicle = (id: string | null) => navigate(id ? `/school/fleet?bus=${id}` : '/school/fleet')

/** Snaps a dropped point to a road this vehicle can use and names it. */
function pointForVehicle(position: LatLng, type: VehicleType): NamedPoint {
  const road = hasRoadData(position) ? nearestRoad(position, type === 'bus' ? 3 : 2, 400) : null
  const at = road?.position ?? position
  return { name: nameForPoint(at).replace(/^Near /, ''), position: at }
}

/** A sensible first guess for where a new vehicle starts: near waiting families, else the far edge of the network. */
function suggestStart(state: AppState, type: VehicleType): NamedPoint {
  const waiting = state.students.filter((s) => state.plan.waitlist[s.id] && state.plan.waitlist[s.id] !== 'too-far' && hasRoadData(s.home))
  let base: LatLng
  if (waiting.length > 0) {
    base = { lat: waiting.reduce((sum, s) => sum + s.home.lat, 0) / waiting.length, lng: waiting.reduce((sum, s) => sum + s.home.lng, 0) / waiting.length }
  } else {
    const farthest = [...state.plan.stops].sort((a, b) => haversine(b.position, state.settings.location) - haversine(a.position, state.settings.location))[0]
    base = farthest?.position ?? state.settings.location
  }
  return pointForVehicle(base, type)
}

export function Fleet({ selectedId, initialTab }: { selectedId: string | null; initialTab: 'vehicles' | 'stops' }) {
  const { state, view, routeStatus, update } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<'vehicles' | 'stops'>(initialTab)
  const [dialog, setDialog] = useState<'add' | 'edit' | null>(null)
  const [addingStop, setAddingStop] = useState(false)
  const [settingEnd, setSettingEnd] = useState(false)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [showRoads, setShowRoads] = useState(false)

  const vehicle = selectedId ? state.vehicles.find((v) => v.id === selectedId) : undefined
  const route = vehicle ? view.routes.get(vehicle.id) : undefined
  const selectedStop = selectedStopId ? state.plan.stops.find((s) => s.id === selectedStopId) : undefined
  const showingStops = !vehicle && tab === 'stops'
  const clicking = (showingStops && addingStop) || (!!vehicle && settingEnd)

  const focusPoints = route && route.stops.length > 0 ? [vehicle!.start.position, ...route.stops.map((s) => s.position), state.settings.location] : [state.settings.location, ...state.plan.stops.map((s) => s.position)]

  const onMapClick = (p: LatLng) => {
    if (vehicle && settingEnd) {
      update((s) => updateVehicle(s, vehicle.id, { end: pointForVehicle(p, vehicle.type) }))
      setSettingEnd(false)
      toast({ tone: 'success', title: `${vehicle.label}'s end point set`, description: 'Routes were re-planned.' })
    } else if (showingStops && addingStop) {
      update((s) => addManualStop(s, p))
      setAddingStop(false)
      toast({ tone: 'success', title: 'Boarding point added', description: 'Children closer to it were moved there and routes re-planned.' })
    }
  }

  const addNewVehicle = (fields: VehicleFields) => {
    const id = uid('veh')
    const start = suggestStart(state, fields.type)
    update((s) => addVehicle(s, { id, ...fields, colorSlot: nextColorSlot(s.vehicles.map((v) => v.colorSlot)), start, end: null, enabled: true }))
    setDialog(null)
    selectVehicle(id)
    toast({ tone: 'success', title: `${fields.label} added`, description: `It starts near ${start.name}; drag its flag if that's wrong. It takes riders whenever that improves the plan.` })
  }

  const newLabel = (type: VehicleType) => {
    const prefix = VEHICLE_NAMES[type]
    let n = state.vehicles.filter((v) => v.type === type).length + 1
    while (state.vehicles.some((v) => v.label === `${prefix} ${String(n).padStart(2, '0')}`)) n++
    return `${prefix} ${String(n).padStart(2, '0')}`
  }

  return (
    // On desktop the list scrolls and the map stays put, so the height must beat the flex sizing.
    <div className="grid flex-1 grid-cols-1 lg:h-[calc(100dvh-4rem)] lg:flex-none lg:grid-cols-[minmax(380px,440px)_1fr] lg:grid-rows-[minmax(0,1fr)]">
      <div className={cn('relative order-first h-[46vh] min-h-[320px] lg:order-none lg:col-start-2 lg:row-start-1 lg:h-auto', clicking && 'map-crosshair')}>
        <BaseMap center={state.settings.location} zoom={12} label={vehicle ? `Route of ${vehicle.label}. Drag the flag to change where it starts.` : 'Fleet map'}>
          <FitBounds points={focusPoints} fitKey={`fleet-${vehicle?.id ?? 'all'}`} />
          {showRoads && <RoadAccessLayer />}
          <NetworkLayers
            state={state}
            view={view}
            routeStatus={routeStatus}
            focusVehicleId={vehicle?.id}
            showStops={!vehicle && !showingStops}
            showStarts={!vehicle}
            showHomes={!!vehicle}
            onSelectVehicle={clicking ? undefined : (id) => selectVehicle(id)}
            fit={false}
          />
          {vehicle && route && <EditableRoute vehicle={vehicle} route={route} />}
          {showingStops && <AllStops selectedId={selectedStopId} onSelect={setSelectedStopId} />}
          {clicking && <MapClick onClick={onMapClick} />}
        </BaseMap>
        <div className="absolute right-3 top-3 z-10">
          <Button size="md" variant={showRoads ? 'primary' : 'secondary'} aria-pressed={showRoads} onClick={() => setShowRoads((v) => !v)}>
            <Layers className="size-4" aria-hidden="true" />
            Road widths
          </Button>
        </div>
        {clicking && (
          <div className="pointer-events-none absolute inset-x-3 top-14 z-10 flex justify-center">
            <div className="flex items-center gap-2 rounded-full bg-ink/90 px-3.5 py-2 text-xs font-semibold text-white">
              <MapPinPlus className="size-4" aria-hidden="true" />
              {settingEnd ? 'Click where this vehicle finishes its day' : 'Click a road to add a boarding point'}
            </div>
          </div>
        )}
        {showRoads && <MapLegend vehicles={[]} roadWidths />}
      </div>

      <div className="scrollbar-soft flex flex-col lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto">
        {vehicle && route ? (
          <motion.div key={vehicle.id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.32, ease: EASE_OUT }}>
            <VehicleDetail vehicle={vehicle} route={route} status={routeStatus[vehicle.id]} onEdit={() => setDialog('edit')} settingEnd={settingEnd} onSetEnd={setSettingEnd} />
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">Fleet & routes</h1>
                <p className="text-sm text-ink-3">
                  {state.vehicles.length} vehicles · {state.plan.stops.length} boarding points
                </p>
              </div>
              {tab === 'vehicles' ? (
                <Button onClick={() => setDialog('add')}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add vehicle
                </Button>
              ) : (
                <Button variant={addingStop ? 'primary' : 'secondary'} aria-pressed={addingStop} onClick={() => setAddingStop((v) => !v)}>
                  {addingStop ? <X className="size-4" aria-hidden="true" /> : <MapPinPlus className="size-4" aria-hidden="true" />}
                  {addingStop ? 'Cancel' : 'Add stop'}
                </Button>
              )}
            </div>

            {selectedId && (
              <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning-ink">That vehicle no longer exists. It may have been removed in another tab.</p>
            )}

            <Segmented
              label="Show"
              value={tab}
              onChange={(id) => {
                setTab(id)
                setAddingStop(false)
              }}
              options={[
                { id: 'vehicles', label: `Vehicles (${state.vehicles.length})` },
                { id: 'stops', label: `Boarding points (${state.plan.stops.length})` },
              ]}
            />

            {tab === 'vehicles' ? <VehicleList onAdd={() => setDialog('add')} /> : selectedStop ? <StopEditor key={selectedStop.id} stop={selectedStop} onClose={() => setSelectedStopId(null)} /> : <StopList onSelect={setSelectedStopId} />}
          </motion.div>
        )}
      </div>

      <VehicleFormDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        mode={dialog === 'edit' ? 'edit' : 'add'}
        initial={dialog === 'edit' && vehicle ? vehicle : { label: newLabel('van'), plate: '', type: 'van', driverName: '', driverPhone: '', ...VEHICLE_PRESETS.van }}
        onSubmit={(fields) => {
          if (dialog === 'edit' && vehicle) {
            update((s) => updateVehicle(s, vehicle.id, fields))
            setDialog(null)
            toast({ tone: 'success', title: `${fields.label} updated` })
          } else addNewVehicle(fields)
        }}
      />
    </div>
  )
}

/** The selected vehicle's route: drag the flag to move its start, drag a stop to move it. */
function EditableRoute({ vehicle, route }: { vehicle: Vehicle; route: RouteView }) {
  const { update } = useStore()
  const color = routeColor(vehicle.colorSlot)
  return (
    <>
      <Marker
        position={vehicle.start.position}
        icon={startIcon(color, true)}
        draggable
        zIndexOffset={700}
        eventHandlers={{
          dragend: (e) => {
            const ll = (e.target as LeafletMarker).getLatLng()
            update((s) => updateVehicle(s, vehicle.id, { start: pointForVehicle({ lat: ll.lat, lng: ll.lng }, vehicle.type) }))
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -14]} className="route-tooltip">
          Starts at {vehicle.start.name} · drag to change
        </Tooltip>
      </Marker>
      {route.stops.map((s, i) => (
        <Marker
          key={s.stop.id}
          position={s.position}
          icon={stopIcon(color, String(i + 1), { editable: true, vanOnly: s.stop.access === 'van' })}
          draggable
          zIndexOffset={600}
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as LeafletMarker).getLatLng()
              update((state) => moveStop(state, s.stop.id, { lat: ll.lat, lng: ll.lng }))
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -14]} className="route-tooltip">
            {i + 1}. {s.stop.name} · {s.riders.length} riders · drag to move
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}

function AllStops({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { state, view, update } = useStore()
  const colorOf = new Map<string, string>()
  for (const route of view.routes.values()) for (const s of route.stops) colorOf.set(s.stop.id, routeColor(route.vehicle.colorSlot))
  return (
    <>
      {state.plan.stops.map((stop) => {
        const selected = stop.id === selectedId
        return (
          <Marker
            key={stop.id}
            position={stop.position}
            icon={stopIcon(colorOf.get(stop.id) ?? '#64748b', selected ? '✓' : '', { vanOnly: stop.access === 'van', editable: selected, compact: !selected })}
            draggable={selected}
            zIndexOffset={selected ? 900 : 300}
            eventHandlers={{
              click: () => onSelect(stop.id),
              dragend: (e) => {
                const ll = (e.target as LeafletMarker).getLatLng()
                update((s) => moveStop(s, stop.id, { lat: ll.lat, lng: ll.lng }))
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} className="route-tooltip">
              {stop.name}
              {stop.access === 'van' ? ' · van only' : ''}
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}

function VehicleList({ onAdd }: { onAdd: () => void }) {
  const { state, view, fleet, routeStatus } = useStore()
  if (state.vehicles.length === 0) {
    return (
      <EmptyState icon={<RouteIcon />} title="No vehicles yet" action={<Button onClick={onAdd}>Add your first vehicle</Button>}>
        Add a bus or van with its seat count. Boarding points, riders and routes are planned for you.
      </EmptyState>
    )
  }
  return (
    <>
      <Stagger as="ul" className="flex flex-col gap-2.5">
        {fleet.vehicles.map((v) => {
          const route = view.routes.get(v.vehicle.id)
          return (
            <StaggerItem as="li" key={v.vehicle.id}>
              <button
                type="button"
                onClick={() => selectVehicle(v.vehicle.id)}
                className="group flex w-full cursor-pointer flex-col gap-3 rounded-3xl bg-surface p-4 text-left transition-[background-color,transform] hover:bg-primary-soft active:scale-[0.99]"
              >
                <div className="flex w-full items-center gap-2">
                  <VehicleChip vehicle={v.vehicle} variant="solid" className="text-sm" />
                  <span className="truncate text-sm text-ink-3">{v.vehicle.plate}</span>
                  <ChevronRight className="ml-auto size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
                {v.vehicle.enabled ? (
                  <>
                    <div className="flex w-full items-center justify-between gap-2 text-sm">
                      <span className={cn('font-bold tabular', v.profit < 0 ? 'text-danger-ink' : 'text-ink')}>{inrSigned(v.profit)}/mo</span>
                      <span className="flex items-center gap-2">
                        <span className="font-bold text-ink tabular">
                          {v.riders}/{v.vehicle.seats}
                        </span>
                        <CapacityBadge used={v.riders} capacity={v.vehicle.seats} />
                      </span>
                    </div>
                    <CapacityMeter used={v.riders} capacity={v.vehicle.seats} colorSlot={v.vehicle.colorSlot} />
                    {route && route.stops.length > 0 ? (
                      <RouteSummary route={route} status={routeStatus[v.vehicle.id]} />
                    ) : (
                      <span className="text-xs font-medium text-ink-3">No riders in the plan right now.</span>
                    )}
                  </>
                ) : (
                  <Badge tone="neutral">Benched: kept out of the plan</Badge>
                )}
              </button>
            </StaggerItem>
          )
        })}
      </Stagger>
      <p className="rounded-2xl bg-primary-soft/70 p-4 text-sm leading-relaxed text-ink-2">
        <strong className="text-ink">You only set each vehicle's start and end.</strong> Boarding points, which child rides what, and the driving order are worked out for you. Open a vehicle to overrule any of it.
      </p>
    </>
  )
}

function RouteSummary({ route, status }: { route: RouteView; status: RouteStatus | undefined }) {
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
          Estimated path (road service offline)
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <Spline className="size-3.5" aria-hidden="true" />
          Road route
        </span>
      )}
      <span aria-hidden="true">·</span>
      <span>{plural(route.stops.length, 'stop')}</span>
      <span aria-hidden="true">·</span>
      <span>{formatDistance(route.metersTotal)}</span>
      <span aria-hidden="true">·</span>
      <span>
        {formatClock(route.departure)} → {formatClock(route.arrival)}
      </span>
    </span>
  )
}

function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-night-ink">{label}</dt>
      <dd className={cn('text-[15px] font-bold tabular', tone === 'danger' ? 'text-danger-bright' : 'text-white')}>{value}</dd>
    </div>
  )
}

interface DetailProps {
  vehicle: Vehicle
  route: RouteView
  status: RouteStatus | undefined
  onEdit: () => void
  settingEnd: boolean
  onSetEnd: (on: boolean) => void
}

function VehicleDetail({ vehicle, route, status, onEdit, settingEnd, onSetEnd }: DetailProps) {
  const { state, view, update } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<'route' | 'riders'>('route')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const money = vehicleEconomics(vehicle, route, view, state.settings)
  const riders = route.stops.flatMap((s) => s.riders.map((student) => ({ student, stop: s })))
  const planRoute = route.route

  const exportManifest = () =>
    downloadCsv(`${vehicle.label.replace(/\s+/g, '-').toLowerCase()}-run-sheet.csv`, [
      ['Order', 'Boarding point', 'Pickup', 'Drop', 'Child', 'Class', 'Parent', 'Phone', 'Address'],
      ...riders.map(({ student, stop }) => [
        route.stops.indexOf(stop) + 1,
        stop.stop.name,
        formatClock(stop.pickup),
        formatClock(stop.dropoff),
        student.name,
        student.grade,
        student.parentName,
        student.parentPhone,
        student.address,
      ]),
    ])

  return (
    <div className="flex flex-col">
      <div className="p-5 pb-3">
        <button type="button" onClick={() => selectVehicle(null)} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All vehicles
        </button>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: routeColor(vehicle.colorSlot), color: inkOn(routeColor(vehicle.colorSlot)) }} aria-hidden="true">
            <VehicleIcon type={vehicle.type} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold tracking-tight text-ink">{vehicle.label}</h1>
            <p className="truncate text-sm text-ink-3">{[VEHICLE_NAMES[vehicle.type], vehicle.plate, vehicle.driverName].filter(Boolean).join(' · ')}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${vehicle.label}`}>
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label={`Remove ${vehicle.label}`} className="hover:bg-danger-soft hover:text-danger-ink">
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <dl className="gradient-night mt-4 grid grid-cols-3 gap-3 rounded-3xl p-4 text-white">
          <Metric label="Fees a month" value={inr(money.revenue)} />
          <Metric label="Costs a month" value={inr(money.cost)} />
          <Metric label="Profit" value={inrSigned(money.profit)} tone={money.profit < 0 ? 'danger' : undefined} />
          <Metric label="Distance" value={`${kmValue(money.kmDaily)}/day`} />
          <Metric label="Diesel" value={`${Math.round(money.litres)} L/mo`} />
          <Metric label="Longest ride" value={`${Math.round(route.rideMax)} min`} tone={route.rideMax > state.settings.maxRideMin ? 'danger' : undefined} />
        </dl>

        {route.narrowMeters > 300 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning-ink">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {formatDistance(route.narrowMeters)} of this route uses roads mapped as narrow, because no wide road links those points. Widths are estimated from map data, so check them on the ground.
            </span>
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Flag className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink-3">Starts at</p>
                <p className="truncate text-sm font-bold text-ink">{vehicle.start.name}</p>
              </div>
            </div>
            <span className="shrink-0 text-xs text-ink-3">Drag the flag on the map</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <School className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink-3">Ends at</p>
                <p className="truncate text-sm font-bold text-ink">{vehicle.end ? `School, then ${vehicle.end.name}` : state.settings.name}</p>
              </div>
            </div>
            {vehicle.end ? (
              <Button size="sm" variant="ghost" onClick={() => update((s) => updateVehicle(s, vehicle.id, { end: null }))}>
                Stay at school
              </Button>
            ) : (
              <Button size="sm" variant={settingEnd ? 'primary' : 'ghost'} aria-pressed={settingEnd} onClick={() => onSetEnd(!settingEnd)}>
                {settingEnd ? 'Cancel' : 'Change'}
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">Seats</p>
              <p className="text-xs text-ink-3">{money.riders} taken</p>
            </div>
            <Stepper label="Seats" value={vehicle.seats} min={1} max={80} onChange={(seats) => update((s) => updateVehicle(s, vehicle.id, { seats }))} />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface px-3.5 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">In the plan</span>
              <span className="block text-xs text-ink-3">Switch off to bench it. Its fixed costs still count.</span>
            </span>
            <input type="checkbox" className="size-5 cursor-pointer accent-primary" checked={vehicle.enabled} onChange={(e) => update((s) => updateVehicle(s, vehicle.id, { enabled: e.target.checked }))} />
          </label>
        </div>
      </div>

      <Tabs
        label={`${vehicle.label} details`}
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'route',
            label: (
              <>
                <RouteIcon className="size-4" aria-hidden="true" />
                Route
              </>
            ),
          },
          {
            id: 'riders',
            label: (
              <>
                <UsersRound className="size-4" aria-hidden="true" />
                Riders ({riders.length})
              </>
            ),
          },
        ]}
      >
        {tab === 'route' ? (
          <div className="flex flex-col gap-4 p-5">
            {route.stops.length === 0 ? (
              <EmptyState icon={<RouteIcon />} title="No stops on this vehicle">
                {vehicle.enabled ? 'The plan has no children for it right now. It picks up riders automatically as soon as it helps.' : 'It is benched. Switch it back on to include it in the plan.'}
              </EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RouteSummary route={route} status={status} />
                  <DecisionChip manual={!!planRoute?.locked} />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  aria-pressed={planRoute?.locked}
                  onClick={() => {
                    update((s) => setRouteLocked(s, vehicle.id, !planRoute?.locked))
                    toast({
                      tone: 'success',
                      title: planRoute?.locked ? 'Route unlocked' : 'Route locked',
                      description: planRoute?.locked ? 'The optimiser manages it again.' : 'The optimiser will leave its stops and order alone.',
                    })
                  }}
                >
                  {planRoute?.locked ? <LockOpen className="size-4" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />}
                  {planRoute?.locked ? 'Let the system manage it' : 'Lock this route'}
                </Button>
                <ol className="flex flex-col gap-1.5" aria-label="Stops in driving order">
                  {route.stops.map((s, i) => (
                    <li key={s.stop.id} className="flex items-center gap-1.5 rounded-2xl bg-surface p-1.5 pl-2.5">
                      <span
                        className={cn('grid size-6 shrink-0 place-items-center text-[11px] font-extrabold', s.stop.access === 'van' ? 'rounded-md' : 'rounded-full')}
                        style={{ background: routeColor(vehicle.colorSlot), color: inkOn(routeColor(vehicle.colorSlot)) }}
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 px-1">
                        <p className="truncate text-sm font-semibold text-ink">{s.stop.name}</p>
                        <p className="truncate text-xs text-ink-3">
                          {formatClock(s.pickup)} · {plural(s.riders.length, 'rider')}
                          {s.stop.access === 'van' ? ' · van only' : ''}
                        </p>
                      </div>
                      <IconButton label={`Move ${s.stop.name} earlier`} disabled={i === 0} onClick={() => update((state2) => moveStopInRoute(state2, vehicle.id, i, i - 1))}>
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton label={`Move ${s.stop.name} later`} disabled={i === route.stops.length - 1} onClick={() => update((state2) => moveStopInRoute(state2, vehicle.id, i, i + 1))}>
                        <ArrowDown className="size-4" />
                      </IconButton>
                    </li>
                  ))}
                  <li className="flex items-center gap-2.5 rounded-xl bg-ink px-2.5 py-2.5 text-white">
                    <School className="size-5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{state.settings.name}</span>
                    <span className="text-xs font-semibold tabular">{formatClock(route.arrival)}</span>
                  </li>
                </ol>
                <p className="text-xs text-ink-3">
                  Drag a stop on the map to move it, or reorder it here. Either keeps your choice through later re-planning. {formatDuration(route.arrival - route.departure)} at {vehicle.type === 'bus' ? state.settings.speedBusKmh : state.settings.speedVanKmh} km/h.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5">
            {riders.length === 0 ? (
              <EmptyState icon={<UsersRound />} title="No riders yet" />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-ink-3">In pickup order</p>
                  <Button variant="secondary" size="sm" onClick={exportManifest}>
                    <Download className="size-4" aria-hidden="true" />
                    Run sheet
                  </Button>
                </div>
                <ol className="divide-y divide-line rounded-2xl bg-surface">
                  {riders.map(({ student, stop }) => (
                    <li key={student.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{student.name}</p>
                        <p className="truncate text-xs text-ink-3">
                          {student.grade} · {stop.stop.name}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-ink tabular">{formatClock(stop.pickup)}</span>
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
        title={`Remove ${vehicle.label}?`}
        description={money.riders > 0 ? `${plural(money.riders, 'child rides', 'children ride')} it. The plan moves them to other vehicles; anyone left without a seat joins the waitlist.` : 'It has no riders right now.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                update((s) => removeVehicle(s, vehicle.id))
                setConfirmDelete(false)
                selectVehicle(null)
                toast({ tone: 'info', title: `${vehicle.label} removed`, description: 'Routes were re-planned without it.' })
              }}
            >
              Remove and re-plan
            </Button>
          </>
        }
      />
    </div>
  )
}

function StopList({ onSelect }: { onSelect: (id: string) => void }) {
  const { state, view } = useStore()
  const [query, setQuery] = useState('')
  const servedBy = new Map<string, Vehicle[]>()
  const riders = new Map<string, number>()
  for (const route of view.routes.values()) {
    for (const s of route.stops) {
      servedBy.set(s.stop.id, [...(servedBy.get(s.stop.id) ?? []), route.vehicle])
      riders.set(s.stop.id, (riders.get(s.stop.id) ?? 0) + s.riders.length)
    }
  }
  const needle = query.trim().toLowerCase()
  const stops = [...state.plan.stops].filter((s) => s.name.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <div>
        <label htmlFor="stop-search" className="sr-only">
          Search boarding points
        </label>
        <Input id="stop-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search boarding points…" />
      </div>
      <ul className="flex flex-col gap-1.5">
        {stops.map((stop) => (
          <li key={stop.id}>
            <button type="button" onClick={() => onSelect(stop.id)} className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-surface p-3 text-left transition-colors hover:bg-primary-soft">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{stop.name}</span>
                <span className="block truncate text-xs text-ink-3">
                  {plural(riders.get(stop.id) ?? 0, 'rider')} · {(servedBy.get(stop.id) ?? []).map((v) => v.label).join(', ') || 'Not on a route'}
                </span>
              </span>
              {stop.access === 'van' && (
                <Badge tone="neutral" icon={<VehicleIcon type="van" />}>
                  Van only
                </Badge>
              )}
              <DecisionChip manual={stop.source === 'manual'} />
            </button>
          </li>
        ))}
        {stops.length === 0 && <p className="py-6 text-center text-sm text-ink-3">No boarding points match.</p>}
      </ul>
    </>
  )
}

function StopEditor({ stop, onClose }: { stop: BoardingPoint; onClose: () => void }) {
  const { state, view, update } = useStore()
  const toast = useToast()
  const [name, setName] = useState(stop.name)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const riders = state.students.filter((s) => state.plan.seats[s.id]?.stopId === stop.id)
  const vehicles = state.vehicles.filter((v) => v.enabled && canReach(v, stop))
  const servedBy = [...view.routes.values()].filter((r) => r.stops.some((s) => s.stop.id === stop.id)).map((r) => r.vehicle)

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onClose} className="inline-flex cursor-pointer items-center gap-1.5 self-start text-sm font-semibold text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All boarding points
      </button>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-3">Drag it on the map to move it</p>
        <DecisionChip manual={stop.source === 'manual'} />
      </div>
      <Field label="Name" hint="Press Enter to save">
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name.trim() !== stop.name) update((s) => renameStop(s, stop.id, name.trim()))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        )}
      </Field>
      <Field label="Who can reach it" hint={stop.accessManual ? 'Set by hand' : 'Estimated from the road type here'}>
        {(p) => (
          <Select {...p} value={stop.access} onChange={(e) => update((s) => setStopAccess(s, stop.id, e.target.value as BoardingPoint['access']))}>
            <option value="bus">Bus or van</option>
            <option value="van">Van only</option>
          </Select>
        )}
      </Field>
      <Field label="Served by" hint={stop.pinnedVehicleId ? 'Pinned by hand' : `Automatic${servedBy.length ? `: ${servedBy.map((v) => v.label).join(', ')}` : ''}`}>
        {(p) => (
          <Select {...p} value={stop.pinnedVehicleId ?? 'auto'} onChange={(e) => update((s) => pinStopVehicle(s, stop.id, e.target.value === 'auto' ? null : e.target.value))}>
            <option value="auto">Automatic</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div>
        <p className="text-sm font-semibold text-ink">Riders ({riders.length})</p>
        <ul className="mt-1.5 flex flex-col gap-1 text-sm text-ink-2">
          {riders.map((r) => (
            <li key={r.id} className="truncate">
              {r.name} <span className="text-ink-3">· {formatDistance(haversine(r.home, stop.position))} walk</span>
            </li>
          ))}
          {riders.length === 0 && <li className="text-ink-3">Nobody boards here yet.</li>}
        </ul>
      </div>
      <Button variant="ghost" className="self-start text-danger-ink hover:bg-danger-soft hover:text-danger-ink" onClick={() => setConfirmRemove(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
        Remove boarding point
      </Button>

      <Dialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        size="sm"
        title={`Remove "${stop.name}"?`}
        description={riders.length > 0 ? `${plural(riders.length, 'child is', 'children are')} moved to the next best stop, and the system won't place a stop here again.` : "The system won't place a stop here again."}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                update((s) => removeStop(s, stop.id))
                setConfirmRemove(false)
                onClose()
                toast({ tone: 'info', title: 'Boarding point removed' })
              }}
            >
              Remove it
            </Button>
          </>
        }
      />
    </div>
  )
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-3 transition-colors hover:bg-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

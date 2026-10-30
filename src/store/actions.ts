// Every change to the demo goes through here. Each function takes the state and
// returns the next one, keeping the plan valid and logging what the system did.
import { haversine } from '../lib/geo'
import { effectiveWalk, makeStop, stopAccessAt } from '../lib/engine/boarding'
import { countMoved, optimise, placeStudent, reconcilePlan, releaseStudent } from '../lib/engine/plan'
import { nameForPoint, nearestRoad } from '../lib/roads'
import type { AppState, BoardingPoint, LatLng, Plan, Settings, Student, StopAccess, Vehicle, VehicleType, WaitReason } from '../lib/types'
import { VEHICLE_PRESETS } from '../lib/engine/presets'
import { uid } from './state'

const ACTIVITY_LIMIT = 40
/** Enough for a good plan without a noticeable pause when the school changes something. */
const LIVE_ITERATIONS = 700

export const WAIT_REASON_TEXT: Record<WaitReason, string> = {
  'seats-full': 'every vehicle that can reach them is full',
  'no-van': 'their lane needs a van and no van has a seat',
  'no-road': 'no road a vehicle can use is within walking distance',
  'too-far': 'a direct ride would break the ride-time limit',
}

function log(state: AppState, kind: 'auto' | 'manual', text: string): AppState {
  return { ...state, activity: [{ id: uid('act'), at: Date.now(), kind, text }, ...state.activity].slice(0, ACTIVITY_LIMIT) }
}

function replan(state: AppState, why: string): AppState {
  if (!state.settings.autopilot) {
    return log({ ...state, plan: reconcilePlan(state) }, 'auto', `${why} Autopilot is off, so routes were only adjusted to stay valid.`)
  }
  const plan = optimise(state, { iterations: LIVE_ITERATIONS, stability: true })
  const moved = countMoved(state.plan, plan)
  return log({ ...state, plan }, 'auto', `${why} Routes re-planned${moved > 0 ? `; ${moved} ${moved === 1 ? 'child' : 'children'} moved` : ''}.`)
}

function describeSeat(state: AppState, plan: Plan, student: Student): string {
  const seat = plan.seats[student.id]
  if (!seat) return `${student.name} joined the waitlist: ${WAIT_REASON_TEXT[plan.waitlist[student.id] ?? 'seats-full']}.`
  const vehicle = state.vehicles.find((v) => v.id === seat.vehicleId)
  const stop = plan.stops.find((s) => s.id === seat.stopId)
  return `${student.name} placed on ${vehicle?.label} at ${stop?.name}.`
}

// ---------- Students ----------

export function addStudent(state: AppState, student: Student): AppState {
  const next = { ...state, students: [...state.students, student] }
  const plan = placeStudent(next, student)
  return log({ ...next, plan }, 'auto', describeSeat(state, plan, student))
}

export function updateStudent(state: AppState, id: string, patch: Partial<Student>): AppState {
  const students = state.students.map((s) => (s.id === id ? { ...s, ...patch } : s))
  const next = { ...state, students }
  const student = students.find((s) => s.id === id)!
  const plan = placeStudent(next, student)
  return log({ ...next, plan }, 'auto', describeSeat(state, plan, student))
}

export function removeStudent(state: AppState, id: string): AppState {
  const student = state.students.find((s) => s.id === id)
  const plan = releaseStudent(state, id)
  const next = { ...state, students: state.students.filter((s) => s.id !== id), plan }
  return log(next, 'manual', `${student?.name ?? 'A child'} removed; their seat went back to the pool.`)
}

export function pinStudentVehicle(state: AppState, id: string, vehicleId: string | null): AppState {
  const student = state.students.find((s) => s.id === id)
  const vehicle = state.vehicles.find((v) => v.id === vehicleId)
  const next = updateStudent(state, id, { pinnedVehicleId: vehicleId })
  return log(next, 'manual', vehicle ? `${student?.name} pinned to ${vehicle.label} by hand.` : `${student?.name} back on automatic vehicle choice.`)
}

export function pinStudentStop(state: AppState, id: string, stopId: string | null): AppState {
  const student = state.students.find((s) => s.id === id)
  const stop = state.plan.stops.find((s) => s.id === stopId)
  const kept = stopId ? editStop(state, stopId, {}) : state
  const next = updateStudent(kept, id, { pinnedStopId: stopId })
  return log(next, 'manual', stop ? `${student?.name} set to board at ${stop.name} by hand.` : `${student?.name} back on automatic boarding point.`)
}

export function setStudentFee(state: AppState, id: string, feeOverride: number | null): AppState {
  const student = state.students.find((s) => s.id === id)
  const next = { ...state, students: state.students.map((s) => (s.id === id ? { ...s, feeOverride } : s)) }
  return log(next, 'manual', feeOverride === null ? `${student?.name} back on the standard fee.` : `${student?.name}'s fee set to ₹${feeOverride.toLocaleString('en-IN')} by hand.`)
}

// ---------- Vehicles ----------

export function addVehicle(state: AppState, vehicle: Vehicle): AppState {
  return replan({ ...state, vehicles: [...state.vehicles, vehicle] }, `${vehicle.label} added to the fleet.`)
}

export function updateVehicle(state: AppState, id: string, patch: Partial<Vehicle>): AppState {
  const before = state.vehicles.find((v) => v.id === id)
  const vehicles = state.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v))
  const next = { ...state, vehicles }
  // Plan inputs changed; labels and driver details don't need a re-plan.
  const planInputs: (keyof Vehicle)[] = ['type', 'seats', 'start', 'end', 'enabled', 'kmPerLitre', 'maintenancePerKm', 'crewMonthly', 'standingMonthly']
  const needsPlan = before && planInputs.some((key) => key in patch && JSON.stringify(before[key]) !== JSON.stringify(patch[key]))
  return needsPlan ? replan(next, `${patch.label ?? before.label} changed.`) : next
}

export function switchVehicleType(state: AppState, id: string, type: VehicleType): AppState {
  return updateVehicle(state, id, { type, ...VEHICLE_PRESETS[type] })
}

export function removeVehicle(state: AppState, id: string): AppState {
  const vehicle = state.vehicles.find((v) => v.id === id)
  const paths = { ...state.paths }
  delete paths[id]
  const students = state.students.map((s) => (s.pinnedVehicleId === id ? { ...s, pinnedVehicleId: null } : s))
  const stopsCleared = { ...state.plan, stops: state.plan.stops.map((s) => (s.pinnedVehicleId === id ? { ...s, pinnedVehicleId: null } : s)) }
  return replan({ ...state, students, paths, plan: stopsCleared, vehicles: state.vehicles.filter((v) => v.id !== id) }, `${vehicle?.label} removed from the fleet.`)
}

// ---------- Boarding points ----------

function editStop(state: AppState, id: string, patch: Partial<BoardingPoint>): AppState {
  return { ...state, plan: { ...state.plan, stops: state.plan.stops.map((s) => (s.id === id ? { ...s, ...patch, source: 'manual' } : s)) } }
}

export function renameStop(state: AppState, id: string, name: string): AppState {
  const stop = state.plan.stops.find((s) => s.id === id)
  return log(editStop(state, id, { name }), 'manual', `Boarding point "${stop?.name}" renamed to "${name}".`)
}

export function moveStop(state: AppState, id: string, position: LatLng): AppState {
  const stop = state.plan.stops.find((s) => s.id === id)
  if (!stop) return state
  const access = stop.accessManual ? stop.access : stopAccessAt(position)
  const moved = editStop(state, id, { position, access })
  return log({ ...moved, plan: reconcilePlan(moved) }, 'manual', `Boarding point "${stop.name}" moved by hand.`)
}

export function setStopAccess(state: AppState, id: string, access: StopAccess): AppState {
  const stop = state.plan.stops.find((s) => s.id === id)
  const next = editStop(state, id, { access, accessManual: true })
  return replan(next, `"${stop?.name}" marked as ${access === 'van' ? 'van only' : 'reachable by bus'} by hand.`)
}

export function pinStopVehicle(state: AppState, id: string, vehicleId: string | null): AppState {
  const stop = state.plan.stops.find((s) => s.id === id)
  const vehicle = state.vehicles.find((v) => v.id === vehicleId)
  const next = editStop(state, id, { pinnedVehicleId: vehicleId })
  const plan = optimise(next, { iterations: LIVE_ITERATIONS, stability: true })
  return log({ ...next, plan }, 'manual', vehicle ? `"${stop?.name}" pinned to ${vehicle.label} by hand.` : `"${stop?.name}" back on automatic vehicle choice.`)
}

/** Removes a boarding point and stops the optimiser from recreating it there. */
export function removeStop(state: AppState, id: string): AppState {
  const stop = state.plan.stops.find((s) => s.id === id)
  if (!stop) return state
  const riders = state.students.filter((s) => state.plan.seats[s.id]?.stopId === id)
  const seats = { ...state.plan.seats }
  for (const rider of riders) delete seats[rider.id]
  const cleared: AppState = {
    ...state,
    students: state.students.map((s) => (s.pinnedStopId === id ? { ...s, pinnedStopId: null } : s)),
    plan: {
      ...state.plan,
      seats,
      stops: state.plan.stops.filter((s) => s.id !== id),
      routes: state.plan.routes.map((r) => ({ ...r, stopIds: r.stopIds.filter((sid) => sid !== id) })),
      blocked: [...state.plan.blocked, stop.position],
    },
  }
  let next = cleared
  for (const rider of riders) {
    const current = next.students.find((s) => s.id === rider.id)!
    next = { ...next, plan: placeStudent(next, current) }
  }
  return log(next, 'manual', `Boarding point "${stop.name}" removed; ${riders.length} ${riders.length === 1 ? 'child was' : 'children were'} re-placed.`)
}

/** Adds a boarding point by hand and gathers the children who are now closer to it. */
export function addManualStop(state: AppState, position: LatLng): AppState {
  const road = nearestRoad(position, 2, 150)
  const at = road?.position ?? position
  const taken = new Set(state.plan.stops.map((s) => s.name))
  const stop = makeStop(at, stopAccessAt(at), nameForPoint(at, taken), 'manual')
  const walk = effectiveWalk(state.settings)
  const seats = { ...state.plan.seats }
  const waitlist = { ...state.plan.waitlist }
  const stopsById = new Map(state.plan.stops.map((s) => [s.id, s]))
  for (const student of state.students) {
    if (student.pinnedStopId) continue
    const seat = seats[student.id]
    const current = seat ? stopsById.get(seat.stopId) : null
    const distance = haversine(student.home, at)
    if (distance > walk) continue
    if (!current || distance < haversine(student.home, current.position)) {
      // Clearing the seat lets the optimiser route them via the new stop.
      seats[student.id] = { stopId: stop.id, vehicleId: seat?.vehicleId ?? '' }
      delete waitlist[student.id]
    }
  }
  const withStop: AppState = { ...state, plan: { ...state.plan, stops: [...state.plan.stops, stop], seats, waitlist } }
  const plan = optimise(withStop, { iterations: LIVE_ITERATIONS, stability: true })
  return log({ ...withStop, plan }, 'manual', `Boarding point "${stop.name}" added by hand.`)
}

// ---------- Routes ----------

/** Reordering by hand freezes the route so the optimiser won't undo it. */
export function moveStopInRoute(state: AppState, vehicleId: string, from: number, to: number): AppState {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId)
  const routes = state.plan.routes.map((r) => {
    if (r.vehicleId !== vehicleId) return r
    const stopIds = [...r.stopIds]
    const [moved] = stopIds.splice(from, 1)
    stopIds.splice(to, 0, moved)
    return { ...r, stopIds, locked: true }
  })
  return log({ ...state, plan: { ...state.plan, routes } }, 'manual', `${vehicle?.label}: stop order changed by hand and route locked.`)
}

export function setRouteLocked(state: AppState, vehicleId: string, locked: boolean): AppState {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId)
  const routes = state.plan.routes.map((r) => (r.vehicleId === vehicleId ? { ...r, locked } : r))
  const next: AppState = { ...state, plan: { ...state.plan, routes } }
  if (locked) return log(next, 'manual', `${vehicle?.label}'s route locked: the optimiser will leave it alone.`)
  const plan = optimise(next, { iterations: LIVE_ITERATIONS, stability: true })
  return log({ ...next, plan }, 'auto', `${vehicle?.label}'s route unlocked and re-planned.`)
}

// ---------- Plan-wide ----------

export function applyPlan(state: AppState, plan: Plan, summary: string): AppState {
  return log({ ...state, plan }, 'auto', `${summary}.`)
}

/** Full re-optimisation, including boarding points. Manual choices are kept. */
export function reoptimise(state: AppState): AppState {
  const plan = optimise(state, { recluster: true, stability: false, iterations: 1500 })
  const moved = countMoved(state.plan, plan)
  return log({ ...state, plan }, 'auto', `All routes and boarding points re-optimised; ${moved} ${moved === 1 ? 'child' : 'children'} moved.`)
}

export function updateSettings(state: AppState, patch: Partial<Settings>): AppState {
  const settings = { ...state.settings, ...patch }
  const next = { ...state, settings }
  const changed = (key: keyof Settings) => JSON.stringify(state.settings[key]) !== JSON.stringify(settings[key])
  const rebuildsStops = (['maxWalkMeters', 'maxStopRiders', 'priority', 'location'] as const).some(changed)
  const affectsRoutes = (['maxRideMin', 'speedBusKmh', 'speedVanKmh', 'dwellSec', 'dieselPrice', 'schoolDays'] as const).some(changed)

  if (!settings.autopilot) return log(next, 'manual', 'Settings changed. Autopilot is off, so the plan stays as it is until you re-optimise.')
  if (rebuildsStops) {
    const plan = optimise(next, { recluster: true, stability: false, iterations: LIVE_ITERATIONS })
    return log({ ...next, plan }, 'auto', 'Rules changed, so boarding points and routes were rebuilt.')
  }
  if (affectsRoutes) return replan(next, 'Rules changed.')
  return log(next, 'manual', 'Settings updated.')
}

export interface OverrideCounts {
  vehiclePins: number
  stopPins: number
  fees: number
  manualStops: number
  lockedRoutes: number
  total: number
}

export function countOverrides(state: AppState): OverrideCounts {
  const vehiclePins = state.students.filter((s) => s.pinnedVehicleId).length + state.plan.stops.filter((s) => s.pinnedVehicleId).length
  const stopPins = state.students.filter((s) => s.pinnedStopId).length
  const fees = state.students.filter((s) => s.feeOverride !== null).length
  const manualStops = state.plan.stops.filter((s) => s.source === 'manual').length
  const lockedRoutes = state.plan.routes.filter((r) => r.locked).length
  return { vehiclePins, stopPins, fees, manualStops, lockedRoutes, total: vehiclePins + stopPins + fees + manualStops + lockedRoutes }
}

/** Throws away every manual choice and lets the system decide everything again. */
export function clearOverrides(state: AppState): AppState {
  const cleared: AppState = {
    ...state,
    students: state.students.map((s) => ({ ...s, pinnedVehicleId: null, pinnedStopId: null, feeOverride: null })),
    plan: {
      ...state.plan,
      blocked: [],
      stops: state.plan.stops.map((s) => ({ ...s, source: 'auto', pinnedVehicleId: null, accessManual: false, access: stopAccessAt(s.position) })),
      routes: state.plan.routes.map((r) => ({ ...r, locked: false })),
    },
  }
  const plan = optimise(cleared, { recluster: true, stability: false, iterations: 1500 })
  return log({ ...cleared, plan }, 'auto', 'All manual choices cleared; the system re-planned everything.')
}

// Turns the school's fleet and the parents' requests into a plan, and keeps that
// plan up to date. New requests are slotted in with as little disruption as
// possible; full re-optimisation is a separate, deliberate step.
import { pointKey, travelMeters } from '../distance'
import { haversine } from '../geo'
import { hasRoadData, nameForPoint, nearestRoad } from '../roads'
import type { AppState, BoardingPoint, LatLng, Plan, Route, Settings, Student, Vehicle, WaitReason } from '../types'
import { clusterStudents, effectiveWalk, makeStop } from './boarding'
import { solveRouting, type SolverStop, type SolverVehicle } from './solver'

const RIDE_VALUE = { profit: 1, balanced: 4, comfort: 14 }
const OVER_LIMIT_VALUE = 300
const UNSERVED_VALUE = 6000
const MOVE_VALUE = 120
const SEED = 20261030

export function metersPerMinute(vehicle: Pick<Vehicle, 'type'>, settings: Settings): number {
  return ((vehicle.type === 'bus' ? settings.speedBusKmh : settings.speedVanKmh) * 1000) / 60
}

/** Monthly fuel and upkeep for one metre of route, driven morning and evening on every school day. */
export function monthlyCostPerMeter(vehicle: Vehicle, settings: Settings): number {
  return (2 * settings.schoolDays * (settings.dieselPrice / vehicle.kmPerLitre + vehicle.maintenancePerKm)) / 1000
}

function tailMeters(vehicle: Vehicle, settings: Settings): number {
  return vehicle.end ? travelMeters(settings.location, vehicle.end.position) : 0
}

export const canReach = (vehicle: Vehicle, stop: BoardingPoint) => stop.access === 'bus' || vehicle.type === 'van'

function usableVehicle(state: AppState, id: string | null): Vehicle | null {
  if (!id) return null
  const vehicle = state.vehicles.find((v) => v.id === id)
  return vehicle?.enabled ? vehicle : null
}

export function seatCounts(plan: Plan): Map<string, number> {
  const counts = new Map<string, number>()
  for (const seat of Object.values(plan.seats)) counts.set(seat.vehicleId, (counts.get(seat.vehicleId) ?? 0) + 1)
  return counts
}

function clonePlan(plan: Plan): Plan {
  return {
    ...plan,
    stops: [...plan.stops],
    routes: plan.routes.map((r) => ({ ...r, stopIds: [...r.stopIds] })),
    seats: { ...plan.seats },
    waitlist: { ...plan.waitlist },
  }
}

/** Removes stops nobody uses from routes and, for automatic ones, from the plan. */
function pruneStops(plan: Plan) {
  const used = new Map<string, Set<string>>()
  for (const seat of Object.values(plan.seats)) {
    if (!used.has(seat.vehicleId)) used.set(seat.vehicleId, new Set())
    used.get(seat.vehicleId)!.add(seat.stopId)
  }
  const onRoute = new Set<string>()
  for (const route of plan.routes) {
    if (!route.locked) route.stopIds = route.stopIds.filter((id) => used.get(route.vehicleId)?.has(id))
    for (const id of route.stopIds) onRoute.add(id)
  }
  plan.stops = plan.stops.filter((s) => s.source === 'manual' || onRoute.has(s.id))
}

/** Where to add a stop to a route so it adds the least driving. */
function bestInsertion(route: Route, stop: LatLng, vehicle: Vehicle, stopsById: Map<string, BoardingPoint>, school: LatLng) {
  const positions = route.stopIds.map((id) => stopsById.get(id)!.position)
  let bestIndex = 0
  let bestAdded = Infinity
  for (let i = 0; i <= positions.length; i++) {
    const before = i === 0 ? vehicle.start.position : positions[i - 1]
    const after = i === positions.length ? school : positions[i]
    const added = travelMeters(before, stop) + travelMeters(stop, after) - travelMeters(before, after)
    if (added < bestAdded) {
      bestAdded = added
      bestIndex = i
    }
  }
  return { index: bestIndex, added: bestAdded }
}

/** Minutes the first child on a route would ride, after an optional insertion. */
function longestRide(route: Route, vehicle: Vehicle, stopsById: Map<string, BoardingPoint>, settings: Settings, insert?: { index: number; position: LatLng }): number {
  const positions = route.stopIds.map((id) => stopsById.get(id)!.position)
  if (insert) positions.splice(insert.index, 0, insert.position)
  if (positions.length === 0) return 0
  const speed = metersPerMinute(vehicle, settings)
  const dwell = settings.dwellSec / 60
  let minutes = 0
  let next = settings.location
  for (let i = positions.length - 1; i >= 0; i--) {
    minutes += travelMeters(positions[i], next) / speed + dwell
    next = positions[i]
  }
  return minutes
}

function fastestSpeed(state: AppState): number {
  return Math.max(...state.vehicles.filter((v) => v.enabled).map((v) => metersPerMinute(v, state.settings)), 1)
}

export interface OptimiseOptions {
  /** Rebuild boarding points from scratch instead of keeping the current ones. */
  recluster?: boolean
  /** Discourage moving stops between vehicles without a real gain. */
  stability?: boolean
  iterations?: number
}

/** Computes the best plan for the current fleet, requests and overrides. */
export function optimise(state: AppState, options: OptimiseOptions = {}): Plan {
  const { recluster = false, stability = true, iterations = 1200 } = options
  const { settings, students, vehicles } = state
  const previous = state.plan

  const lockedRoutes = previous.routes.filter((r) => r.locked && usableVehicle(state, r.vehicleId))
  const lockedIds = new Set(lockedRoutes.map((r) => r.vehicleId))
  const lockedStopIds = new Set(lockedRoutes.flatMap((r) => r.stopIds))
  const seats: Plan['seats'] = {}
  const waitlist: Plan['waitlist'] = {}

  // Riders on frozen routes stay exactly where they are.
  const flexible: Student[] = []
  for (const student of students) {
    const seat = previous.seats[student.id]
    if (seat && lockedIds.has(seat.vehicleId)) seats[student.id] = seat
    else flexible.push(student)
  }

  // 1. Boarding points.
  const keptStops = previous.stops.filter((s) => s.source === 'manual' || lockedStopIds.has(s.id) || !recluster)
  const studentStop = new Map<string, string>()
  let toCluster = flexible
  if (!recluster) {
    toCluster = []
    const known = new Set(keptStops.map((s) => s.id))
    for (const student of flexible) {
      const seat = previous.seats[student.id]
      if (student.pinnedStopId && known.has(student.pinnedStopId)) studentStop.set(student.id, student.pinnedStopId)
      else if (seat && known.has(seat.stopId)) studentStop.set(student.id, seat.stopId)
      else toCluster.push(student)
    }
  }
  const inGrid = toCluster.filter((s) => {
    if (hasRoadData(s.home)) return true
    waitlist[s.id] = 'too-far'
    return false
  })
  const clustered = clusterStudents(inGrid, settings, keptStops, previous.blocked)
  for (const [studentId, stopId] of clustered.studentStop) studentStop.set(studentId, stopId)
  for (const [studentId, reason] of clustered.unreachable) waitlist[studentId] = reason
  const stopsById = new Map(clustered.stops.map((s) => [s.id, s]))

  // 2. Demand at each stop. Riders pinned to a vehicle form their own group.
  const groups = new Map<string, { stop: BoardingPoint; vehicleId: string | null; riders: Student[] }>()
  const fastest = fastestSpeed(state)
  const dwell = settings.dwellSec / 60
  for (const student of flexible) {
    const stopId = studentStop.get(student.id)
    const stop = stopId ? stopsById.get(stopId) : undefined
    if (!stop) continue
    if (travelMeters(stop.position, settings.location) / fastest + dwell > settings.maxRideMin) {
      waitlist[student.id] = 'too-far'
      continue
    }
    const pinned = usableVehicle(state, student.pinnedVehicleId) ?? usableVehicle(state, stop.pinnedVehicleId)
    const vehicleId = pinned && !lockedIds.has(pinned.id) ? pinned.id : null
    const key = vehicleId ? `${stop.id}#${vehicleId}` : stop.id
    if (!groups.has(key)) groups.set(key, { stop, vehicleId, riders: [] })
    groups.get(key)!.riders.push(student)
  }

  // 3. Route the fleet. Earlier requests weigh more when seats run short.
  const order = [...students].sort((a, b) => a.registeredAt - b.registeredAt)
  const rank = new Map(order.map((s, i) => [s.id, i]))
  const previousVehicle = new Map<string, string>()
  for (const seat of Object.values(previous.seats)) previousVehicle.set(seat.stopId, seat.vehicleId)

  const solverStops: SolverStop[] = [...groups.entries()].map(([id, group]) => ({
    id,
    position: group.stop.position,
    load: group.riders.length,
    access: group.stop.access,
    fixedVehicleId: group.vehicleId,
    previousVehicleId: stability ? (previousVehicle.get(group.stop.id) ?? null) : null,
    priority: group.riders.reduce((sum, s) => sum + 1 + 0.5 * (1 - (rank.get(s.id) ?? 0) / Math.max(1, order.length)), 0),
  }))
  const fleet = vehicles.filter((v) => v.enabled && !lockedIds.has(v.id))
  const solverVehicles: SolverVehicle[] = fleet.map((v) => ({
    id: v.id,
    type: v.type,
    seats: v.seats,
    start: v.start.position,
    tailMeters: tailMeters(v, settings),
    activation: v.crewMonthly,
    perMeter: monthlyCostPerMeter(v, settings),
    speed: metersPerMinute(v, settings),
  }))
  // Start from today's routes unless the boarding points themselves were rebuilt.
  let initial: Map<string, string[]> | undefined
  if (stability && !recluster) {
    initial = new Map()
    for (const route of previous.routes) {
      const ids: string[] = []
      for (const stopId of route.stopIds) {
        if (groups.has(`${stopId}#${route.vehicleId}`)) ids.push(`${stopId}#${route.vehicleId}`)
        if (groups.has(stopId)) ids.push(stopId)
      }
      initial.set(route.vehicleId, ids)
    }
  }

  const solved = solveRouting(solverStops, solverVehicles, {
    school: settings.location,
    dwellMin: dwell,
    maxRideMin: settings.maxRideMin,
    rideValue: RIDE_VALUE[settings.priority],
    overLimitValue: OVER_LIMIT_VALUE,
    unservedValue: UNSERVED_VALUE,
    moveValue: stability ? MOVE_VALUE : 0,
    iterations,
    seed: SEED,
    initial,
  })

  // 4. Assemble the plan.
  const routes: Route[] = [...lockedRoutes.map((r) => ({ ...r, stopIds: [...r.stopIds] }))]
  for (const vehicle of fleet) {
    const stopIds: string[] = []
    for (const groupId of solved.routes.get(vehicle.id) ?? []) {
      const group = groups.get(groupId)!
      if (!stopIds.includes(group.stop.id)) stopIds.push(group.stop.id)
      for (const rider of group.riders) seats[rider.id] = { stopId: group.stop.id, vehicleId: vehicle.id }
    }
    routes.push({ vehicleId: vehicle.id, stopIds, locked: false })
  }

  const plan: Plan = { stops: clustered.stops, routes, seats, waitlist, blocked: previous.blocked, optimisedAt: Date.now() }

  // 5. A stop that didn't fit whole can still fill the seats left on a passing vehicle.
  const counts = seatCounts(plan)
  const unserved = solved.unserved.map((id) => groups.get(id)!).sort((a, b) => Math.min(...a.riders.map((r) => rank.get(r.id) ?? 0)) - Math.min(...b.riders.map((r) => rank.get(r.id) ?? 0)))
  for (const group of unserved) {
    const queue = [...group.riders].sort((a, b) => a.registeredAt - b.registeredAt)
    const options_ = fleet
      .filter((v) => (!group.vehicleId || v.id === group.vehicleId) && canReach(v, group.stop) && (counts.get(v.id) ?? 0) < v.seats)
      .map((vehicle) => {
        const route = routes.find((r) => r.vehicleId === vehicle.id)!
        return { vehicle, route, ...bestInsertion(route, group.stop.position, vehicle, stopsById, settings.location) }
      })
      .sort((a, b) => a.added - b.added)
    for (const option of options_) {
      if (queue.length === 0) break
      const free = option.vehicle.seats - (counts.get(option.vehicle.id) ?? 0)
      if (free <= 0) continue
      if (!option.route.stopIds.includes(group.stop.id)) {
        const positionNow = bestInsertion(option.route, group.stop.position, option.vehicle, stopsById, settings.location)
        const ride = longestRide(option.route, option.vehicle, stopsById, settings, { index: positionNow.index, position: group.stop.position })
        if (ride > settings.maxRideMin * 1.1) continue
        option.route.stopIds.splice(positionNow.index, 0, group.stop.id)
      }
      for (const rider of queue.splice(0, free)) {
        plan.seats[rider.id] = { stopId: group.stop.id, vehicleId: option.vehicle.id }
        counts.set(option.vehicle.id, (counts.get(option.vehicle.id) ?? 0) + 1)
      }
    }
    const reason: WaitReason = group.stop.access === 'van' ? 'no-van' : 'seats-full'
    for (const rider of queue) plan.waitlist[rider.id] = reason
  }

  pruneStops(plan)
  return plan
}

/** Places one child with the least disruption: an existing stop if one is in reach, else a new one. */
function placeIn(state: AppState, plan: Plan, student: Student): WaitReason | null {
  const { settings } = state
  const walk = effectiveWalk(settings)
  const stopsById = new Map(plan.stops.map((s) => [s.id, s]))
  const counts = seatCounts(plan)
  const pinnedVehicle = usableVehicle(state, student.pinnedVehicleId)
  const pinnedStop = student.pinnedStopId ? stopsById.get(student.pinnedStopId) : undefined
  const fleet = state.vehicles.filter((v) => v.enabled && (!pinnedVehicle || v.id === pinnedVehicle.id))
  const routeOf = (v: Vehicle) => plan.routes.find((r) => r.vehicleId === v.id)
  const hasSeat = (v: Vehicle) => (counts.get(v.id) ?? 0) < v.seats
  const riders = new Map<string, number>()
  for (const seat of Object.values(plan.seats)) riders.set(seat.stopId, (riders.get(seat.stopId) ?? 0) + 1)

  const seat = (stop: BoardingPoint, vehicle: Vehicle) => {
    plan.seats[student.id] = { stopId: stop.id, vehicleId: vehicle.id }
    delete plan.waitlist[student.id]
  }

  const nearby = (
    pinnedStop
      ? [pinnedStop]
      : plan.stops
          .filter((s) => haversine(student.home, s.position) <= walk && (riders.get(s.id) ?? 0) < settings.maxStopRiders)
          .sort((a, b) => haversine(student.home, a.position) - haversine(student.home, b.position))
  ) as BoardingPoint[]

  // A vehicle already stopping nearby with a free seat changes nothing for anyone else.
  for (const stop of nearby) {
    for (const vehicle of fleet) {
      if (hasSeat(vehicle) && routeOf(vehicle)?.stopIds.includes(stop.id)) {
        seat(stop, vehicle)
        return null
      }
    }
  }

  // Otherwise a route has to change. Find the cheapest change that keeps rides within the limit.
  let anchor: { position: LatLng; access: BoardingPoint['access'] } | null = null
  if (!pinnedStop) {
    if (!hasRoadData(student.home)) return 'too-far'
    const wide = nearestRoad(student.home, 3, walk)
    const any = wide ?? nearestRoad(student.home, 2, settings.maxWalkMeters)
    if (any) anchor = { position: any.position, access: wide ? 'bus' : 'van' }
  }

  const targets: { position: LatLng; access: BoardingPoint['access']; stop: BoardingPoint | null }[] = [
    ...nearby.map((stop) => ({ position: stop.position, access: stop.access, stop })),
    ...(anchor ? [{ ...anchor, stop: null }] : []),
  ]
  if (targets.length === 0) return 'no-road'

  let best: { vehicle: Vehicle; route: Route; index: number; target: (typeof targets)[number]; cost: number } | null = null
  let sawVehicle = false
  let sawSeat = false
  for (const target of targets) {
    for (const vehicle of fleet) {
      if (target.access === 'van' && vehicle.type !== 'van') continue
      sawVehicle = true
      if (!hasSeat(vehicle)) continue
      sawSeat = true
      const route = routeOf(vehicle)
      if (!route || route.locked) continue
      const { index, added } = bestInsertion(route, target.position, vehicle, stopsById, settings.location)
      if (longestRide(route, vehicle, stopsById, settings, { index, position: target.position }) > settings.maxRideMin) continue
      const start = route.stopIds.length === 0 ? vehicle.crewMonthly : 0
      const cost = added * monthlyCostPerMeter(vehicle, settings) + start
      if (!best || cost < best.cost) best = { vehicle, route, index, target, cost }
    }
  }

  if (!best) {
    if (!sawVehicle) return targets.every((t) => t.access === 'van') ? 'no-van' : 'seats-full'
    if (!sawSeat) return targets.every((t) => t.access === 'van') ? 'no-van' : 'seats-full'
    return 'too-far'
  }

  let stop = best.target.stop
  if (!stop) {
    const taken = new Set(plan.stops.map((s) => s.name))
    const id = `stop-${pointKey(best.target.position)}`
    stop = stopsById.get(id) ?? makeStop(best.target.position, best.target.access, nameForPoint(best.target.position, taken))
    if (!stopsById.has(id)) plan.stops.push(stop)
  }
  best.route.stopIds.splice(best.index, 0, stop.id)
  seat(stop, best.vehicle)
  return null
}

/** Gives waiting children any seats that have opened up, oldest request first. */
function fillWaitlist(state: AppState, plan: Plan) {
  const waiting = state.students.filter((s) => plan.waitlist[s.id]).sort((a, b) => a.registeredAt - b.registeredAt)
  for (const student of waiting) {
    const reason = placeIn(state, plan, student)
    if (reason) plan.waitlist[student.id] = reason
  }
}

function dropSeat(plan: Plan, studentId: string) {
  delete plan.seats[studentId]
  delete plan.waitlist[studentId]
}

/** Slots a new or changed child into the plan without reshuffling anyone else. */
export function placeStudent(state: AppState, student: Student): Plan {
  const plan = clonePlan(state.plan)
  dropSeat(plan, student.id)
  pruneStops(plan)
  const others = state.students.filter((s) => s.id !== student.id)
  const next = { ...state, students: [...others, student], plan }
  const reason = placeIn(next, plan, student)
  if (reason) plan.waitlist[student.id] = reason
  return plan
}

/** Frees a child's seat and offers it to the waitlist. */
export function releaseStudent(state: AppState, studentId: string): Plan {
  const plan = clonePlan(state.plan)
  dropSeat(plan, studentId)
  pruneStops(plan)
  const next = { ...state, students: state.students.filter((s) => s.id !== studentId), plan }
  fillWaitlist(next, plan)
  pruneStops(plan)
  return plan
}

/**
 * Makes a plan valid again after a change, without optimising: vehicles that are
 * gone lose their route, overfull vehicles release their newest riders, and seats
 * that open up go to the waitlist.
 */
export function reconcilePlan(state: AppState): Plan {
  const plan = clonePlan(state.plan)
  const vehiclesById = new Map(state.vehicles.map((v) => [v.id, v]))
  const stopsById = new Map(plan.stops.map((s) => [s.id, s]))
  const newest = [...state.students].sort((a, b) => b.registeredAt - a.registeredAt)

  plan.routes = plan.routes.filter((r) => vehiclesById.get(r.vehicleId)?.enabled)
  for (const vehicle of state.vehicles) {
    if (vehicle.enabled && !plan.routes.some((r) => r.vehicleId === vehicle.id)) plan.routes.push({ vehicleId: vehicle.id, stopIds: [], locked: false })
  }
  for (const route of plan.routes) {
    const vehicle = vehiclesById.get(route.vehicleId)!
    route.stopIds = route.stopIds.filter((id) => stopsById.has(id) && canReach(vehicle, stopsById.get(id)!))
  }

  const counts = new Map<string, number>()
  for (const student of [...newest].reverse()) {
    const seat = plan.seats[student.id]
    if (!seat) continue
    const vehicle = vehiclesById.get(seat.vehicleId)
    const route = plan.routes.find((r) => r.vehicleId === seat.vehicleId)
    const onRoute = route?.stopIds.includes(seat.stopId)
    const room = vehicle && (counts.get(vehicle.id) ?? 0) < vehicle.seats
    if (!vehicle?.enabled || !onRoute || !room) {
      delete plan.seats[student.id]
      plan.waitlist[student.id] = 'seats-full'
      continue
    }
    counts.set(vehicle.id, (counts.get(vehicle.id) ?? 0) + 1)
  }

  pruneStops(plan)
  fillWaitlist({ ...state, plan }, plan)
  pruneStops(plan)
  return plan
}

/** How many children would change vehicle or boarding point between two plans. */
export function countMoved(before: Plan, after: Plan): number {
  let moved = 0
  for (const [id, seat] of Object.entries(after.seats)) {
    const old = before.seats[id]
    if (old && (old.vehicleId !== seat.vehicleId || old.stopId !== seat.stopId)) moved++
  }
  return moved
}

export function emptyPlan(): Plan {
  return { stops: [], routes: [], seats: {}, waitlist: {}, blocked: [], optimisedAt: 0 }
}

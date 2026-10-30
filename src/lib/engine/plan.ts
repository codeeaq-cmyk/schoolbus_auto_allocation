// Turns the school's fleet and the parents' requests into a plan, and keeps that
// plan up to date. New requests are slotted in with as little disruption as
// possible; full re-optimisation is a separate, deliberate step.
import { pointKey, travelMeters } from '../distance'
import { haversine } from '../geo'
import { hasRoadData, nameForPoint, nearestRoad } from '../roads'
import type { AppState, BoardingPoint, LatLng, Plan, Route, Settings, Student, Vehicle, WaitReason } from '../types'
import { clusterStudents, effectiveWalk, makeStop } from './boarding'
import { feeForStop } from './fees'
import { solveRouting, type SolverStop, type SolverVehicle } from './solver'

const RIDE_VALUE = { profit: 1, balanced: 4, comfort: 14 }
const OVER_LIMIT_VALUE = 300
const UNSERVED_VALUE = 5000
const MOVE_VALUE = 120
/** Van seats are scarce: lanes have nothing else, so a child a bus could carry should ride the bus. */
const VAN_SEAT_VALUE = 120
const SEED = 20261030
/** Monthly cost of each metre a child walks, for weighing a longer walk against a detour. */
const WALK_VALUE = 1
/** How far the running cost of serving one child may exceed their fee. */
const AFFORD = { profit: 1, balanced: 1.5, comfort: 2.5 }

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
    vanSeatValue: VAN_SEAT_VALUE,
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
    const hadSeats = options_.length > 0
    for (const option of options_) {
      if (queue.length === 0) break
      const free = option.vehicle.seats - (counts.get(option.vehicle.id) ?? 0)
      if (free <= 0) continue
      if (!option.route.stopIds.includes(group.stop.id)) {
        const positionNow = bestInsertion(option.route, group.stop.position, option.vehicle, stopsById, settings.location)
        // A pinned group is the school's call; otherwise don't send a vehicle across town.
        if (!group.vehicleId && option.route.stopIds.length > 0 && positionNow.added > detourLimit(option.vehicle, settings)) continue
        const ride = longestRide(option.route, option.vehicle, stopsById, settings, { index: positionNow.index, position: group.stop.position })
        if (ride > settings.maxRideMin * 1.1) continue
        option.route.stopIds.splice(positionNow.index, 0, group.stop.id)
      }
      for (const rider of queue.splice(0, free)) {
        plan.seats[rider.id] = { stopId: group.stop.id, vehicleId: option.vehicle.id }
        counts.set(option.vehicle.id, (counts.get(option.vehicle.id) ?? 0) + 1)
      }
    }
    const reason: WaitReason = hadSeats ? 'no-route' : group.stop.access === 'van' ? 'no-van' : 'seats-full'
    for (const rider of queue) plan.waitlist[rider.id] = reason
  }

  pruneStops(plan)
  return plan
}

/** Monthly cost of a vehicle running these stops: the same sum the optimiser minimises. */
function routeCost(vehicle: Vehicle, points: { position: LatLng; load: number }[], settings: Settings): number {
  if (points.length === 0) return 0
  const speed = metersPerMinute(vehicle, settings)
  const dwell = settings.dwellSec / 60
  let meters = travelMeters(vehicle.start.position, points[0].position)
  for (let i = 1; i < points.length; i++) meters += travelMeters(points[i - 1].position, points[i].position)
  meters += travelMeters(points[points.length - 1].position, settings.location) + tailMeters(vehicle, settings)

  let cost = vehicle.crewMonthly + meters * monthlyCostPerMeter(vehicle, settings)
  let minutes = 0
  let next = settings.location
  for (let i = points.length - 1; i >= 0; i--) {
    minutes += travelMeters(points[i].position, next) / speed + dwell
    cost += points[i].load * minutes * RIDE_VALUE[settings.priority]
    if (minutes > settings.maxRideMin) cost += points[i].load * (minutes - settings.maxRideMin) * OVER_LIMIT_VALUE
    next = points[i].position
  }
  return cost
}

/** Metres of extra driving this vehicle may take on for one child. */
function detourLimit(vehicle: Vehicle, settings: Settings): number {
  return settings.maxDetourMin * metersPerMinute(vehicle, settings)
}

interface Target {
  position: LatLng
  access: BoardingPoint['access']
  /** Null when this would be a new boarding point. */
  stop: BoardingPoint | null
  walk: number
}

interface SeatMove {
  riders: Student[]
  stopId: string
  to: Vehicle
  toRoute: Route
  /** Where to add the stop on the receiving route; -1 if it already stops there. */
  toIndex: number
  /** The whole group is leaving, so the stop can come off the old route. */
  emptiesStop: boolean
}

interface Placement {
  vehicle: Vehicle
  route: Route
  target: Target
  /** Where to add the stop on the route; -1 if it already stops there. */
  index: number
  cost: number
  move: SeatMove | null
  /** The stop list the route ends up with before adding the target. */
  stopIds: string[]
}

/**
 * Places one child with the least disruption, and refuses to be silly about it.
 *
 * 1. A vehicle already stopping within a comfortable walk, with a free seat: nothing
 *    changes for anyone, so take it.
 * 2. Otherwise price every way of serving them: a stop further along the walking limit,
 *    a new stop on a passing route, or freeing a seat on a full vehicle that passes the
 *    door by moving a rider who can use another vehicle just as easily.
 * 3. Take the cheapest, but only if it is short enough for the children already on board
 *    and doesn't cost more than the child pays. Otherwise they wait, and the school is
 *    told a vehicle is needed there, rather than a van driving across the city for one child.
 *
 * A vehicle the school pinned the child to is their decision, so it skips step 3.
 */
function placeIn(state: AppState, plan: Plan, student: Student): WaitReason | null {
  const { settings } = state
  const comfortable = effectiveWalk(settings)
  const stopsById = new Map(plan.stops.map((s) => [s.id, s]))
  const counts = seatCounts(plan)
  const pinnedVehicle = usableVehicle(state, student.pinnedVehicleId)
  const pinnedStop = student.pinnedStopId ? stopsById.get(student.pinnedStopId) : undefined
  const everyone = state.vehicles.filter((v) => v.enabled)
  const fleet = everyone.filter((v) => !pinnedVehicle || v.id === pinnedVehicle.id)
  const routeOf = (v: Vehicle) => plan.routes.find((r) => r.vehicleId === v.id)
  const hasSeat = (v: Vehicle) => (counts.get(v.id) ?? 0) < v.seats

  const riders = new Map<string, number>()
  const load = new Map<string, number>()
  const seatedAt = new Map<string, Student[]>()
  for (const other of state.students) {
    const s = plan.seats[other.id]
    if (!s) continue
    riders.set(s.stopId, (riders.get(s.stopId) ?? 0) + 1)
    const key = `${s.vehicleId}|${s.stopId}`
    load.set(key, (load.get(key) ?? 0) + 1)
    if (!seatedAt.has(key)) seatedAt.set(key, [])
    seatedAt.get(key)!.push(other)
  }

  const seat = (stop: BoardingPoint, vehicle: Vehicle) => {
    plan.seats[student.id] = { stopId: stop.id, vehicleId: vehicle.id }
    delete plan.waitlist[student.id]
  }

  const within = (s: BoardingPoint) => haversine(student.home, s.position)
  const nearby = pinnedStop
    ? [pinnedStop]
    : plan.stops.filter((s) => within(s) <= settings.maxWalkMeters && (riders.get(s.id) ?? 0) < settings.maxStopRiders).sort((a, b) => within(a) - within(b))

  // A vehicle already stopping close by with a free seat changes nothing for anyone else.
  for (const stop of nearby) {
    if (!pinnedStop && within(stop) > comfortable) break
    for (const vehicle of fleet) {
      if (hasSeat(vehicle) && routeOf(vehicle)?.stopIds.includes(stop.id)) {
        seat(stop, vehicle)
        return null
      }
    }
  }

  if (!pinnedStop && !hasRoadData(student.home)) return 'too-far'

  const targets: Target[] = nearby.map((stop) => ({ position: stop.position, access: stop.access, stop, walk: within(stop) }))
  if (!pinnedStop) {
    // A main road at the edge of the walking limit beats a van-only lane stop if it saves a long run.
    const wide = nearestRoad(student.home, 3, settings.maxWalkMeters)
    if (wide) targets.push({ position: wide.position, access: 'bus', stop: null, walk: wide.meters })
    if (!wide || wide.meters > comfortable) {
      const lane = nearestRoad(student.home, 2, settings.maxWalkMeters)
      if (lane) targets.push({ position: lane.position, access: 'van', stop: null, walk: lane.meters })
    }
  }
  if (targets.length === 0) return 'no-road'

  const pointsOf = (vehicle: Vehicle, stopIds: string[]) => stopIds.map((id) => ({ position: stopsById.get(id)!.position, load: load.get(`${vehicle.id}|${id}`) ?? 0 }))
  const insertTarget = (points: { position: LatLng; load: number }[], stopIds: string[], index: number, target: Target, vehicle: Vehicle) => {
    const out = [...points]
    if (index >= 0) out.splice(index, 0, { position: target.position, load: 1 })
    else {
      const at = target.stop ? stopIds.indexOf(target.stop.id) : -1
      if (at >= 0) out[at] = { ...out[at], load: out[at].load + 1 }
    }
    return routeCost(vehicle, out, settings)
  }

  /** Can a rider on this full vehicle move to another without a long run of their own? */
  const bestMove = (vehicle: Vehicle, route: Route, target: Target, limit: number): { cost: number; index: number; move: SeatMove; stopIds: string[] } | null => {
    let best: { cost: number; index: number; move: SeatMove; stopIds: string[] } | null = null
    const before = routeCost(vehicle, pointsOf(vehicle, route.stopIds), settings)
    for (const stopId of route.stopIds) {
      const stop = stopsById.get(stopId)!
      if (stop.pinnedVehicleId === vehicle.id || target.stop?.id === stopId) continue
      const onBoard = seatedAt.get(`${vehicle.id}|${stopId}`) ?? []
      // Newest requests move first; pinned riders never do.
      const movable = onBoard.filter((r) => !r.pinnedVehicleId).sort((a, b) => b.registeredAt - a.registeredAt)
      if (movable.length === 0) continue

      for (const other of everyone) {
        if (other.id === vehicle.id || !canReach(other, stop)) continue
        const otherRoute = routeOf(other)
        const free = other.seats - (counts.get(other.id) ?? 0)
        if (!otherRoute || otherRoute.locked || otherRoute.stopIds.length === 0 || free < 1) continue

        const passes = otherRoute.stopIds.includes(stopId)
        const insertion = passes ? { index: -1, added: 0 } : bestInsertion(otherRoute, stop.position, other, stopsById, settings.location)
        if (insertion.added > detourLimit(other, settings)) continue

        const whole = movable.length === onBoard.length && free >= onBoard.length
        const moving = whole ? movable : movable.slice(0, 1)
        const stopIds = whole ? route.stopIds.filter((id) => id !== stopId) : route.stopIds
        const trimmed: Route = { ...route, stopIds }
        const placed = target.stop && stopIds.includes(target.stop.id) ? { index: -1, added: 0 } : bestInsertion(trimmed, target.position, vehicle, stopsById, settings.location)
        if (placed.added > limit) continue

        const points = pointsOf(vehicle, stopIds).map((point, i) => (!whole && stopIds[i] === stopId ? { ...point, load: point.load - moving.length } : point))
        const otherPoints = pointsOf(other, otherRoute.stopIds)
        const receiving = [...otherPoints]
        if (passes) {
          const at = otherRoute.stopIds.indexOf(stopId)
          receiving[at] = { ...receiving[at], load: receiving[at].load + moving.length }
        } else {
          receiving.splice(insertion.index, 0, { position: stop.position, load: moving.length })
        }
        const cost =
          insertTarget(points, stopIds, placed.index, target, vehicle) -
          before +
          routeCost(other, receiving, settings) -
          routeCost(other, otherPoints, settings) +
          moving.length * MOVE_VALUE
        if (!best || cost < best.cost) {
          best = {
            cost,
            index: placed.index,
            stopIds,
            move: { riders: moving, stopId, to: other, toRoute: otherRoute, toIndex: insertion.index, emptiesStop: whole },
          }
        }
      }
    }
    return best
  }

  let best: Placement | null = null
  let sawVehicle = false
  let sawSeat = false
  let sawDetour = false

  for (const target of targets) {
    const walkCost = target.walk * WALK_VALUE
    for (const vehicle of fleet) {
      if (target.access === 'van' && vehicle.type !== 'van') continue
      const route = routeOf(vehicle)
      if (!route) continue
      sawVehicle = true
      const passes = !!target.stop && route.stopIds.includes(target.stop.id)
      const limit = pinnedVehicle ? Infinity : detourLimit(vehicle, settings)

      if (hasSeat(vehicle)) {
        sawSeat = true
        if (passes) {
          if (!best || walkCost < best.cost) best = { vehicle, route, target, index: -1, cost: walkCost, move: null, stopIds: route.stopIds }
          continue
        }
        if (route.locked) continue
        const { index, added } = bestInsertion(route, target.position, vehicle, stopsById, settings.location)
        if (route.stopIds.length > 0 && added > limit) {
          sawDetour = true
          continue
        }
        // A route already over the limit can still take a stop that barely changes it; a pinned child always can.
        const ride = longestRide(route, vehicle, stopsById, settings, { index, position: target.position })
        if (!pinnedVehicle && ride > settings.maxRideMin && ride > longestRide(route, vehicle, stopsById, settings) + 2) {
          sawDetour = true
          continue
        }
        const points = pointsOf(vehicle, route.stopIds)
        const cost = insertTarget(points, route.stopIds, index, target, vehicle) - routeCost(vehicle, points, settings)
        const fee = feeForStop(target.position, settings)
        // Starting an idle vehicle: its crew is judged by the plan as a whole, not by this one child.
        // With nothing running at all, someone has to be first.
        const running = route.stopIds.length === 0 ? cost - vehicle.crewMonthly : cost
        const first = route.stopIds.length === 0 && plan.routes.every((r) => r.stopIds.length === 0)
        if (!pinnedVehicle && !first && running > fee * AFFORD[settings.priority]) {
          sawDetour = true
          continue
        }
        const total = cost + walkCost
        if (!best || total < best.cost) best = { vehicle, route, target, index, cost: total, move: null, stopIds: route.stopIds }
      } else if (!route.locked) {
        // Full, but it passes right here. Could someone on board ride another vehicle instead?
        const swap = bestMove(vehicle, route, target, limit)
        if (!swap) continue
        const fee = feeForStop(target.position, settings)
        if (!pinnedVehicle && swap.cost > fee * AFFORD[settings.priority]) {
          sawDetour = true
          continue
        }
        sawSeat = true
        const total = swap.cost + walkCost
        if (!best || total < best.cost) best = { vehicle, route, target, index: swap.index, cost: total, move: swap.move, stopIds: swap.stopIds }
      }
    }
  }

  if (!best) {
    const vanOnly = targets.every((t) => t.access === 'van')
    if (sawDetour) return 'no-route'
    if (!sawVehicle || !sawSeat) return vanOnly ? 'no-van' : 'seats-full'
    return 'no-route'
  }

  if (best.move) {
    const { riders: moving, stopId, to, toRoute, toIndex, emptiesStop } = best.move
    for (const rider of moving) plan.seats[rider.id] = { stopId, vehicleId: to.id }
    if (toIndex >= 0) toRoute.stopIds.splice(toIndex, 0, stopId)
    if (emptiesStop) best.route.stopIds = best.route.stopIds.filter((id) => id !== stopId)
  }

  let stop = best.target.stop
  if (!stop) {
    const taken = new Set(plan.stops.map((s) => s.name))
    const id = `stop-${pointKey(best.target.position)}`
    stop = stopsById.get(id) ?? makeStop(best.target.position, best.target.access, nameForPoint(best.target.position, taken))
    if (!stopsById.has(id)) plan.stops.push(stop)
  }
  if (best.index >= 0 && !best.route.stopIds.includes(stop.id)) best.route.stopIds.splice(best.index, 0, stop.id)
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

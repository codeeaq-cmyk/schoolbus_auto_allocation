// Read-only picture of the plan for the UI: timings, riders, distances and fees.
// Everything here is derived, so it can never drift from the plan itself.
import { travelMeters } from '../distance'
import { buildGeometry, haversine, pointAlong, routeKey, type RouteGeometry } from '../geo'
import { narrowMeters } from '../roads'
import { parseClock } from '../time'
import type { AppState, BoardingPoint, FeeSlab, LatLng, Route, Settings, Student, Vehicle, WaitReason } from '../types'
import { metersPerMinute } from './plan'

export function arrivalMinutes(settings: Settings): number {
  return parseClock(settings.startTime) - settings.arrivalBufferMin
}

export function waypointsOf(vehicle: Vehicle, stops: BoardingPoint[], settings: Settings): LatLng[] {
  return [vehicle.start.position, ...stops.map((s) => s.position), settings.location, ...(vehicle.end ? [vehicle.end.position] : [])]
}

export type RouteStatus = 'none' | 'loading' | 'road' | 'straight'

export interface StopOnRoute {
  stop: BoardingPoint
  /** Stop position snapped onto the road, when known. */
  position: LatLng
  /** Metres along the drawn path. */
  along: number
  /** Minutes since midnight. */
  pickup: number
  dropoff: number
  riders: Student[]
}

export interface RouteView {
  vehicle: Vehicle
  route: Route
  geometry: RouteGeometry
  stops: StopOnRoute[]
  /** Road metres from the start to school. */
  metersToSchool: number
  /** Road metres for the whole run, including any drive after school. */
  metersTotal: number
  departure: number
  arrival: number
  /** Path position where the vehicle reaches school. */
  schoolAlong: number
  riders: number
  rideAvg: number
  rideMax: number
  /** For buses: metres of the route on roads estimated too narrow. */
  narrowMeters: number
  key: string
  roadSnapped: boolean
}

export type StudentView =
  | {
      status: 'seated'
      student: Student
      stop: BoardingPoint
      vehicle: Vehicle
      route: RouteView
      position: LatLng
      walkMeters: number
      pickup: number
      dropoff: number
      rideMin: number
      fee: number
    }
  | {
      status: 'waitlisted'
      student: Student
      reason: WaitReason
      /** What the family would pay once seated. */
      fee: number
    }

export interface PlanView {
  routes: Map<string, RouteView>
  students: Map<string, StudentView>
  stopsById: Map<string, BoardingPoint>
  load: Map<string, number>
}

/** Monthly fee for a distance. Slabs are ordered; the last one has no upper limit. */
export function feeForKm(km: number, slabs: FeeSlab[]): number {
  for (const slab of slabs) {
    if (slab.upToKm === null || km <= slab.upToKm) return slab.monthly
  }
  return slabs[slabs.length - 1]?.monthly ?? 0
}

/** Fees depend on how far the boarding point is from school, not on the vehicle's route. */
export function feeForStop(position: LatLng, settings: Settings): number {
  return feeForKm(travelMeters(position, settings.location) / 1000, settings.feeSlabs)
}

const narrowCache = new Map<string, number>()

function routeNarrowMeters(key: string, path: LatLng[]): number {
  let value = narrowCache.get(key)
  if (value === undefined) {
    value = narrowMeters(path)
    if (narrowCache.size > 200) narrowCache.clear()
    narrowCache.set(key, value)
  }
  return value
}

function buildRouteView(state: AppState, vehicle: Vehicle, route: Route, stopsById: Map<string, BoardingPoint>, ridersAt: Map<string, Student[]>): RouteView {
  const { settings } = state
  const stops = route.stopIds.map((id) => stopsById.get(id)).filter((s): s is BoardingPoint => !!s)
  const waypoints = waypointsOf(vehicle, stops, settings)
  const key = routeKey(waypoints)
  const saved = state.paths[vehicle.id]
  const fresh = saved?.key === key && saved.legs.length === waypoints.length - 1
  const hasStops = stops.length > 0

  // Road metres per leg, exact from the road path or estimated until it arrives.
  const legs = fresh ? saved.legs : waypoints.slice(1).map((p, i) => travelMeters(waypoints[i], p))
  const geometry = buildGeometry(hasStops ? (fresh ? saved.path : waypoints) : [])
  const legTotal = legs.reduce((sum, m) => sum + m, 0)
  // Legs are road metres, the drawn path may be straight: scale so positions land on the path.
  const scale = legTotal > 0 ? geometry.length / legTotal : 1

  const speed = metersPerMinute(vehicle, settings)
  const dwell = settings.dwellSec / 60
  const arrival = arrivalMinutes(settings)
  const evening = parseClock(settings.endTime) + 10

  const n = stops.length
  const metersToSchool = legs.slice(0, n + 1).reduce((sum, m) => sum + m, 0)
  const metersTotal = legTotal

  // Morning, worked back from arrival. Evening runs the same road in reverse.
  const pickups = new Array<number>(n)
  let time = arrival
  for (let i = n - 1; i >= 0; i--) {
    time -= legs[i + 1] / speed + dwell
    pickups[i] = time
  }
  const departure = n > 0 ? pickups[0] - legs[0] / speed : arrival
  const dropoffs = new Array<number>(n)
  let eveningTime = evening
  for (let i = n - 1; i >= 0; i--) {
    eveningTime += legs[i + 1] / speed
    dropoffs[i] = eveningTime
    eveningTime += dwell
  }

  let along = 0
  let riderCount = 0
  let rideTotal = 0
  let rideMax = 0
  const stopViews: StopOnRoute[] = stops.map((stop, i) => {
    along += legs[i]
    const riders = ridersAt.get(`${vehicle.id}|${stop.id}`) ?? []
    const ride = arrival - pickups[i]
    if (riders.length > 0) {
      riderCount += riders.length
      rideTotal += ride * riders.length
      rideMax = Math.max(rideMax, ride)
    }
    const snapped = fresh ? saved.snapped[i + 1] : undefined
    return { stop, position: snapped ?? stop.position, along: along * scale, pickup: pickups[i], dropoff: dropoffs[i], riders }
  })

  return {
    vehicle,
    route,
    geometry,
    stops: stopViews,
    metersToSchool,
    metersTotal,
    departure,
    arrival,
    schoolAlong: metersToSchool * scale,
    riders: riderCount,
    rideAvg: riderCount > 0 ? rideTotal / riderCount : 0,
    rideMax,
    narrowMeters: vehicle.type === 'bus' && fresh && hasStops ? routeNarrowMeters(key, saved.path) : 0,
    key,
    roadSnapped: fresh,
  }
}

export function buildPlanView(state: AppState): PlanView {
  const { plan, settings } = state
  const stopsById = new Map(plan.stops.map((s) => [s.id, s]))
  const ridersAt = new Map<string, Student[]>()
  const load = new Map<string, number>()
  for (const student of state.students) {
    const seat = plan.seats[student.id]
    if (!seat) continue
    const key = `${seat.vehicleId}|${seat.stopId}`
    if (!ridersAt.has(key)) ridersAt.set(key, [])
    ridersAt.get(key)!.push(student)
    load.set(seat.vehicleId, (load.get(seat.vehicleId) ?? 0) + 1)
  }

  const routes = new Map<string, RouteView>()
  for (const vehicle of state.vehicles) {
    const route = plan.routes.find((r) => r.vehicleId === vehicle.id) ?? { vehicleId: vehicle.id, stopIds: [], locked: false }
    routes.set(vehicle.id, buildRouteView(state, vehicle, route, stopsById, ridersAt))
  }

  const students = new Map<string, StudentView>()
  for (const student of state.students) {
    const seat = plan.seats[student.id]
    const route = seat ? routes.get(seat.vehicleId) : undefined
    const onRoute = seat ? route?.stops.find((s) => s.stop.id === seat.stopId) : undefined
    if (seat && route && onRoute) {
      students.set(student.id, {
        status: 'seated',
        student,
        stop: onRoute.stop,
        vehicle: route.vehicle,
        route,
        position: onRoute.position,
        walkMeters: haversine(student.home, onRoute.stop.position),
        pickup: onRoute.pickup,
        dropoff: onRoute.dropoff,
        rideMin: route.arrival - onRoute.pickup,
        fee: student.feeOverride ?? feeForStop(onRoute.stop.position, settings),
      })
    } else {
      const road = feeForStop(student.home, settings)
      students.set(student.id, { status: 'waitlisted', student, reason: plan.waitlist[student.id] ?? 'seats-full', fee: student.feeOverride ?? road })
    }
  }

  return { routes, students, stopsById, load }
}

export type VehiclePhase = 'scheduled' | 'en-route' | 'stopped' | 'arrived'

export interface LiveVehicle {
  position: LatLng
  along: number
  phase: VehiclePhase
}

/** Where a vehicle is at a given time of day during the morning run. */
export function liveVehicle(route: RouteView, clock: number, settings: Settings): LiveVehicle {
  const dwell = settings.dwellSec / 60
  const { geometry, stops, schoolAlong, departure, arrival } = route
  const at = (along: number, phase: VehiclePhase): LiveVehicle => ({ position: pointAlong(geometry, along).point, along, phase })
  if (clock <= departure) return at(0, 'scheduled')
  if (clock >= arrival) return at(schoolAlong, 'arrived')

  let fromAlong = 0
  let fromTime = departure
  for (const stop of stops) {
    if (clock < stop.pickup) {
      const t = (clock - fromTime) / Math.max(stop.pickup - fromTime, 1e-6)
      return at(fromAlong + (stop.along - fromAlong) * t, 'en-route')
    }
    if (clock < stop.pickup + dwell) return at(stop.along, 'stopped')
    fromAlong = stop.along
    fromTime = stop.pickup + dwell
  }
  const t = (clock - fromTime) / Math.max(arrival - fromTime, 1e-6)
  return at(fromAlong + (schoolAlong - fromAlong) * t, 'en-route')
}

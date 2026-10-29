import { buildGeometry, pointAlong, projectOnRoute, routePoints, type Projection, type RouteGeometry } from './geo'
import { parseClock } from './time'
import type { AppState, Assignment, Bus, LatLng, SchoolSettings, Stop, Student } from './types'

export interface BusRoute {
  bus: Bus
  geometry: RouteGeometry
  /** Minutes since midnight when the bus leaves its first stop. */
  departure: number
  /** Minutes since midnight when the bus reaches school. */
  arrival: number
  /** Distance along the route of each stop, same order as bus.stops. */
  stopAlong: number[]
}

export interface AssignmentResult {
  routes: Map<string, BusRoute>
  byStudent: Map<string, Assignment>
  /** Seats taken per bus. */
  load: Map<string, number>
}

export function metersPerMinute(settings: SchoolSettings): number {
  return (Math.max(settings.avgSpeedKmh, 1) * 1000) / 60
}

export function arrivalMinutes(settings: SchoolSettings): number {
  return parseClock(settings.startTime) - settings.arrivalBufferMin
}

export function buildRoutes(state: AppState): Map<string, BusRoute> {
  const { settings } = state
  const speed = metersPerMinute(settings)
  const arrival = arrivalMinutes(settings)
  const routes = new Map<string, BusRoute>()
  for (const bus of state.buses) {
    const geometry = buildGeometry(routePoints(bus, settings.location))
    routes.set(bus.id, {
      bus,
      geometry,
      departure: arrival - geometry.length / speed,
      arrival,
      stopAlong: bus.stops.map((s) => projectOnRoute(s.position, geometry)?.along ?? 0),
    })
  }
  return routes
}

export function timeAtAlong(route: BusRoute, along: number, settings: SchoolSettings): number {
  return route.departure + along / metersPerMinute(settings)
}

function nearestStop(route: BusRoute, along: number): Stop | null {
  let best: Stop | null = null
  let bestGap = Infinity
  route.bus.stops.forEach((stop, i) => {
    const gap = Math.abs(route.stopAlong[i] - along)
    if (gap < bestGap) {
      bestGap = gap
      best = stop
    }
  })
  return best
}

const isRoutable = (route: BusRoute | undefined): route is BusRoute => !!route && route.geometry.points.length >= 2

/**
 * Seats every student on a bus.
 *
 * Rules, in order:
 * 1. Students the school pinned to a bus keep that bus while it has seats.
 * 2. Everyone else is served first-come-first-served by registration time.
 * 3. A student gets the closest bus route within walking distance that still has a free seat.
 * 4. Otherwise they are waitlisted: "buses-full" if a route is close enough, "no-coverage" if none is.
 *
 * Because the result is derived from state, any change (new bus, capacity, stops,
 * settings) re-balances seats immediately and deterministically.
 */
export function computeAssignments(state: AppState, extraStudents: Student[] = []): AssignmentResult {
  const { settings } = state
  const routes = buildRoutes(state)
  const load = new Map(state.buses.map((b) => [b.id, 0]))
  const byStudent = new Map<string, Assignment>()

  const isPinned = (s: Student) => s.manualBusId !== null && isRoutable(routes.get(s.manualBusId))
  const ordered = [...state.students, ...extraStudents].sort(
    (a, b) => Number(isPinned(b)) - Number(isPinned(a)) || a.registeredAt - b.registeredAt,
  )

  const hasSeat = (bus: Bus) => (load.get(bus.id) ?? 0) < bus.capacity
  const seat = (student: Student, route: BusRoute, projection: Projection, manual: boolean) => {
    load.set(route.bus.id, (load.get(route.bus.id) ?? 0) + 1)
    byStudent.set(student.id, {
      status: 'assigned',
      busId: route.bus.id,
      pickup: projection.point,
      walkMeters: projection.distance,
      alongMeters: projection.along,
      pickupMinutes: timeAtAlong(route, projection.along, settings),
      nearestStop: nearestStop(route, projection.along),
      manual,
    })
  }

  for (const student of ordered) {
    if (isPinned(student)) {
      const route = routes.get(student.manualBusId!)!
      const projection = projectOnRoute(student.home, route.geometry)
      if (projection && hasSeat(route.bus)) {
        seat(student, route, projection, true)
        continue
      }
    }

    const candidates: { route: BusRoute; projection: Projection }[] = []
    for (const route of routes.values()) {
      if (!isRoutable(route)) continue
      const projection = projectOnRoute(student.home, route.geometry)
      if (projection) candidates.push({ route, projection })
    }
    candidates.sort((a, b) => a.projection.distance - b.projection.distance)

    const inRange = candidates.filter((c) => c.projection.distance <= settings.maxWalkMeters)
    const free = inRange.find((c) => hasSeat(c.route.bus))
    if (free) {
      seat(student, free.route, free.projection, false)
      continue
    }

    byStudent.set(student.id, {
      status: 'waitlisted',
      reason: inRange.length > 0 ? 'buses-full' : 'no-coverage',
      nearestBusId: candidates[0]?.route.bus.id ?? null,
      nearestMeters: candidates[0]?.projection.distance ?? null,
    })
  }

  return { routes, byStudent, load }
}

export type AssignedStudent = { student: Student; assignment: Extract<Assignment, { status: 'assigned' }> }

/** Students on a bus in pickup order. */
export function busManifest(result: AssignmentResult, students: Student[], busId: string): AssignedStudent[] {
  const list: AssignedStudent[] = []
  for (const student of students) {
    const assignment = result.byStudent.get(student.id)
    if (assignment?.status === 'assigned' && assignment.busId === busId) list.push({ student, assignment })
  }
  return list.sort((a, b) => a.assignment.alongMeters - b.assignment.alongMeters)
}

/** 1-based place in the queue among students waiting for the same reason near the same bus. */
export function waitlistPosition(result: AssignmentResult, students: Student[], studentId: string): number | null {
  const target = result.byStudent.get(studentId)
  if (target?.status !== 'waitlisted') return null
  const queue = students
    .filter((s) => {
      const a = result.byStudent.get(s.id)
      return a?.status === 'waitlisted' && a.reason === target.reason && a.nearestBusId === target.nearestBusId
    })
    .sort((a, b) => a.registeredAt - b.registeredAt)
  return queue.findIndex((s) => s.id === studentId) + 1
}

export type BusPhase = 'scheduled' | 'en-route' | 'arrived'

export interface LiveBus {
  position: LatLng
  heading: number
  along: number
  phase: BusPhase
}

export function liveBus(route: BusRoute, clock: number, settings: SchoolSettings): LiveBus {
  const along = (clock - route.departure) * metersPerMinute(settings)
  const { point, heading } = pointAlong(route.geometry, along)
  const phase: BusPhase = along <= 0 ? 'scheduled' : along >= route.geometry.length ? 'arrived' : 'en-route'
  return { position: point, heading, along: Math.min(Math.max(along, 0), route.geometry.length), phase }
}

/** Points that frame the whole network: the school and every stop. */
export function networkBounds(state: AppState, routes: BusRoute[]): LatLng[] {
  const points: LatLng[] = [state.settings.location]
  for (const route of routes) points.push(...route.bus.stops.map((s) => s.position))
  return points
}

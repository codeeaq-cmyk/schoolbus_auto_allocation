import type { Bus, LatLng } from './types'

const EARTH_RADIUS = 6371000
const RAD = Math.PI / 180
const METERS_PER_DEG_LAT = 110574

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLng = (b.lng - a.lng) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h))
}

export interface RouteGeometry {
  points: LatLng[]
  /** cumulative[i] is the distance in meters from points[0] to points[i]. */
  cumulative: number[]
  length: number
}

export function buildGeometry(points: LatLng[]): RouteGeometry {
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(points[i - 1], points[i]))
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] ?? 0 }
}

export interface Projection {
  point: LatLng
  /** Straight-line distance from the query point to the route. */
  distance: number
  /** Distance along the route to the projected point. */
  along: number
}

/**
 * Closest point on a polyline to `p`. Uses an equirectangular projection centred
 * on `p`, which is accurate to well under 1% at city scale.
 */
export function projectOnRoute(p: LatLng, route: RouteGeometry): Projection | null {
  const { points, cumulative } = route
  if (points.length === 0) return null
  if (points.length === 1) return { point: points[0], distance: haversine(p, points[0]), along: 0 }

  const kx = 111320 * Math.cos(p.lat * RAD)
  const toX = (q: LatLng) => (q.lng - p.lng) * kx
  const toY = (q: LatLng) => (q.lat - p.lat) * METERS_PER_DEG_LAT

  let best: Projection | null = null
  for (let i = 1; i < points.length; i++) {
    const ax = toX(points[i - 1])
    const ay = toY(points[i - 1])
    const dx = toX(points[i]) - ax
    const dy = toY(points[i]) - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const distance = Math.hypot(cx, cy)
    if (!best || distance < best.distance) {
      best = {
        point: { lat: p.lat + cy / METERS_PER_DEG_LAT, lng: p.lng + cx / kx },
        distance,
        along: cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]),
      }
    }
  }
  return best
}

/** Position and compass heading (degrees, 0 = north) at `distance` meters along the route. */
export function pointAlong(route: RouteGeometry, distance: number): { point: LatLng; heading: number } {
  const { points, cumulative, length } = route
  if (points.length === 0) return { point: { lat: 0, lng: 0 }, heading: 0 }
  if (points.length === 1) return { point: points[0], heading: 0 }

  const d = Math.min(Math.max(distance, 0), length)
  // Binary search for the segment containing d.
  let lo = 1
  let hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] < d) lo = mid + 1
    else hi = mid
  }
  const a = points[lo - 1]
  const b = points[lo]
  const seg = cumulative[lo] - cumulative[lo - 1]
  const t = seg === 0 ? 0 : (d - cumulative[lo - 1]) / seg
  const heading = Math.atan2((b.lng - a.lng) * Math.cos(a.lat * RAD), b.lat - a.lat) / RAD
  return { point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, heading }
}

/** The points a bus must pass through: every stop, then the school. */
export function waypointsOf(bus: Bus, school: LatLng): LatLng[] {
  return [...bus.stops.map((s) => s.position), school]
}

export function routeKey(points: LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')
}

/** True when the stored road path still matches the bus's stops and the school location. */
export function hasFreshPath(bus: Bus, school: LatLng): boolean {
  return bus.path !== null && bus.pathKey === routeKey(waypointsOf(bus, school))
}

/** Road path if it is fresh, otherwise straight lines between waypoints. */
export function routePoints(bus: Bus, school: LatLng): LatLng[] {
  if (bus.stops.length === 0) return []
  return hasFreshPath(bus, school) ? bus.path! : waypointsOf(bus, school)
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(1)} km`
}

// Free public map services. Both are rate-limited demo endpoints, so callers
// only hit them on explicit user actions and always have an offline fallback.
import { buildGeometry } from './geo'
import { narrowMeters, narrowStretches, wideRoadVias } from './roads'
import type { LatLng, VehicleType } from './types'

const OSRM = 'https://router.project-osrm.org'
const NOMINATIM = 'https://nominatim.openstreetmap.org'

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

export interface RoadRoute {
  path: LatLng[]
  /** Road metres of each leg between consecutive waypoints. */
  legs: number[]
  /** Each waypoint snapped onto the road. */
  snapped: LatLng[]
}

async function osrmRoute(points: LatLng[], signal?: AbortSignal): Promise<RoadRoute> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const res = await fetch(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal })
  if (!res.ok) throw new Error(`Routing failed (${res.status})`)
  const json = (await res.json()) as {
    code: string
    routes?: { geometry: { coordinates: [number, number][] }; legs: { distance: number }[] }[]
    waypoints?: { location: [number, number] }[]
  }
  const route = json.routes?.[0]
  if (json.code !== 'Ok' || !route || !json.waypoints) throw new Error(`Routing failed (${json.code})`)
  return {
    path: route.geometry.coordinates.map(([lng, lat]) => ({ lat: round5(lat), lng: round5(lng) })),
    legs: route.legs.map((l) => Math.round(l.distance)),
    snapped: json.waypoints.map((w) => ({ lat: round5(w.location[1]), lng: round5(w.location[0]) })),
  }
}

/** Folds legs and snapped points back onto the original waypoints, dropping steering points. */
function foldToOriginal(route: RoadRoute, coords: { original: boolean }[]): RoadRoute {
  const legs: number[] = []
  const snapped: LatLng[] = [route.snapped[0]]
  let running = 0
  for (let i = 1; i < coords.length; i++) {
    running += route.legs[i - 1]
    if (coords[i].original) {
      legs.push(running)
      snapped.push(route.snapped[i])
      running = 0
    }
  }
  return { path: route.path, legs, snapped }
}

/**
 * Road path through the waypoints for this kind of vehicle. The router only knows
 * cars, so a bus path is checked against road widths: if it cuts through narrow
 * lanes, it is routed again with extra points on wide roads to hold it there.
 */
export async function fetchRoute(waypoints: LatLng[], type: VehicleType, signal?: AbortSignal): Promise<RoadRoute> {
  const first = await osrmRoute(waypoints, signal)
  if (type !== 'bus') return first

  let coords = waypoints.map((p) => ({ p, original: true }))
  let current = first
  let best = first
  let bestNarrow = narrowMeters(first.path)
  const firstLength = buildGeometry(first.path).length

  for (let round = 0; round < 3 && bestNarrow > 0; round++) {
    const stretches = narrowStretches(current.path)
    if (stretches.length === 0) break

    // Find which leg each stretch falls in, then steer that leg along wide roads.
    const scale = buildGeometry(current.path).length / (current.legs.reduce((sum, m) => sum + m, 0) || 1)
    const viasByLeg = new Map<number, LatLng[]>()
    for (const stretch of stretches) {
      let leg = 0
      let cumulative = current.legs[0] * scale
      while (leg < current.legs.length - 1 && cumulative < stretch.along) cumulative += current.legs[++leg] * scale
      const vias = wideRoadVias(stretch.from, stretch.to)
      if (vias && vias.length > 0) viasByLeg.set(leg, [...(viasByLeg.get(leg) ?? []), ...vias])
    }
    if (viasByLeg.size === 0) break

    const next: typeof coords = []
    coords.forEach((coord, i) => {
      next.push(coord)
      for (const p of viasByLeg.get(i) ?? []) next.push({ p, original: false })
    })
    if (next.length > 200) break
    coords = next

    current = await osrmRoute(
      coords.map((c) => c.p),
      signal,
    )
    const narrow = narrowMeters(current.path)
    // Staying on wide roads is worth a detour, within reason.
    if (narrow < bestNarrow && buildGeometry(current.path).length < firstLength * 1.25) {
      bestNarrow = narrow
      best = foldToOriginal(current, coords)
    }
  }
  return best
}

/** Road distances between all points, for the optimiser. Null if the service is unavailable. */
export async function fetchDistanceTable(points: LatLng[], signal?: AbortSignal): Promise<number[][] | null> {
  if (points.length < 2 || points.length > 100) return null
  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
    const res = await fetch(`${OSRM}/table/v1/driving/${coords}?annotations=distance`, { signal })
    if (!res.ok) return null
    const json = (await res.json()) as { code: string; distances?: number[][] }
    return json.code === 'Ok' && json.distances ? json.distances.map((row) => row.map((m) => Math.round(m))) : null
  } catch {
    return null
  }
}

export interface Place {
  id: string
  label: string
  detail: string
  position: LatLng
}

interface NominatimPlace {
  place_id: number
  lat: string
  lon: string
  display_name: string
  name?: string
}

/** Address search biased towards the area around `near`. */
export async function searchPlaces(query: string, near: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const d = 0.3
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: query,
    limit: '6',
    countrycodes: 'in',
    'accept-language': 'en',
    viewbox: `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`,
  })
  const res = await fetch(`${NOMINATIM}/search?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const results = (await res.json()) as NominatimPlace[]
  return results.map((r) => {
    const parts = r.display_name.split(', ')
    return {
      id: String(r.place_id),
      label: r.name || parts[0],
      detail: parts.slice(1, 4).join(', '),
      position: { lat: Number(r.lat), lng: Number(r.lon) },
    }
  })
}

interface NominatimReverse {
  display_name?: string
  address?: Record<string, string>
}

/** Short human-readable address for a point, or null if the lookup fails. */
export async function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(p.lat),
    lon: String(p.lng),
    zoom: '17',
    'accept-language': 'en',
  })
  try {
    const res = await fetch(`${NOMINATIM}/reverse?${params}`, { signal })
    if (!res.ok) return null
    const json = (await res.json()) as NominatimReverse
    const a = json.address ?? {}
    const street = [a.house_number, a.road].filter(Boolean).join(' ')
    const area = a.neighbourhood || a.suburb || a.quarter || a.residential
    const city = a.city || a.town || a.state_district
    const label = [street, area, city].filter(Boolean).join(', ')
    return label || json.display_name?.split(', ').slice(0, 3).join(', ') || null
  } catch {
    return null
  }
}

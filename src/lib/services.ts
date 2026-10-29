// Free public map services. Both are rate-limited demo endpoints, so callers
// only hit them on explicit user actions and always have an offline fallback.
import type { LatLng } from './types'

const OSRM = 'https://router.project-osrm.org/route/v1/driving'
const NOMINATIM = 'https://nominatim.openstreetmap.org'

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

/** Road-following driving path through the given waypoints. */
export async function fetchRoadPath(points: LatLng[], signal?: AbortSignal): Promise<LatLng[]> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const res = await fetch(`${OSRM}/${coords}?overview=full&geometries=geojson`, { signal })
  if (!res.ok) throw new Error(`Routing failed (${res.status})`)
  const json = (await res.json()) as { code: string; routes?: { geometry: { coordinates: [number, number][] } }[] }
  const coordinates = json.routes?.[0]?.geometry.coordinates
  if (json.code !== 'Ok' || !coordinates) throw new Error(`Routing failed (${json.code})`)
  return coordinates.map(([lng, lat]) => ({ lat: round5(lat), lng: round5(lng) }))
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

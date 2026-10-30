// Road distances between points. Exact values come from the OSRM table service
// and are cached; anything not cached yet is estimated from straight-line distance.
import { haversine } from './geo'
import type { LatLng } from './types'

/** Road distance is about this many times the straight line in Trivandrum (measured from OSRM). */
export const CIRCUITY = 1.44

export interface DistanceTable {
  keys: string[]
  meters: number[][]
}

const exact = new Map<string, number>()
const tables: DistanceTable[] = []

export function pointKey(p: LatLng): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
}

export function addDistanceTable(table: DistanceTable) {
  tables.push(table)
  const { keys, meters } = table
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      const m = meters[i]?.[j]
      if (m !== null && m !== undefined) exact.set(`${keys[i]}|${keys[j]}`, m)
    }
  }
}

/** Road metres from a to b, exact when known and estimated otherwise. */
export function travelMeters(a: LatLng, b: LatLng): number {
  return exact.get(`${pointKey(a)}|${pointKey(b)}`) ?? haversine(a, b) * CIRCUITY
}

/** Points that are missing from the exact table. */
export function missingKeys(points: LatLng[]): boolean {
  const keys = [...new Set(points.map(pointKey))]
  for (const a of keys) {
    for (const b of keys) {
      if (a !== b && !exact.has(`${a}|${b}`)) return true
    }
  }
  return false
}

/** Tables to persist, newest last and limited so storage stays small. */
export function savedTables(limit = 3): DistanceTable[] {
  return tables.slice(-limit)
}

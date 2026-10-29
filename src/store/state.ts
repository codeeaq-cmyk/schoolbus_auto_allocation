import seed from '../data/seed.json'
import { routeKey, waypointsOf } from '../lib/geo'
import type { AppState, Bus, LatLng, SchoolSettings, Student } from '../lib/types'

export const STATE_VERSION = 1
export const STORAGE_KEY = 'smart-transport-demo/v1'

/** The signed-in parent in the demo; children they register are tagged with this id. */
export const DEMO_PARENT = { id: 'parent-demo', name: 'Priya Nair', phone: '+91 98450 12345' }

interface SeedFile {
  settings: SchoolSettings
  buses: Bus[]
  students: (Omit<Student, 'registeredAt' | 'manualBusId'> & { registeredMinutesAgo: number })[]
}

export function createSeedState(now = Date.now()): AppState {
  const data = seed as SeedFile
  return {
    version: STATE_VERSION,
    settings: { ...data.settings },
    buses: data.buses.map((b) => ({ ...b, stops: b.stops.map((s) => ({ ...s })) })),
    students: data.students.map(({ registeredMinutesAgo, ...s }) => ({
      ...s,
      registeredAt: now - registeredMinutesAgo * 60_000,
      manualBusId: null,
    })),
  }
}

export function parseState(json: string | null): AppState | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as AppState
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.buses) || !Array.isArray(parsed.students)) return null
    return parsed
  } catch {
    return null
  }
}

export function loadState(): AppState {
  try {
    return parseState(localStorage.getItem(STORAGE_KEY)) ?? createSeedState()
  } catch {
    return createSeedState()
  }
}

export type Action =
  | { type: 'bus/add'; bus: Bus }
  | { type: 'bus/update'; id: string; patch: Partial<Omit<Bus, 'id'>> }
  | { type: 'bus/remove'; id: string }
  | { type: 'bus/setPath'; id: string; path: LatLng[]; pathKey: string }
  /** Renames a stop; with `onlyIf`, only while it still has that name (so a lookup never overwrites a manual edit). */
  | { type: 'stop/rename'; busId: string; stopId: string; name: string; onlyIf?: string }
  | { type: 'student/add'; student: Student }
  | { type: 'student/update'; id: string; patch: Partial<Omit<Student, 'id'>> }
  | { type: 'student/remove'; id: string }
  | { type: 'settings/update'; patch: Partial<SchoolSettings> }
  | { type: 'replace'; state: AppState }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'bus/add':
      return { ...state, buses: [...state.buses, action.bus] }
    case 'bus/update':
      return { ...state, buses: state.buses.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b)) }
    case 'bus/remove':
      return {
        ...state,
        buses: state.buses.filter((b) => b.id !== action.id),
        students: state.students.map((s) => (s.manualBusId === action.id ? { ...s, manualBusId: null } : s)),
      }
    case 'bus/setPath':
      return {
        ...state,
        buses: state.buses.map((b) => {
          // Ignore responses for waypoints that have since been edited.
          if (b.id !== action.id || routeKey(waypointsOf(b, state.settings.location)) !== action.pathKey) return b
          return { ...b, path: action.path, pathKey: action.pathKey }
        }),
      }
    case 'stop/rename':
      return {
        ...state,
        buses: state.buses.map((b) =>
          b.id !== action.busId
            ? b
            : {
                ...b,
                stops: b.stops.map((s) =>
                  s.id === action.stopId && (action.onlyIf === undefined || s.name === action.onlyIf) ? { ...s, name: action.name } : s,
                ),
              },
        ),
      }
    case 'student/add':
      return { ...state, students: [...state.students, action.student] }
    case 'student/update':
      return { ...state, students: state.students.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) }
    case 'student/remove':
      return { ...state, students: state.students.filter((s) => s.id !== action.id) }
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'replace':
      return action.state
  }
}

export function uid(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${random}`
}

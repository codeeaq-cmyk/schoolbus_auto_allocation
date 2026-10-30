import seed from '../data/seed.json'
import { addDistanceTable, savedTables, type DistanceTable } from '../lib/distance'
import type { AppState, Plan, RoutePath, Settings, Student, Vehicle } from '../lib/types'

export const STATE_VERSION = 3
export const STORAGE_KEY = 'ceeq-smart-transport/v3'
const TABLES_KEY = 'ceeq-smart-transport/v3/distances'

/** The signed-in parent in the demo; children they register are tagged with this id. */
export const DEMO_PARENT = { id: 'parent-demo', name: 'Lakshmi Nair', phone: '+91 94470 12345' }

interface SeedFile {
  settings: Settings
  vehicles: Vehicle[]
  plan: Plan
  paths: Record<string, RoutePath>
  table: DistanceTable
  students: (Omit<Student, 'registeredAt'> & { registeredMinutesAgo: number })[]
}

const data = seed as unknown as SeedFile
addDistanceTable(data.table)

export function createSeedState(now = Date.now()): AppState {
  return {
    version: STATE_VERSION,
    settings: structuredClone(data.settings),
    vehicles: structuredClone(data.vehicles),
    plan: { ...structuredClone(data.plan), optimisedAt: now },
    paths: structuredClone(data.paths),
    students: data.students.map(({ registeredMinutesAgo, ...s }) => ({ ...s, registeredAt: now - registeredMinutesAgo * 60_000 })),
    activity: [
      {
        id: 'seed-1',
        at: now,
        kind: 'auto',
        text: `Planned ${data.students.length} requests: ${data.plan.stops.length} boarding points across ${data.vehicles.length} vehicles.`,
      },
    ],
  }
}

export function parseState(json: string | null): AppState | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as AppState
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.vehicles) || !Array.isArray(parsed.students) || !parsed.plan) return null
    return parsed
  } catch {
    return null
  }
}

export function loadState(): AppState {
  try {
    const tables = JSON.parse(localStorage.getItem(TABLES_KEY) ?? '[]') as DistanceTable[]
    for (const table of tables) addDistanceTable(table)
    return parseState(localStorage.getItem(STORAGE_KEY)) ?? createSeedState()
  } catch {
    return createSeedState()
  }
}

export function persistDistances() {
  try {
    localStorage.setItem(TABLES_KEY, JSON.stringify(savedTables().filter((t) => t.keys.length !== data.table.keys.length || t.keys[0] !== data.table.keys[0])))
  } catch {
    // Storage full or blocked: distances are simply fetched again next time.
  }
}

export function uid(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${random}`
}

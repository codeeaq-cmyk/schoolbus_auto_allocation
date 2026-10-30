// Automatic boarding points: as few stops as possible, each on a road a vehicle
// can actually reach, with every child inside the walking limit.
import { haversine } from '../geo'
import { pointKey } from '../distance'
import { accessFromLevel, busStopsNear, nameForPoint, nearestRoad, roadLevelNear } from '../roads'
import type { BoardingPoint, LatLng, Priority, Settings, Student, StopAccess, WaitReason } from '../types'

const WALK_FACTOR: Record<Priority, number> = { profit: 1, balanced: 0.85, comfort: 0.6 }

/** Most children a van-only stop should collect, since vans have few seats. */
const VAN_STOP_RIDERS = 8
const BLOCK_RADIUS = 80

export function effectiveWalk(settings: Settings): number {
  return settings.maxWalkMeters * WALK_FACTOR[settings.priority]
}

export function makeStop(position: LatLng, access: StopAccess, name: string, source: BoardingPoint['source'] = 'auto'): BoardingPoint {
  return { id: `stop-${pointKey(position)}`, name, position, access, accessManual: false, source, pinnedVehicleId: null }
}

export function stopAccessAt(position: LatLng): StopAccess {
  return accessFromLevel(roadLevelNear(position))
}

interface Candidate {
  position: LatLng
  named: boolean
}

export interface ClusterResult {
  stops: BoardingPoint[]
  studentStop: Map<string, string>
  unreachable: Map<string, WaitReason>
}

/**
 * Greedy maximum coverage: repeatedly open the road point that gathers the most
 * children still without a stop. Real bus stops win ties, so children board at
 * places they already know.
 */
function cover(group: Student[], candidates: Candidate[], radius: number, cap: number, assign: (candidate: Candidate, members: Student[]) => void) {
  const open = new Set(group.map((s) => s.id))
  const inRange = candidates.map((candidate) =>
    group
      .map((student) => ({ student, walk: haversine(student.home, candidate.position) }))
      .filter((m) => m.walk <= radius)
      .sort((a, b) => a.walk - b.walk),
  )

  while (open.size > 0) {
    let bestIndex = -1
    let bestScore = -Infinity
    for (let i = 0; i < candidates.length; i++) {
      let count = 0
      let walk = 0
      for (const m of inRange[i]) {
        if (!open.has(m.student.id)) continue
        count++
        walk += m.walk
        if (count === cap) break
      }
      if (count === 0) continue
      const score = count + (candidates[i].named ? 0.3 : 0) - walk / 100000
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
    if (bestIndex < 0) break
    const members: Student[] = []
    for (const m of inRange[bestIndex]) {
      if (!open.has(m.student.id)) continue
      members.push(m.student)
      open.delete(m.student.id)
      if (members.length === cap) break
    }
    assign(candidates[bestIndex], members)
  }
}

/** Moves a stop to the candidate with the least total walking that still suits everyone. */
function bestCentre(members: Student[], candidates: Candidate[], radius: number, fallback: Candidate): Candidate {
  let best = fallback
  let bestWalk = Infinity
  for (const candidate of candidates) {
    let walk = 0
    let fits = true
    for (const s of members) {
      const d = haversine(s.home, candidate.position)
      if (d > radius) {
        fits = false
        break
      }
      walk += d
    }
    if (!fits) continue
    // A real bus stop is worth up to 40 m of extra walking per child.
    const score = walk - (candidate.named ? 40 * members.length : 0)
    if (score < bestWalk) {
      bestWalk = score
      best = candidate
    }
  }
  return best
}

function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>()
  for (const c of candidates) {
    const key = pointKey(c.position)
    if (!seen.has(key) || c.named) seen.set(key, c)
  }
  return [...seen.values()]
}

/**
 * Groups children into boarding points.
 *
 * `fixed` stops (manual, or already in use) stay put and take nearby children
 * first. Children with a wide road in reach get a stop any vehicle can serve,
 * even if a narrow lane is closer, because one bus stop on a main road is far
 * cheaper than sending a van down each lane. Only children with no wide road in
 * reach get a van-only stop.
 */
export function clusterStudents(students: Student[], settings: Settings, fixed: BoardingPoint[], blocked: LatLng[], takenNames = new Set<string>()): ClusterResult {
  const radius = effectiveWalk(settings)
  const stops = new Map<string, BoardingPoint>(fixed.map((s) => [s.id, s]))
  const counts = new Map<string, number>()
  const studentStop = new Map<string, string>()
  const unreachable = new Map<string, WaitReason>()
  for (const s of fixed) takenNames.add(s.name)

  const assign = (student: Student, stopId: string) => {
    studentStop.set(student.id, stopId)
    counts.set(stopId, (counts.get(stopId) ?? 0) + 1)
  }
  const isBlocked = (p: LatLng) => blocked.some((b) => haversine(b, p) < BLOCK_RADIUS)

  // Parents' and schools' explicit choices come first.
  const pending: Student[] = []
  for (const student of students) {
    if (student.pinnedStopId && stops.has(student.pinnedStopId)) assign(student, student.pinnedStopId)
    else pending.push(student)
  }

  // Existing stops take the children around them, closest first.
  const open: Student[] = []
  const nearFixed = pending
    .map((student) => {
      let bestStop: BoardingPoint | null = null
      let walk = Infinity
      for (const stop of fixed) {
        const d = haversine(student.home, stop.position)
        const room = (counts.get(stop.id) ?? 0) < settings.maxStopRiders
        if (d <= radius && d < walk && room) {
          bestStop = stop
          walk = d
        }
      }
      return { student, bestStop, walk }
    })
    .sort((a, b) => a.walk - b.walk)
  for (const { student, bestStop } of nearFixed) {
    if (bestStop && (counts.get(bestStop.id) ?? 0) < settings.maxStopRiders) assign(student, bestStop.id)
    else open.push(student)
  }

  // Sort the rest by the roads they can reach on foot.
  const wide: Student[] = []
  const narrow: Student[] = []
  const wideCandidates: Candidate[] = []
  const narrowCandidates: Candidate[] = []
  for (const student of open) {
    const wideRoad = nearestRoad(student.home, 3, radius)
    if (wideRoad && !isBlocked(wideRoad.position)) {
      wide.push(student)
      wideCandidates.push({ position: wideRoad.position, named: false })
      for (const stop of busStopsNear(student.home, radius)) {
        if (roadLevelNear(stop.position) === 3 && !isBlocked(stop.position)) wideCandidates.push({ position: stop.position, named: true })
      }
      continue
    }
    const anyRoad = nearestRoad(student.home, 2, settings.maxWalkMeters)
    if (anyRoad && !isBlocked(anyRoad.position)) {
      narrow.push(student)
      narrowCandidates.push({ position: anyRoad.position, named: false })
    } else {
      unreachable.set(student.id, 'no-road')
    }
  }

  const open_ = (candidate: Candidate, members: Student[], access: StopAccess, pool: Candidate[], searchRadius: number) => {
    const centre = bestCentre(members, pool, searchRadius, candidate)
    const key = `stop-${pointKey(centre.position)}`
    const stop = stops.get(key) ?? makeStop(centre.position, access, nameForPoint(centre.position, takenNames))
    stops.set(stop.id, stop)
    for (const student of members) assign(student, stop.id)
  }

  const wideUnique = dedupe(wideCandidates)
  cover(wide, wideUnique, radius, settings.maxStopRiders, (candidate, members) => open_(candidate, members, 'bus', wideUnique, radius))

  const narrowUnique = dedupe(narrowCandidates)
  cover(narrow, narrowUnique, settings.maxWalkMeters, Math.min(VAN_STOP_RIDERS, settings.maxStopRiders), (candidate, members) =>
    open_(candidate, members, 'van', narrowUnique, settings.maxWalkMeters),
  )

  return { stops: [...stops.values()], studentStop, unreachable }
}

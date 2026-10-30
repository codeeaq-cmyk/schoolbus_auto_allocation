// Road access from OpenStreetMap, baked into a compact grid by scripts/generate-seed.mjs.
// OSM almost never records road width, so width is estimated from the road's class.
import data from '../data/roads.json'
import { haversine } from './geo'
import type { LatLng, RoadLevel, StopAccess } from './types'

interface RoadData {
  south: number
  west: number
  dLat: number
  dLng: number
  rows: number
  cols: number
  cellMeters: number
  /** Run-length encoded levels: "<level><run base36>," */
  rle: string
  /** Two digits per wide cell locating the road inside its cell. */
  offsets: string
  /** [name, lat, lng, kind] where kind 0 is a bus stop and 1 a locality. */
  places: [string, number, number, number][]
}

const road = data as RoadData

interface Decoded {
  levels: Uint8Array
  /** Index into offsets for each wide cell. */
  wideIndex: Int32Array
}

let decoded: Decoded | null = null

function grid(): Decoded {
  if (decoded) return decoded
  const levels = new Uint8Array(road.rows * road.cols)
  const wideIndex = new Int32Array(road.rows * road.cols).fill(-1)
  let cell = 0
  let wide = 0
  for (const run of road.rle.split(',')) {
    if (!run) continue
    const level = Number(run[0])
    const length = parseInt(run.slice(1), 36)
    for (let i = 0; i < length; i++, cell++) {
      levels[cell] = level
      if (level === 3) wideIndex[cell] = wide++
    }
  }
  decoded = { levels, wideIndex }
  return decoded
}

function cellOf(p: LatLng) {
  return { r: Math.floor((p.lat - road.south) / road.dLat), c: Math.floor((p.lng - road.west) / road.dLng) }
}

const inGrid = (r: number, c: number) => r >= 0 && r < road.rows && c >= 0 && c < road.cols

/** A cell's point: on the road itself for wide roads, the cell centre otherwise. */
function cellPoint(r: number, c: number, g: Decoded): LatLng {
  const index = g.wideIndex[r * road.cols + c]
  let fx = 0.5
  let fy = 0.5
  if (index >= 0) {
    fx = (Number(road.offsets[index * 2]) + 0.5) / 10
    fy = (Number(road.offsets[index * 2 + 1]) + 0.5) / 10
  }
  return { lat: road.south + (r + fy) * road.dLat, lng: road.west + (c + fx) * road.dLng }
}

/** True when the road data covers this point. */
export function hasRoadData(p: LatLng): boolean {
  const { r, c } = cellOf(p)
  return inGrid(r, c)
}

export interface RoadHit {
  position: LatLng
  meters: number
  level: RoadLevel
}

/** Closest road of at least `minLevel` within `maxMeters`, or null. */
export function nearestRoad(p: LatLng, minLevel: RoadLevel, maxMeters: number): RoadHit | null {
  const { r: r0, c: c0 } = cellOf(p)
  const g = grid()
  const maxRing = Math.ceil(maxMeters / road.cellMeters) + 1
  let best: RoadHit | null = null
  for (let ring = 0; ring <= maxRing; ring++) {
    if (best && (ring - 1) * road.cellMeters > best.meters) break
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring || !inGrid(r, c)) continue
        const level = g.levels[r * road.cols + c] as RoadLevel
        if (level < minLevel) continue
        const position = cellPoint(r, c, g)
        const meters = haversine(p, position)
        if (meters <= maxMeters && (!best || meters < best.meters)) best = { position, meters, level }
      }
    }
  }
  return best
}

/** The widest road right at this point, allowing for grid-cell rounding. */
export function roadLevelNear(p: LatLng): RoadLevel {
  const { r, c } = cellOf(p)
  if (!inGrid(r, c)) return 0
  const g = grid()
  let level = 0
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (inGrid(r + dr, c + dc)) level = Math.max(level, g.levels[(r + dr) * road.cols + c + dc])
    }
  }
  return level as RoadLevel
}

export function accessFromLevel(level: RoadLevel): StopAccess {
  return level >= 3 ? 'bus' : 'van'
}

/** Metres of a route on roads too narrow for a bus, not counting short connectors. */
export function narrowMeters(path: LatLng[]): number {
  return narrowStretches(path, 100).reduce((sum, s) => sum + s.meters, 0)
}

export interface PlaceHit {
  name: string
  position: LatLng
  meters: number
}

/** Named bus stops within `maxMeters` of a point, closest first. */
export function busStopsNear(p: LatLng, maxMeters: number): PlaceHit[] {
  const hits: PlaceHit[] = []
  for (const [name, lat, lng, kind] of road.places) {
    if (kind !== 0) continue
    const position = { lat, lng }
    const meters = haversine(p, position)
    if (meters <= maxMeters) hits.push({ name, position, meters })
  }
  return hits.sort((a, b) => a.meters - b.meters)
}

/** A human name for a boarding point: the bus stop there, else the locality around it. */
export function nameForPoint(p: LatLng, taken?: Set<string>): string {
  let stop: string | null = null
  let stopMeters = 150
  let place: string | null = null
  let placeMeters = 2500
  for (const [name, lat, lng, kind] of road.places) {
    const meters = haversine(p, { lat, lng })
    if (kind === 0 && meters < stopMeters) {
      stop = name
      stopMeters = meters
    } else if (kind === 1 && meters < placeMeters) {
      place = name
      placeMeters = meters
    }
  }
  const base = stop ?? (place ? `Near ${place}` : 'Roadside stop')
  if (!taken) return base
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`
  taken.add(name)
  return name
}

export interface OverlayImage {
  url: string
  bounds: [[number, number], [number, number]]
}

/** A transparent image of the road grid: wide roads in one color, narrow in another. */
export function roadOverlayImage(wideColor: [number, number, number], narrowColor: [number, number, number]): OverlayImage | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = road.cols
  canvas.height = road.rows
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const image = ctx.createImageData(road.cols, road.rows)
  const { levels } = grid()
  for (let r = 0; r < road.rows; r++) {
    for (let c = 0; c < road.cols; c++) {
      const level = levels[r * road.cols + c]
      if (level < 2) continue
      const color = level === 3 ? wideColor : narrowColor
      // Canvas rows run top-down; the grid runs south to north.
      const i = ((road.rows - 1 - r) * road.cols + c) * 4
      image.data[i] = color[0]
      image.data[i + 1] = color[1]
      image.data[i + 2] = color[2]
      image.data[i + 3] = level === 3 ? 215 : 150
    }
  }
  ctx.putImageData(image, 0, 0)
  return {
    url: canvas.toDataURL('image/png'),
    bounds: [
      [road.south, road.west],
      [road.south + road.rows * road.dLat, road.west + road.cols * road.dLng],
    ],
  }
}

export interface NarrowStretch {
  /** Metres from the start of the path. */
  along: number
  from: LatLng
  to: LatLng
  meters: number
}

/** Runs of a path on roads too narrow for a bus, ignoring short connectors. */
export function narrowStretches(path: LatLng[], minMeters = 150): NarrowStretch[] {
  const stretches: NarrowStretch[] = []
  let along = 0
  let current: NarrowStretch | null = null
  for (let i = 1; i < path.length; i++) {
    const length = haversine(path[i - 1], path[i])
    const mid = { lat: (path[i - 1].lat + path[i].lat) / 2, lng: (path[i - 1].lng + path[i].lng) / 2 }
    const narrow = hasRoadData(mid) && roadLevelNear(mid) < 3
    if (narrow) {
      if (!current) current = { along, from: path[i - 1], to: path[i], meters: 0 }
      current.to = path[i]
      current.meters += length
    } else if (current) {
      if (current.meters >= minMeters) stretches.push(current)
      current = null
    }
    along += length
  }
  if (current && current.meters >= minMeters) stretches.push(current)
  return stretches
}

/**
 * Points along a route between a and b that keeps to wide roads where it can.
 * A* over the road grid, with narrow cells allowed only at a steep cost so short
 * gaps in the data can still be bridged. Used to steer the road router, which
 * knows nothing about vehicle size, away from lanes a bus can't use.
 */
export function wideRoadVias(a: LatLng, b: LatLng, spacingMeters = 500): LatLng[] | null {
  const startHit = nearestRoad(a, 3, 300)
  const goalHit = nearestRoad(b, 3, 300)
  if (!startHit || !goalHit) return null
  const g = grid()
  const start = cellOf(startHit.position)
  const goal = cellOf(goalHit.position)
  const startCell = start.r * road.cols + start.c
  const goalCell = goal.r * road.cols + goal.c
  if (startCell === goalCell) return []

  const heuristic = (cell: number) => Math.hypot(Math.floor(cell / road.cols) - goal.r, (cell % road.cols) - goal.c)
  const best = new Map<number, number>([[startCell, 0]])
  const parent = new Map<number, number>()

  // Binary heap of [priority, cell].
  const heap: [number, number][] = [[heuristic(startCell), startCell]]
  const push = (item: [number, number]) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const up = (i - 1) >> 1
      if (heap[up][0] <= heap[i][0]) break
      ;[heap[up], heap[i]] = [heap[i], heap[up]]
      i = up
    }
  }
  const pop = (): [number, number] => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let smallest = i
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l
        if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r
        if (smallest === i) break
        ;[heap[smallest], heap[i]] = [heap[i], heap[smallest]]
        i = smallest
      }
    }
    return top
  }

  let expanded = 0
  while (heap.length > 0 && expanded < 60000) {
    const [, cell] = pop()
    if (cell === goalCell) break
    expanded++
    const r = Math.floor(cell / road.cols)
    const c = cell % road.cols
    const here = best.get(cell) ?? Infinity
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((dr === 0 && dc === 0) || !inGrid(r + dr, c + dc)) continue
        const next = (r + dr) * road.cols + c + dc
        const level = g.levels[next]
        if (level < 2) continue
        const step = Math.hypot(dr, dc) * (level === 3 ? 1 : 10)
        if (here + step < (best.get(next) ?? Infinity)) {
          best.set(next, here + step)
          parent.set(next, cell)
          push([here + step + heuristic(next), next])
        }
      }
    }
  }
  if (!parent.has(goalCell)) return null

  const cells: number[] = [goalCell]
  while (cells[cells.length - 1] !== startCell) cells.push(parent.get(cells[cells.length - 1])!)
  cells.reverse()

  // A wildly longer route than the straight line means there's no sensible way round.
  if (cells.length * road.cellMeters > haversine(a, b) * 3 + 1500) return null

  const vias: LatLng[] = []
  const every = Math.max(1, Math.round(spacingMeters / road.cellMeters))
  for (let i = every; i < cells.length - every / 2; i += every) {
    const cell = cells[i]
    if (g.levels[cell] === 3) vias.push(cellPoint(Math.floor(cell / road.cols), cell % road.cols, g))
  }
  // Short gaps still need one point, or the router takes the same lane again.
  if (vias.length === 0 && cells.length >= 3) {
    const mid = cells[Math.floor(cells.length / 2)]
    if (g.levels[mid] === 3) vias.push(cellPoint(Math.floor(mid / road.cols), mid % road.cols, g))
  }
  return vias
}

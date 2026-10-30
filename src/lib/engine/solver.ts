// Fleet routing: which vehicle serves which stops, and in what order.
//
// A capacitated vehicle routing problem with a mixed fleet, a different start for
// each vehicle and a shared destination. It is solved with Large Neighbourhood
// Search: build a plan by regret insertion, then repeatedly tear out a few stops
// and re-insert them, keeping changes that lower the monthly cost. The random
// generator is seeded, so the same input always gives the same plan.
import { travelMeters } from '../distance'
import type { LatLng, StopAccess, VehicleType } from '../types'

export interface SolverStop {
  id: string
  position: LatLng
  load: number
  access: StopAccess
  /** The school pinned these riders to one vehicle. */
  fixedVehicleId: string | null
  /** Vehicle serving this stop today, so unnecessary changes can be discouraged. */
  previousVehicleId: string | null
  /** Sum of the riders' priority when seats run short; earlier requests weigh more. */
  priority: number
}

export interface SolverVehicle {
  id: string
  type: VehicleType
  seats: number
  start: LatLng
  /** Metres driven after school, when the vehicle ends elsewhere. */
  tailMeters: number
  /** Monthly cost of using this vehicle at all. */
  activation: number
  /** Monthly cost of each metre of route. */
  perMeter: number
  /** Metres per minute. */
  speed: number
}

export interface SolverOptions {
  school: LatLng
  dwellMin: number
  maxRideMin: number
  /** Monthly cost of one rider spending one more minute on the bus. */
  rideValue: number
  /** Extra monthly cost per rider-minute over the ride limit. */
  overLimitValue: number
  /** Monthly cost per priority point of leaving a stop without a seat. */
  unservedValue: number
  /** Monthly cost per rider of moving a stop to a different vehicle. */
  moveValue: number
  /** Monthly cost per rider of putting a child a bus could carry on a van, whose seats lanes depend on. */
  vanSeatValue: number
  iterations: number
  seed: number
  /** Current routes by vehicle, as stop ids. Search starts here, so small changes stay small. */
  initial?: Map<string, string[]>
}

export interface SolverResult {
  routes: Map<string, string[]>
  unserved: string[]
  objective: number
}

function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function solveRouting(stops: SolverStop[], vehicles: SolverVehicle[], options: SolverOptions): SolverResult {
  const n = stops.length
  const m = vehicles.length
  const random = mulberry32(options.seed)

  // Index layout: stops, then vehicle starts, then the school.
  const school = n + m
  const points = [...stops.map((s) => s.position), ...vehicles.map((v) => v.start), options.school]
  const size = points.length
  const D = new Float64Array(size * size)
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i !== j) D[i * size + j] = travelMeters(points[i], points[j])
    }
  }
  const dist = (a: number, b: number) => D[a * size + b]

  const routes: number[][] = vehicles.map(() => [])
  const loads = new Array<number>(m).fill(0)
  const costs = new Array<number>(m).fill(0)
  const unserved = new Set<number>()

  const canServe = (v: number, s: number) => {
    const stop = stops[s]
    const vehicle = vehicles[v]
    if (stop.fixedVehicleId && stop.fixedVehicleId !== vehicle.id) return false
    if (stop.access === 'van' && vehicle.type !== 'van') return false
    return loads[v] + stop.load <= vehicle.seats
  }

  const moveCost = (v: number, s: number) => {
    const previous = stops[s].previousVehicleId
    const moved = previous && previous !== vehicles[v].id ? stops[s].load * options.moveValue : 0
    const vanSeats = vehicles[v].type === 'van' && stops[s].access === 'bus' ? stops[s].load * options.vanSeatValue : 0
    return moved + vanSeats
  }

  /** Monthly cost of a vehicle running this sequence. */
  const sequenceCost = (v: number, seq: number[]): number => {
    if (seq.length === 0) return 0
    const vehicle = vehicles[v]
    let meters = dist(n + v, seq[0])
    for (let i = 1; i < seq.length; i++) meters += dist(seq[i - 1], seq[i])
    meters += dist(seq[seq.length - 1], school) + vehicle.tailMeters

    let cost = vehicle.activation + meters * vehicle.perMeter
    // Ride time is measured backwards from school: earlier stops ride longer.
    let minutes = 0
    let next = school
    for (let i = seq.length - 1; i >= 0; i--) {
      minutes += dist(seq[i], next) / vehicle.speed + options.dwellMin
      const load = stops[seq[i]].load
      cost += load * minutes * options.rideValue
      if (minutes > options.maxRideMin) cost += load * (minutes - options.maxRideMin) * options.overLimitValue
      next = seq[i]
    }
    return cost
  }

  const scratch: number[] = []
  const insertionCost = (v: number, s: number, position: number): number => {
    const route = routes[v]
    scratch.length = 0
    for (let i = 0; i < position; i++) scratch.push(route[i])
    scratch.push(s)
    for (let i = position; i < route.length; i++) scratch.push(route[i])
    return sequenceCost(v, scratch) - costs[v] + moveCost(v, s)
  }

  const total = () => {
    let sum = 0
    for (let v = 0; v < m; v++) sum += costs[v]
    for (const s of unserved) sum += stops[s].priority * options.unservedValue
    for (let v = 0; v < m; v++) for (const s of routes[v]) sum += moveCost(v, s)
    return sum
  }

  /** Regret-2 insertion: place first the stop that would lose most if its best option went away. */
  const insertAll = (pending: number[], noise: number) => {
    const queue = [...pending]
    while (queue.length > 0) {
      let chosen = -1
      let chosenVehicle = -1
      let chosenPosition = -1
      let bestRegret = -Infinity
      for (let q = 0; q < queue.length; q++) {
        const s = queue[q]
        let first = Infinity
        let second = Infinity
        let firstVehicle = -1
        let firstPosition = -1
        for (let v = 0; v < m; v++) {
          if (!canServe(v, s)) continue
          let cheapest = Infinity
          let cheapestPosition = -1
          for (let p = 0; p <= routes[v].length; p++) {
            const c = insertionCost(v, s, p)
            if (c < cheapest) {
              cheapest = c
              cheapestPosition = p
            }
          }
          if (noise > 0) cheapest *= 1 + (random() - 0.5) * noise
          if (cheapest < first) {
            second = first
            first = cheapest
            firstVehicle = v
            firstPosition = cheapestPosition
          } else if (cheapest < second) {
            second = cheapest
          }
        }
        if (firstVehicle < 0) continue
        const regret = (second === Infinity ? 1e9 : second - first) + stops[s].load
        if (regret > bestRegret) {
          bestRegret = regret
          chosen = q
          chosenVehicle = firstVehicle
          chosenPosition = firstPosition
        }
      }
      if (chosen < 0) {
        for (const s of queue) unserved.add(s)
        return
      }
      const s = queue[chosen]
      queue.splice(chosen, 1)
      routes[chosenVehicle].splice(chosenPosition, 0, s)
      loads[chosenVehicle] += stops[s].load
      costs[chosenVehicle] = sequenceCost(chosenVehicle, routes[chosenVehicle])
      unserved.delete(s)
    }
  }

  /** Reorders stops within a route with 2-opt and single-stop moves until nothing improves. */
  const polish = (v: number) => {
    let route = routes[v]
    let cost = costs[v]
    let improved = true
    let passes = 0
    while (improved && passes < 8) {
      improved = false
      passes++
      for (let i = 0; i < route.length - 1; i++) {
        for (let j = i + 1; j < route.length; j++) {
          const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)]
          const c = sequenceCost(v, candidate)
          if (c < cost - 1e-6) {
            route = candidate
            cost = c
            improved = true
          }
        }
      }
      for (let i = 0; i < route.length; i++) {
        for (let j = 0; j < route.length; j++) {
          if (i === j) continue
          const candidate = [...route]
          const [moved] = candidate.splice(i, 1)
          candidate.splice(j, 0, moved)
          const c = sequenceCost(v, candidate)
          if (c < cost - 1e-6) {
            route = candidate
            cost = c
            improved = true
          }
        }
      }
    }
    routes[v] = route
    costs[v] = cost
  }

  const removeStop = (v: number, index: number) => {
    const [s] = routes[v].splice(index, 1)
    loads[v] -= stops[s].load
    return s
  }

  // Which stops to tear out of the current plan.
  const pickRemovals = (count: number): number[] => {
    const served: [number, number][] = []
    for (let v = 0; v < m; v++) for (const s of routes[v]) served.push([v, s])
    if (served.length === 0) return []
    const removed = new Set<number>()
    const style = random()
    if (style < 0.45) {
      // Related: a stop and its nearest neighbours, so they can swap vehicles.
      const [, seed] = served[Math.floor(random() * served.length)]
      const nearest = served.map(([, s]) => s).sort((a, b) => dist(seed, a) - dist(seed, b))
      for (let i = 0; i < Math.min(count, nearest.length); i++) removed.add(nearest[i])
    } else if (style < 0.75) {
      // A contiguous piece of one route.
      const v = served[Math.floor(random() * served.length)][0]
      const start = Math.floor(random() * routes[v].length)
      for (let i = start; i < Math.min(routes[v].length, start + count); i++) removed.add(routes[v][i])
    } else if (style < 0.85) {
      // A whole route, which lets the search bench a vehicle.
      const v = served[Math.floor(random() * served.length)][0]
      for (const s of routes[v]) removed.add(s)
    } else {
      while (removed.size < Math.min(count, served.length)) removed.add(served[Math.floor(random() * served.length)][1])
    }
    return [...removed]
  }

  // Build the first plan, keeping whatever still fits from the current routes.
  const placed = new Set<number>()
  if (options.initial) {
    const indexById = new Map(stops.map((s, i) => [s.id, i]))
    vehicles.forEach((vehicle, v) => {
      for (const id of options.initial!.get(vehicle.id) ?? []) {
        const s = indexById.get(id)
        if (s === undefined || placed.has(s) || !canServe(v, s)) continue
        routes[v].push(s)
        loads[v] += stops[s].load
        placed.add(s)
      }
      costs[v] = sequenceCost(v, routes[v])
    })
  }
  insertAll(
    stops.map((_, i) => i).filter((i) => !placed.has(i)),
    0,
  )
  if (!options.initial) for (let v = 0; v < m; v++) polish(v)

  const snapshot = () => ({ routes: routes.map((r) => [...r]), loads: [...loads], costs: [...costs], unserved: new Set(unserved) })
  const restore = (saved: ReturnType<typeof snapshot>) => {
    for (let v = 0; v < m; v++) {
      routes[v] = [...saved.routes[v]]
      loads[v] = saved.loads[v]
      costs[v] = saved.costs[v]
    }
    unserved.clear()
    for (const s of saved.unserved) unserved.add(s)
  }

  let current = total()
  let best = snapshot()
  let bestCost = current
  const iterations = n < 2 ? 0 : options.iterations
  // From a warm start, only accept near-neutral moves so the plan doesn't wander off.
  let temperature = bestCost * (options.initial ? 0.0005 : 0.004)
  const cooling = iterations > 0 ? Math.pow(0.02, 1 / iterations) : 1

  let lastImproved = 0
  for (let it = 0; it < iterations; it++) {
    // Wandered too long without finding anything better: go back to the best plan and try from there.
    if (it - lastImproved > 250) {
      restore(best)
      current = bestCost
      lastImproved = it
    }
    const saved = snapshot()
    const count = 2 + Math.floor(random() * Math.min(9, Math.max(2, n / 3)))
    const removed = pickRemovals(count)
    const removedSet = new Set(removed)
    for (let v = 0; v < m; v++) {
      for (let i = routes[v].length - 1; i >= 0; i--) {
        if (removedSet.has(routes[v][i])) removeStop(v, i)
      }
      costs[v] = sequenceCost(v, routes[v])
    }
    insertAll([...removed, ...unserved], random() < 0.5 ? 0.15 : 0)
    const next = total()
    if (next < current || random() < Math.exp((current - next) / Math.max(temperature, 1e-6))) {
      current = next
      if (next < bestCost - 1e-6) {
        for (let v = 0; v < m; v++) polish(v)
        current = total()
        bestCost = current
        best = snapshot()
        lastImproved = it
      }
    } else {
      restore(saved)
    }
    temperature *= cooling
  }

  restore(best)
  for (let v = 0; v < m; v++) polish(v)

  const result = new Map<string, string[]>()
  vehicles.forEach((vehicle, v) => result.set(vehicle.id, routes[v].map((s) => stops[s].id)))
  return { routes: result, unserved: [...unserved].map((s) => stops[s].id), objective: total() }
}

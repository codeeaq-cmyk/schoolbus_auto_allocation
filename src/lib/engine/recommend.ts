// Looks for changes worth making and prices each one by actually planning it.
// Runs as a generator so the UI can yield between the expensive steps.
import { nextColorSlot } from '../colors'
import { nearestRoad } from '../roads'
import { formatDistance } from '../geo'
import type { AppState, Plan, Vehicle, VehicleType } from '../types'
import { measurePlan, type PlanMetrics } from './baseline'
import type { FleetEconomics } from './economics'
import { countMoved, monthlyCostPerMeter, optimise, seatCounts } from './plan'
import { VEHICLE_NAMES, VEHICLE_PRESETS } from './presets'

export type RecommendationAction =
  | { kind: 'apply-plan'; plan: Plan; summary: string }
  | { kind: 'add-vehicle'; vehicle: Vehicle }
  | { kind: 'bench-vehicle'; vehicleId: string }
  | { kind: 'swap-type'; vehicleId: string; type: VehicleType }
  | { kind: 'open-vehicle'; vehicleId: string }

export interface Recommendation {
  id: string
  title: string
  detail: string
  /** Monthly profit change, when the change was priced. */
  profitDelta: number | null
  seatedDelta: number | null
  kmDelta: number | null
  action: RecommendationAction | null
  actionLabel: string | null
}

const inrShort = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

const PRICED_ITERATIONS = 350

function priced(state: AppState, base: PlanMetrics, change: (s: AppState) => AppState, recluster = false) {
  const next = change(state)
  const plan = optimise(next, { iterations: PRICED_ITERATIONS, recluster, stability: true })
  const metrics = measurePlan({ ...next, plan })
  return {
    plan,
    metrics,
    profitDelta: metrics.profit - base.profit,
    seatedDelta: metrics.seated - base.seated,
    kmDelta: metrics.kmDaily - base.kmDaily,
  }
}

function nextLabel(state: AppState, type: VehicleType): string {
  const prefix = VEHICLE_NAMES[type]
  let n = state.vehicles.filter((v) => v.type === type).length + 1
  const taken = new Set(state.vehicles.map((v) => v.label))
  while (taken.has(`${prefix} ${String(n).padStart(2, '0')}`)) n++
  return `${prefix} ${String(n).padStart(2, '0')}`
}

/** A new vehicle with sample costs. */
export function draftVehicle(state: AppState, type: VehicleType, start: Vehicle['start']): Vehicle {
  return {
    id: `veh-new-${type}-${state.vehicles.length + 1}`,
    label: nextLabel(state, type),
    plate: '',
    type,
    driverName: 'To be assigned',
    driverPhone: '',
    colorSlot: nextColorSlot(state.vehicles.map((v) => v.colorSlot)),
    start,
    end: null,
    enabled: true,
    ...VEHICLE_PRESETS[type],
  }
}

export function* recommendationSteps(state: AppState, fleet: FleetEconomics): Generator<Recommendation | null> {
  const { settings, plan } = state
  const base = measurePlan(state)
  const seatsTaken = seatCounts(plan)
  /** A saving only counts if nobody's longest ride gets worse than today or breaks the limit. */
  const keepsRidesFair = (metrics: PlanMetrics) => metrics.rideMax <= Math.max(settings.maxRideMin, base.rideMax)

  // 1. Would a fresh plan beat the one that has built up over time?
  const fresh = optimise(state, { recluster: true, stability: false, iterations: 1500 })
  const freshMetrics = measurePlan({ ...state, plan: fresh })
  const freshGain = freshMetrics.profit - base.profit
  const freshSeats = freshMetrics.seated - base.seated
  if (freshGain > 500 || freshSeats > 0) {
    const moved = countMoved(plan, fresh)
    yield {
      id: 'reoptimise',
      title: 'Re-optimise every route',
      detail: `A fresh plan changes the vehicle or boarding point for ${moved} ${moved === 1 ? 'child' : 'children'}. Parents see the new times straight away.`,
      profitDelta: freshGain,
      seatedDelta: freshSeats,
      kmDelta: freshMetrics.kmDaily - base.kmDaily,
      action: { kind: 'apply-plan', plan: fresh, summary: `Re-optimised all routes: ${moved} children moved` },
      actionLabel: 'Apply new plan',
    }
  } else {
    yield null
  }

  // 2. Children waiting for a seat: which extra vehicle pays for itself?
  const waiting = state.students.filter((s) => plan.waitlist[s.id] === 'seats-full' || plan.waitlist[s.id] === 'no-van' || plan.waitlist[s.id] === 'no-route')
  if (waiting.length > 0) {
    const centre = {
      lat: waiting.reduce((sum, s) => sum + s.home.lat, 0) / waiting.length,
      lng: waiting.reduce((sum, s) => sum + s.home.lng, 0) / waiting.length,
    }
    let best: { vehicle: Vehicle; result: ReturnType<typeof priced> } | null = null
    for (const type of ['van', 'bus'] as const) {
      const road = nearestRoad(centre, type === 'bus' ? 3 : 2, 3000)
      if (!road) continue
      const vehicle = draftVehicle(state, type, { name: 'Near the waiting families', position: road.position })
      const result = priced(state, base, (s) => ({ ...s, vehicles: [...s.vehicles, vehicle] }))
      if (result.seatedDelta > 0 && (!best || result.profitDelta > best.result.profitDelta)) best = { vehicle, result }
      yield null
    }
    if (best) {
      yield {
        id: 'add-vehicle',
        title: `Add a ${VEHICLE_NAMES[best.vehicle.type].toLowerCase()} for the waitlist`,
        detail: `Seats ${best.result.seatedDelta} waiting ${best.result.seatedDelta === 1 ? 'child' : 'children'}. Priced with sample costs for a ${best.vehicle.seats}-seat ${VEHICLE_NAMES[best.vehicle.type].toLowerCase()}, starting near them.`,
        profitDelta: best.result.profitDelta,
        seatedDelta: best.result.seatedDelta,
        kmDelta: best.result.kmDelta,
        action: { kind: 'add-vehicle', vehicle: best.vehicle },
        actionLabel: `Add ${VEHICLE_NAMES[best.vehicle.type].toLowerCase()}`,
      }
    }
  }

  // 3. Is any vehicle paying less than it costs?
  for (const v of fleet.vehicles) {
    if (!v.active || !v.route) continue
    const { vehicle, route } = v

    // Could the rest of the fleet carry everyone without it?
    const riders = seatsTaken.get(vehicle.id) ?? 0
    const others = fleet.vehicles.filter((o) => o.vehicle.id !== vehicle.id && o.vehicle.enabled)
    const room = others.reduce((sum, o) => sum + o.vehicle.seats - o.riders, 0)
    if (room >= riders) {
      const result = priced(state, base, (s) => ({ ...s, vehicles: s.vehicles.map((x) => (x.id === vehicle.id ? { ...x, enabled: false } : x)) }))
      yield null
      if (result.seatedDelta >= 0 && result.profitDelta > 1000 && keepsRidesFair(result.metrics)) {
        yield {
          id: `bench-${vehicle.id}`,
          title: `Bench ${vehicle.label}`,
          detail: `The rest of the fleet can carry its ${riders} riders. Saves crew pay and running costs; its insurance and tax still count.`,
          profitDelta: result.profitDelta,
          seatedDelta: result.seatedDelta,
          kmDelta: result.kmDelta,
          action: { kind: 'bench-vehicle', vehicleId: vehicle.id },
          actionLabel: 'Bench it',
        }
        continue
      }
    }

    // A half-empty bus on wide roads could be a van.
    if (vehicle.type === 'bus' && riders <= VEHICLE_PRESETS.van.seats) {
      const result = priced(state, base, (s) => ({
        ...s,
        vehicles: s.vehicles.map((x) => (x.id === vehicle.id ? { ...x, type: 'van', ...VEHICLE_PRESETS.van } : x)),
      }))
      yield null
      if (result.seatedDelta >= 0 && result.profitDelta > 1000 && keepsRidesFair(result.metrics)) {
        yield {
          id: `swap-${vehicle.id}`,
          title: `Run ${vehicle.label} as a van`,
          detail: `It carries only ${riders} children, which fits a ${VEHICLE_PRESETS.van.seats}-seat van that uses far less fuel.`,
          profitDelta: result.profitDelta,
          seatedDelta: result.seatedDelta,
          kmDelta: result.kmDelta,
          action: { kind: 'swap-type', vehicleId: vehicle.id, type: 'van' },
          actionLabel: 'Switch to van',
        }
        continue
      }
    }

    // Driving empty before the first pickup costs money for nothing.
    const first = route.stops[0]
    if (first) {
      const emptyMeters = first.along * (route.metersToSchool / Math.max(route.schoolAlong, 1))
      if (emptyMeters > 3000) {
        const saving = emptyMeters * monthlyCostPerMeter(vehicle, settings)
        yield {
          id: `start-${vehicle.id}`,
          title: `Park ${vehicle.label} nearer its first stop`,
          detail: `It drives ${formatDistance(emptyMeters)} empty from ${vehicle.start.name} to ${first.stop.name}, morning and evening. Move its starting point in the fleet settings if you can.`,
          profitDelta: saving,
          seatedDelta: null,
          kmDelta: -(emptyMeters * 2) / 1000,
          action: { kind: 'open-vehicle', vehicleId: vehicle.id },
          actionLabel: 'Open vehicle',
        }
      }
    }

    if (v.profit < -500 && v.riders > 0) {
      const perRider = Math.ceil(-v.profit / v.riders / 50) * 50
      yield {
        id: `fee-${vehicle.id}`,
        title: `${vehicle.label} runs at a loss`,
        detail: `It loses ${inrShort(-v.profit)} a month. ${v.breakEvenRiders && v.breakEvenRiders <= vehicle.seats ? `It breaks even with ${v.breakEvenRiders} riders` : 'Its seats cannot cover its costs at current fees'}, or with ${inrShort(perRider)} more per rider.`,
        profitDelta: null,
        seatedDelta: null,
        kmDelta: null,
        action: { kind: 'open-vehicle', vehicleId: vehicle.id },
        actionLabel: 'Open vehicle',
      }
    }

    if (route.rideMax > settings.maxRideMin) {
      yield {
        id: `ride-${vehicle.id}`,
        title: `${vehicle.label} breaks the ride limit`,
        detail: `Its first child rides ${Math.round(route.rideMax)} minutes against your ${settings.maxRideMin}-minute limit. Another vehicle, or a start point closer to school, would shorten it.`,
        profitDelta: null,
        seatedDelta: null,
        kmDelta: null,
        action: { kind: 'open-vehicle', vehicleId: vehicle.id },
        actionLabel: 'Open vehicle',
      }
    }

    if (route.narrowMeters > 300) {
      yield {
        id: `narrow-${vehicle.id}`,
        title: `Check ${vehicle.label}'s route on the ground`,
        detail: `${formatDistance(route.narrowMeters)} of it uses roads mapped as narrow, because no wide road links those points. Road widths are estimated from map data.`,
        profitDelta: null,
        seatedDelta: null,
        kmDelta: null,
        action: { kind: 'open-vehicle', vehicleId: vehicle.id },
        actionLabel: 'Open vehicle',
      }
    }
  }
}

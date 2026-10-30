// Answers "why automatic?": the same fleet and children planned the way a person
// typically would, measured with the same distance model as the automatic plan.
import { travelMeters } from '../distance'
import { haversine } from '../geo'
import { hasRoadData, nearestRoad } from '../roads'
import type { AppState, LatLng, Student, Vehicle } from '../types'
import type { FleetEconomics } from './economics'
import { metersPerMinute } from './plan'
import { feeForStop } from './view'

export interface PlanMetrics {
  vehiclesUsed: number
  stops: number
  seated: number
  kmDaily: number
  litresMonthly: number
  fuelCost: number
  cost: number
  revenue: number
  profit: number
  rideAvg: number
  rideMax: number
  walkAvg: number
}

interface EstimatedRoute {
  vehicle: Vehicle
  stops: { position: LatLng; riders: Student[] }[]
}

function measure(state: AppState, routes: EstimatedRoute[]): PlanMetrics {
  const { settings } = state
  let kmDaily = 0
  let litres = 0
  let fuelCost = 0
  let cost = 0
  let revenue = 0
  let seated = 0
  let rideTotal = 0
  let rideMax = 0
  let walkTotal = 0
  let vehiclesUsed = 0
  let stops = 0

  const used = new Set<string>()
  for (const { vehicle, stops: list } of routes) {
    const riders = list.reduce((sum, s) => sum + s.riders.length, 0)
    if (riders === 0) continue
    used.add(vehicle.id)
    vehiclesUsed++
    stops += list.length

    let meters = travelMeters(vehicle.start.position, list[0].position)
    for (let i = 1; i < list.length; i++) meters += travelMeters(list[i - 1].position, list[i].position)
    meters += travelMeters(list[list.length - 1].position, settings.location)
    if (vehicle.end) meters += travelMeters(settings.location, vehicle.end.position)

    const km = (meters * 2) / 1000
    const monthly = km * settings.schoolDays
    const vehicleLitres = monthly / vehicle.kmPerLitre
    kmDaily += km
    litres += vehicleLitres
    fuelCost += vehicleLitres * settings.dieselPrice
    cost += vehicleLitres * settings.dieselPrice + monthly * vehicle.maintenancePerKm + vehicle.crewMonthly

    const speed = metersPerMinute(vehicle, settings)
    const dwell = settings.dwellSec / 60
    let minutes = 0
    let next = settings.location
    for (let i = list.length - 1; i >= 0; i--) {
      minutes += travelMeters(list[i].position, next) / speed + dwell
      next = list[i].position
      for (const rider of list[i].riders) {
        seated++
        revenue += rider.feeOverride ?? feeForStop(list[i].position, settings)
        rideTotal += minutes
        rideMax = Math.max(rideMax, minutes)
        walkTotal += haversine(rider.home, list[i].position)
      }
    }
  }
  for (const vehicle of state.vehicles) cost += vehicle.standingMonthly

  return {
    vehiclesUsed,
    stops,
    seated,
    kmDaily,
    litresMonthly: litres,
    fuelCost,
    cost,
    revenue,
    profit: revenue - cost,
    rideAvg: seated > 0 ? rideTotal / seated : 0,
    rideMax,
    walkAvg: seated > 0 ? walkTotal / seated : 0,
  }
}

/** The current plan, measured with estimated distances so it compares fairly with the baseline. */
export function measurePlan(state: AppState): PlanMetrics {
  const stopsById = new Map(state.plan.stops.map((s) => [s.id, s]))
  const riders = new Map<string, Student[]>()
  for (const student of state.students) {
    const seat = state.plan.seats[student.id]
    if (!seat) continue
    const key = `${seat.vehicleId}|${seat.stopId}`
    if (!riders.has(key)) riders.set(key, [])
    riders.get(key)!.push(student)
  }
  const routes: EstimatedRoute[] = []
  for (const route of state.plan.routes) {
    const vehicle = state.vehicles.find((v) => v.id === route.vehicleId)
    if (!vehicle) continue
    const stops = route.stopIds
      .map((id) => stopsById.get(id))
      .filter((s) => !!s)
      .map((s) => ({ position: s!.position, riders: riders.get(`${vehicle.id}|${s!.id}`) ?? [] }))
    routes.push({ vehicle, stops })
  }
  return measure(state, routes)
}

/**
 * A typical hand-made plan, the way a transport in-charge works: a stop at the main
 * road near each home (or the lane, if no main road is in reach), stops within walking
 * distance merged, the map split into areas by direction from school, each vehicle filled
 * area by area, and each route driven from the farthest child inward. It respects
 * the same seats and road limits as the automatic plan, so the comparison is fair.
 */
export function manualBaseline(state: AppState): PlanMetrics {
  const { settings } = state
  const school = settings.location
  const bearing = (p: LatLng) => Math.atan2(p.lng - school.lng, p.lat - school.lat)
  const fleet = state.vehicles.filter((v) => v.enabled)

  type ManualStop = { position: LatLng; narrow: boolean; riders: Student[] }
  const stops: ManualStop[] = []
  const students = [...state.students].sort((a, b) => a.registeredAt - b.registeredAt)
  for (const student of students) {
    if (!hasRoadData(student.home)) continue
    const road = nearestRoad(student.home, 3, settings.maxWalkMeters) ?? nearestRoad(student.home, 2, settings.maxWalkMeters)
    if (!road) continue
    const narrow = road.level < 3
    const nearby = stops.find((s) => s.narrow === narrow && haversine(s.position, road.position) <= settings.maxWalkMeters)
    if (nearby) nearby.riders.push(student)
    else stops.push({ position: road.position, narrow, riders: [student] })
  }

  // Fill vehicles area by area, going round the school by direction.
  const seatsLeft = new Map(fleet.map((v) => [v.id, v.seats]))
  const assigned = new Map<string, ManualStop[]>(fleet.map((v) => [v.id, []]))
  const byBearing = (a: { position: LatLng }, b: { position: LatLng }) => bearing(a.position) - bearing(b.position)
  const place = (group: ManualStop[], vehicles: Vehicle[]) => {
    let index = 0
    for (const stop of group) {
      let riders = [...stop.riders]
      while (riders.length > 0 && index < vehicles.length) {
        const vehicle = vehicles[index]
        const room = seatsLeft.get(vehicle.id) ?? 0
        if (room === 0) {
          index++
          continue
        }
        const taking = riders.slice(0, room)
        assigned.get(vehicle.id)!.push({ ...stop, riders: taking })
        seatsLeft.set(vehicle.id, room - taking.length)
        riders = riders.slice(room)
      }
    }
  }
  const startBearing = (a: Vehicle, b: Vehicle) => bearing(a.start.position) - bearing(b.start.position)
  place(stops.filter((s) => s.narrow).sort(byBearing), fleet.filter((v) => v.type === 'van').sort(startBearing))
  place(stops.filter((s) => !s.narrow).sort(byBearing), [...fleet].sort(startBearing))

  const routes: EstimatedRoute[] = fleet.map((vehicle) => ({
    vehicle,
    stops: [...assigned.get(vehicle.id)!].sort((a, b) => travelMeters(b.position, school) - travelMeters(a.position, school)),
  }))
  return measure(state, routes)
}

export interface Savings {
  manual: PlanMetrics
  automatic: PlanMetrics
  kmDaily: number
  litresMonthly: number
  fuelCost: number
  cost: number
  profit: number
  co2Kg: number
}

/** Compares against the live figures, so these numbers match every other screen. */
export function compareWithManual(state: AppState, fleet: FleetEconomics): Savings {
  const manual = manualBaseline(state)
  const automatic: PlanMetrics = {
    vehiclesUsed: fleet.activeVehicles,
    stops: fleet.stops,
    seated: fleet.seated,
    kmDaily: fleet.kmDaily,
    litresMonthly: fleet.litres,
    fuelCost: fleet.fuel,
    cost: fleet.cost,
    revenue: fleet.revenue,
    profit: fleet.profit,
    rideAvg: fleet.rideAvg,
    rideMax: fleet.rideMax,
    walkAvg: fleet.walkAvg,
  }
  const litresMonthly = manual.litresMonthly - automatic.litresMonthly
  return {
    manual,
    automatic,
    kmDaily: manual.kmDaily - automatic.kmDaily,
    litresMonthly,
    fuelCost: manual.fuelCost - automatic.fuelCost,
    cost: manual.cost - automatic.cost,
    profit: automatic.profit - manual.profit,
    co2Kg: litresMonthly * 2.68,
  }
}

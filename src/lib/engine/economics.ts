// Monthly money and fuel for the plan. Closed-form, so what-if scenarios are instant.
import type { AppState, Settings, Vehicle } from '../types'
import type { PlanView, RouteView } from './view'

/** Kilograms of CO2 from burning one litre of diesel. */
const CO2_PER_LITRE = 2.68

export interface VehicleEconomics {
  vehicle: Vehicle
  route: RouteView | undefined
  active: boolean
  riders: number
  occupancy: number
  revenue: number
  fuel: number
  maintenance: number
  crew: number
  standing: number
  cost: number
  profit: number
  kmDaily: number
  kmMonthly: number
  litres: number
  costPerRider: number
  /** Riders needed to cover this vehicle's costs at its current average fee. */
  breakEvenRiders: number | null
}

export interface FleetEconomics {
  vehicles: VehicleEconomics[]
  revenue: number
  fuel: number
  maintenance: number
  crew: number
  standing: number
  cost: number
  profit: number
  margin: number
  kmDaily: number
  kmMonthly: number
  litres: number
  co2Kg: number
  seats: number
  seated: number
  waitlisted: number
  /** Fees the school would collect if every waiting child had a seat. */
  unrealisedRevenue: number
  costPerRider: number
  rideAvg: number
  rideMax: number
  walkAvg: number
  activeVehicles: number
  stops: number
  /** Minutes behind the wheel per day across the fleet, both trips. */
  driveMinutesDaily: number
}

export interface Scenario {
  dieselPrice: number
  /** Fee change, e.g. 0.05 for +5%. */
  feeChange: number
  /** Crew pay change. */
  crewChange: number
}

export function vehicleEconomics(vehicle: Vehicle, route: RouteView | undefined, view: PlanView, settings: Settings, scenario?: Scenario): VehicleEconomics {
  const diesel = scenario?.dieselPrice ?? settings.dieselPrice
  const riders = route?.riders ?? 0
  const active = riders > 0
  const kmDaily = active && route ? (route.metersTotal * 2) / 1000 : 0
  const kmMonthly = kmDaily * settings.schoolDays
  const litres = kmMonthly / vehicle.kmPerLitre
  const fuel = litres * diesel
  const maintenance = kmMonthly * vehicle.maintenancePerKm
  const crew = active ? vehicle.crewMonthly * (1 + (scenario?.crewChange ?? 0)) : 0
  const standing = vehicle.standingMonthly

  let revenue = 0
  if (route) {
    for (const stop of route.stops) {
      for (const rider of stop.riders) {
        const student = view.students.get(rider.id)
        if (student) revenue += student.fee * (1 + (scenario?.feeChange ?? 0))
      }
    }
  }
  const cost = fuel + maintenance + crew + standing
  const averageFee = riders > 0 ? revenue / riders : 0
  return {
    vehicle,
    route,
    active,
    riders,
    occupancy: vehicle.seats > 0 ? riders / vehicle.seats : 0,
    revenue,
    fuel,
    maintenance,
    crew,
    standing,
    cost,
    profit: revenue - cost,
    kmDaily,
    kmMonthly,
    litres,
    costPerRider: riders > 0 ? cost / riders : 0,
    breakEvenRiders: averageFee > 0 ? Math.ceil(cost / averageFee) : null,
  }
}

export function fleetEconomics(state: AppState, view: PlanView, scenario?: Scenario): FleetEconomics {
  const { settings } = state
  const vehicles = state.vehicles.map((v) => vehicleEconomics(v, view.routes.get(v.id), view, settings, scenario))

  const sum = (pick: (v: VehicleEconomics) => number) => vehicles.reduce((total, v) => total + pick(v), 0)
  const revenue = sum((v) => v.revenue)
  const cost = sum((v) => v.cost)
  const litres = sum((v) => v.litres)

  let seated = 0
  let waitlisted = 0
  let unrealisedRevenue = 0
  let walkTotal = 0
  let rideTotal = 0
  let rideMax = 0
  for (const student of view.students.values()) {
    if (student.status === 'seated') {
      seated++
      walkTotal += student.walkMeters
      rideTotal += student.rideMin
      rideMax = Math.max(rideMax, student.rideMin)
    } else {
      waitlisted++
      unrealisedRevenue += student.fee
    }
  }

  let driveMinutesDaily = 0
  for (const v of vehicles) {
    if (!v.active || !v.route) continue
    const speed = ((v.vehicle.type === 'bus' ? settings.speedBusKmh : settings.speedVanKmh) * 1000) / 60
    driveMinutesDaily += (v.route.metersTotal * 2) / speed
  }

  return {
    vehicles,
    revenue,
    fuel: sum((v) => v.fuel),
    maintenance: sum((v) => v.maintenance),
    crew: sum((v) => v.crew),
    standing: sum((v) => v.standing),
    cost,
    profit: revenue - cost,
    margin: revenue > 0 ? (revenue - cost) / revenue : 0,
    kmDaily: sum((v) => v.kmDaily),
    kmMonthly: sum((v) => v.kmMonthly),
    litres,
    co2Kg: litres * CO2_PER_LITRE,
    seats: vehicles.filter((v) => v.vehicle.enabled).reduce((total, v) => total + v.vehicle.seats, 0),
    seated,
    waitlisted,
    unrealisedRevenue,
    costPerRider: seated > 0 ? cost / seated : 0,
    rideAvg: seated > 0 ? rideTotal / seated : 0,
    rideMax,
    walkAvg: seated > 0 ? walkTotal / seated : 0,
    activeVehicles: vehicles.filter((v) => v.active).length,
    stops: state.plan.stops.filter((s) => Object.values(state.plan.seats).some((seat) => seat.stopId === s.id)).length,
    driveMinutesDaily,
  }
}

/** Monthly fee revenue per slab. */
export function revenueBySlab(state: AppState, view: PlanView) {
  const slabs = state.settings.feeSlabs.map((slab) => ({ slab, riders: 0, revenue: 0 }))
  for (const student of view.students.values()) {
    if (student.status !== 'seated') continue
    const match = slabs.find((s) => s.slab.monthly === student.fee)
    if (match) {
      match.riders++
      match.revenue += student.fee
    }
  }
  return slabs
}

/** Diesel price at which the fleet stops making money, with everything else unchanged. */
export function breakEvenDiesel(fleet: FleetEconomics): number | null {
  if (fleet.litres <= 0) return null
  return (fleet.revenue - fleet.maintenance - fleet.crew - fleet.standing) / fleet.litres
}

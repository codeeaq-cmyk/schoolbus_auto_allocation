import type { Vehicle, VehicleType } from '../types'

export type VehicleCosts = Pick<Vehicle, 'seats' | 'kmPerLitre' | 'maintenancePerKm' | 'crewMonthly' | 'standingMonthly'>

/** Sample figures for a new vehicle. Schools should replace them with their own. */
export const VEHICLE_PRESETS: Record<VehicleType, VehicleCosts> = {
  bus: { seats: 40, kmPerLitre: 5.5, maintenancePerKm: 5, crewMonthly: 25000, standingMonthly: 10000 },
  van: { seats: 14, kmPerLitre: 12, maintenancePerKm: 2.5, crewMonthly: 15000, standingMonthly: 3500 },
}

export const VEHICLE_NAMES: Record<VehicleType, string> = { bus: 'Bus', van: 'Van' }

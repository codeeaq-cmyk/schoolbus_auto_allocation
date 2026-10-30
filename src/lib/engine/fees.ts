import { travelMeters } from '../distance'
import type { FeeSlab, LatLng, Settings } from '../types'

/** Monthly fee for a distance. Slabs are ordered; the last one has no upper limit. */
export function feeForKm(km: number, slabs: FeeSlab[]): number {
  for (const slab of slabs) {
    if (slab.upToKm === null || km <= slab.upToKm) return slab.monthly
  }
  return slabs[slabs.length - 1]?.monthly ?? 0
}

/** Fees depend on how far the boarding point is from school, not on the vehicle's route. */
export function feeForStop(position: LatLng, settings: Settings): number {
  return feeForKm(travelMeters(position, settings.location) / 1000, settings.feeSlabs)
}

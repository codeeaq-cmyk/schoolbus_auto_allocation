// Plain-language reasons for automatic decisions, shown to parents and the school.
import { formatDistance } from '../geo'
import { roadLevelNear } from '../roads'
import type { RoadLevel, Settings, WaitReason } from '../types'
import type { StudentView } from './view'

export function roadDescription(level: RoadLevel): string {
  if (level >= 3) return 'Main road: buses and vans fit'
  if (level === 2) return 'Narrow lane: only a van fits'
  return 'No road for vehicles here'
}

export function waitReasonText(reason: WaitReason, settings: Settings): string {
  switch (reason) {
    case 'seats-full':
      return 'Every vehicle that can reach this area is full. The child is seated automatically when a seat opens.'
    case 'no-van':
      return 'This lane is too narrow for a bus and no van has a free seat. The child is seated automatically when one does.'
    case 'no-road':
      return `No road a vehicle can use is within ${formatDistance(settings.maxWalkMeters)} on foot. The school can add a boarding point by hand.`
    case 'too-far':
      return `Even a direct ride from here would take longer than the ${settings.maxRideMin}-minute limit.`
  }
}

/** Why the system chose this boarding point and vehicle. */
export function explainSeat(student: StudentView): string[] {
  if (student.status !== 'seated') return []
  const reasons: string[] = []
  const level = roadLevelNear(student.student.home)
  const walk = formatDistance(student.walkMeters)
  if (student.stop.access === 'van') {
    reasons.push(`No main road is close enough to walk to, so a van comes into the lane. It's a ${walk} walk from home.`)
  } else if (level < 3) {
    reasons.push(`Home is on a narrow lane, so the stop is on the main road a ${walk} walk away, where a bus or van can pull in.`)
  } else {
    reasons.push(`Home is on a road vehicles can use, and this stop is the closest shared one, ${walk} away.`)
  }
  if (student.student.pinnedStopId) reasons.push('The boarding point was chosen by hand.')
  if (student.student.pinnedVehicleId) reasons.push(`${student.vehicle.label} was chosen by hand.`)
  else reasons.push(`${student.vehicle.label} is the most economical vehicle with a free seat passing this stop.`)
  return reasons
}

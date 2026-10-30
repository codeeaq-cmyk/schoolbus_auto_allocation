import { describe, expect, it } from 'vitest'
import { createSeedState } from '../../store/state'
import {
  addManualStop,
  addStudent,
  addVehicle,
  clearOverrides,
  countOverrides,
  moveStopInRoute,
  pinStopVehicle,
  pinStudentStop,
  pinStudentVehicle,
  removeStudent,
  removeVehicle,
  reoptimise,
  setRouteLocked,
  setStopAccess,
  updateSettings,
  updateVehicle,
} from '../../store/actions'
import { haversine } from '../geo'
import type { AppState, Student } from '../types'
import { compareWithManual } from './baseline'
import { breakEvenDiesel, fleetEconomics } from './economics'
import { canReach, countMoved, optimise, placeStudent, seatCounts } from './plan'
import { VEHICLE_PRESETS } from './presets'
import { buildPlanView, feeForKm, liveVehicle } from './view'

const seed = () => createSeedState(1_700_000_000_000)

/** Rules that must hold for any plan the engine ever produces. */
function expectValidPlan(state: AppState) {
  const { plan, vehicles, students } = state
  const stops = new Map(plan.stops.map((s) => [s.id, s]))

  // No vehicle is ever over its seats.
  const counts = seatCounts(plan)
  for (const vehicle of vehicles) expect(counts.get(vehicle.id) ?? 0, `${vehicle.label} seats`).toBeLessThanOrEqual(vehicle.seats)

  // Buses never go to van-only stops.
  for (const route of plan.routes) {
    const vehicle = vehicles.find((v) => v.id === route.vehicleId)
    expect(vehicle, 'route has a vehicle').toBeDefined()
    expect(vehicle!.enabled, `${vehicle!.label} enabled`).toBe(true)
    for (const id of route.stopIds) {
      expect(stops.has(id), 'route stop exists').toBe(true)
      expect(canReach(vehicle!, stops.get(id)!), `${vehicle!.label} can reach ${stops.get(id)!.name}`).toBe(true)
    }
  }

  // Every child is either seated on a route that visits their stop, or waitlisted. Never both or neither.
  for (const student of students) {
    const seat = plan.seats[student.id]
    const waiting = plan.waitlist[student.id]
    expect(!!seat !== !!waiting, `${student.name} is seated xor waitlisted`).toBe(true)
    if (seat) {
      const route = plan.routes.find((r) => r.vehicleId === seat.vehicleId)
      expect(route?.stopIds, `${student.name}'s route visits their stop`).toContain(seat.stopId)
    }
  }
}

const newChild = (overrides: Partial<Student> = {}): Student => ({
  id: 'test-child',
  name: 'Test Child',
  grade: 'Grade 1',
  parentId: 'parent-demo',
  parentName: 'Test Parent',
  parentPhone: '+91 90000 00000',
  home: { lat: 8.5327, lng: 76.9438 },
  address: 'Kesavadasapuram',
  registeredAt: 1_700_000_100_000,
  pinnedVehicleId: null,
  pinnedStopId: null,
  feeOverride: null,
  ...overrides,
})

describe('seed plan', () => {
  it('is valid and seats nearly everyone', () => {
    const state = seed()
    expectValidPlan(state)
    expect(Object.keys(state.plan.seats).length).toBeGreaterThan(130)
  })

  it('uses buses and vans, and has stops only a van can reach', () => {
    const state = seed()
    expect(state.plan.stops.some((s) => s.access === 'van')).toBe(true)
    expect(state.vehicles.some((v) => v.type === 'bus')).toBe(true)
    expect(state.vehicles.some((v) => v.type === 'van')).toBe(true)
  })

  it('keeps every seated child within the walking limit', () => {
    const state = seed()
    const view = buildPlanView(state)
    for (const student of view.students.values()) {
      if (student.status === 'seated') expect(student.walkMeters).toBeLessThanOrEqual(state.settings.maxWalkMeters + 1)
    }
  })

  it('beats a plan made by hand on distance and profit', () => {
    const state = seed()
    const savings = compareWithManual(state, fleetEconomics(state, buildPlanView(state)))
    expect(savings.kmDaily).toBeGreaterThan(0)
    expect(savings.profit).toBeGreaterThan(0)
  })
})

describe('determinism', () => {
  it('gives the same plan for the same input', () => {
    const state = seed()
    const a = optimise(state, { recluster: true, stability: false, iterations: 200 })
    const b = optimise(state, { recluster: true, stability: false, iterations: 200 })
    expect({ ...a, optimisedAt: 0 }).toEqual({ ...b, optimisedAt: 0 })
  })
})

describe('new requests', () => {
  it('seats a child near an existing route without moving anyone else', () => {
    const state = seed()
    const before = state.plan.seats
    const next = addStudent(state, newChild())
    expectValidPlan(next)
    expect(next.plan.seats['test-child']).toBeDefined()
    for (const [id, seat] of Object.entries(before)) expect(next.plan.seats[id]).toEqual(seat)
  })

  it('previews without changing the real plan', () => {
    const state = seed()
    const snapshot = JSON.stringify(state.plan)
    placeStudent({ ...state, students: [...state.students, newChild()] }, newChild())
    expect(JSON.stringify(state.plan)).toBe(snapshot)
  })

  it('waitlists a home beyond the road data as too far', () => {
    const next = addStudent(seed(), newChild({ home: { lat: 9.5, lng: 76.5 } }))
    expect(next.plan.waitlist['test-child']).toBe('too-far')
    expectValidPlan(next)
  })

  it('seats a waiting child when someone else leaves', () => {
    // A full, single small van makes the second child wait.
    const base = seed()
    const van = base.vehicles.find((v) => v.type === 'van')!
    const onlyVan: AppState = { ...base, vehicles: [{ ...van, seats: 1 }], students: [], paths: {}, plan: { stops: [], routes: [{ vehicleId: van.id, stopIds: [], locked: false }], seats: {}, waitlist: {}, blocked: [], optimisedAt: 0 } }
    const first = addStudent(onlyVan, newChild({ id: 'a', registeredAt: 1 }))
    const second = addStudent(first, newChild({ id: 'b', registeredAt: 2 }))
    expect(second.plan.seats.a).toBeDefined()
    expect(second.plan.waitlist.b).toBeDefined()
    const after = removeStudent(second, 'a')
    expect(after.plan.seats.b).toBeDefined()
    expectValidPlan(after)
  })
})

describe('fleet changes', () => {
  it('re-plans when a vehicle is removed, and stays valid', () => {
    const state = seed()
    const next = removeVehicle(state, state.vehicles[0].id)
    expectValidPlan(next)
    expect(next.plan.routes.some((r) => r.vehicleId === state.vehicles[0].id)).toBe(false)
  })

  it('never overfills when seats are cut', () => {
    const state = seed()
    const next = updateVehicle(state, state.vehicles[0].id, { seats: 5 })
    expectValidPlan(next)
    expect(seatCounts(next.plan).get(state.vehicles[0].id) ?? 0).toBeLessThanOrEqual(5)
  })

  it('moves few children when one seat is removed', () => {
    const state = seed()
    const bus = state.vehicles.find((v) => v.type === 'bus')!
    const next = updateVehicle(state, bus.id, { seats: bus.seats - 1 })
    expectValidPlan(next)
    expect(countMoved(state.plan, next.plan)).toBeLessThanOrEqual(10)
  })

  it('takes a benched vehicle out of the plan but still shows it', () => {
    const state = seed()
    const next = updateVehicle(state, state.vehicles[1].id, { enabled: false })
    expectValidPlan(next)
    expect(next.plan.routes.some((r) => r.vehicleId === state.vehicles[1].id)).toBe(false)
    expect(buildPlanView(next).routes.get(state.vehicles[1].id)?.stops).toEqual([])
  })

  it('moves van-only stops off a van that becomes a bus', () => {
    const state = seed()
    const van = state.vehicles.find((v) => v.type === 'van')!
    const next = updateVehicle(state, van.id, { type: 'bus', ...VEHICLE_PRESETS.bus })
    expectValidPlan(next)
  })

  it('seats more children when a vehicle is added', () => {
    const state = seed()
    const crowded = updateVehicle(state, state.vehicles[0].id, { seats: 10 })
    const waitingBefore = Object.keys(crowded.plan.waitlist).length
    const van = crowded.vehicles.find((v) => v.type === 'van')!
    const next = addVehicle(crowded, { ...van, id: 'extra', label: 'Van 09', colorSlot: 7 })
    expectValidPlan(next)
    expect(Object.keys(next.plan.waitlist).length).toBeLessThan(waitingBefore)
  })

  it('works with autopilot off too', () => {
    const state = updateSettings(seed(), { autopilot: false })
    const next = updateVehicle(state, state.vehicles[0].id, { seats: 5 })
    expectValidPlan(next)
    expect(seatCounts(next.plan).get(state.vehicles[0].id) ?? 0).toBeLessThanOrEqual(5)
  })
})

describe('manual overrides', () => {
  const seatedOn = (state: AppState, vehicleId: string) => state.students.find((s) => state.plan.seats[s.id]?.vehicleId === vehicleId)!

  it('keeps a pinned child on their vehicle through re-optimising', () => {
    const state = seed()
    const target = state.vehicles.find((v) => v.type === 'bus' && (seatCounts(state.plan).get(v.id) ?? 0) < v.seats)!
    const other = state.vehicles.find((v) => v.type === 'bus' && v.id !== target.id)!
    const child = seatedOn(state, other.id)
    const pinned = pinStudentVehicle(state, child.id, target.id)
    expect(pinned.plan.seats[child.id].vehicleId).toBe(target.id)
    expectValidPlan(pinned)
    const again = reoptimise(pinned)
    expect(again.plan.seats[child.id]?.vehicleId).toBe(target.id)
    expectValidPlan(again)
  })

  it('keeps a chosen boarding point through re-optimising', () => {
    const state = seed()
    const child = state.students.find((s) => state.plan.seats[s.id])!
    const otherStop = state.plan.stops.filter((s) => s.id !== state.plan.seats[child.id].stopId && s.access === 'bus').sort((a, b) => haversine(a.position, child.home) - haversine(b.position, child.home))[0]
    const pinned = pinStudentStop(state, child.id, otherStop.id)
    expect(pinned.plan.seats[child.id].stopId).toBe(otherStop.id)
    const again = reoptimise(pinned)
    expect(again.plan.seats[child.id]?.stopId).toBe(otherStop.id)
    expectValidPlan(again)
  })

  it('leaves a locked route alone', () => {
    const state = seed()
    const route = state.plan.routes.find((r) => r.stopIds.length > 2)!
    const locked = setRouteLocked(state, route.vehicleId, true)
    const again = reoptimise(locked)
    expect(again.plan.routes.find((r) => r.vehicleId === route.vehicleId)?.stopIds).toEqual(route.stopIds)
    expectValidPlan(again)
  })

  it('locks a route when stops are reordered by hand', () => {
    const state = seed()
    const route = state.plan.routes.find((r) => r.stopIds.length > 2)!
    const next = moveStopInRoute(state, route.vehicleId, 0, 1)
    const updated = next.plan.routes.find((r) => r.vehicleId === route.vehicleId)!
    expect(updated.locked).toBe(true)
    expect(updated.stopIds[0]).toBe(route.stopIds[1])
    expectValidPlan(next)
  })

  it('serves a stop marked van-only with a van', () => {
    const state = seed()
    const busRoute = state.plan.routes.find((r) => state.vehicles.find((v) => v.id === r.vehicleId)?.type === 'bus' && r.stopIds.length > 0)!
    const stopId = busRoute.stopIds[0]
    const next = setStopAccess(state, stopId, 'van')
    expect(next.plan.stops.find((s) => s.id === stopId)?.accessManual).toBe(true)
    expectValidPlan(next)
  })

  it('honours a stop pinned to a vehicle', () => {
    const state = seed()
    const van = state.vehicles.find((v) => v.type === 'van')!
    const busRoute = state.plan.routes.find((r) => state.vehicles.find((v) => v.id === r.vehicleId)?.type === 'bus' && r.stopIds.length > 0)!
    const stopId = busRoute.stopIds[0]
    const next = pinStopVehicle(state, stopId, van.id)
    expectValidPlan(next)
    const route = next.plan.routes.find((r) => r.vehicleId === van.id)!
    const riders = Object.values(next.plan.seats).filter((s) => s.stopId === stopId)
    if (riders.length > 0) expect(route.stopIds).toContain(stopId)
  })

  it('keeps a stop added by hand through re-optimising', () => {
    const state = seed()
    const next = addManualStop(state, { lat: 8.5327, lng: 76.9438 })
    expectValidPlan(next)
    const manual = next.plan.stops.filter((s) => s.source === 'manual')
    expect(manual.length).toBe(1)
    const again = reoptimise(next)
    expect(again.plan.stops.some((s) => s.id === manual[0].id)).toBe(true)
  })

  it('clears every override on request', () => {
    const state = seed()
    const child = state.students.find((s) => state.plan.seats[s.id])!
    const route = state.plan.routes.find((r) => r.stopIds.length > 0)!
    const changed = setRouteLocked(pinStudentVehicle(state, child.id, route.vehicleId), route.vehicleId, true)
    expect(countOverrides(changed).total).toBeGreaterThan(0)
    const cleared = clearOverrides(changed)
    expect(countOverrides(cleared).total).toBe(0)
    expectValidPlan(cleared)
  })
})

describe('rules', () => {
  it('uses fewer boarding points when children may walk further', () => {
    const state = seed()
    const near = updateSettings(state, { maxWalkMeters: 150 })
    const far = updateSettings(state, { maxWalkMeters: 800 })
    expect(far.plan.stops.length).toBeLessThan(near.plan.stops.length)
    expectValidPlan(near)
    expectValidPlan(far)
  })

  it('still plans under every priority', () => {
    for (const priority of ['profit', 'balanced', 'comfort'] as const) expectValidPlan(updateSettings(seed(), { priority }))
  })
})

describe('money', () => {
  it('adds up per vehicle and across the fleet', () => {
    const state = seed()
    const fleet = fleetEconomics(state, buildPlanView(state))
    const sum = (pick: (v: (typeof fleet.vehicles)[number]) => number) => fleet.vehicles.reduce((total, v) => total + pick(v), 0)
    expect(fleet.revenue).toBeCloseTo(sum((v) => v.revenue))
    expect(fleet.cost).toBeCloseTo(sum((v) => v.fuel + v.maintenance + v.crew + v.standing))
    expect(fleet.profit).toBeCloseTo(fleet.revenue - fleet.cost)
    expect(fleet.seated + fleet.waitlisted).toBe(state.students.length)
  })

  it('charges fees by distance slab', () => {
    const slabs = seed().settings.feeSlabs
    expect(feeForKm(1, slabs)).toBe(slabs[0].monthly)
    expect(feeForKm(4, slabs)).toBe(slabs[1].monthly)
    expect(feeForKm(100, slabs)).toBe(slabs[slabs.length - 1].monthly)
  })

  it('moves profit the right way in a what-if', () => {
    const state = seed()
    const view = buildPlanView(state)
    const today = fleetEconomics(state, view)
    const dearer = fleetEconomics(state, view, { dieselPrice: state.settings.dieselPrice + 20, feeChange: 0, crewChange: 0 })
    const higherFees = fleetEconomics(state, view, { dieselPrice: state.settings.dieselPrice, feeChange: 0.1, crewChange: 0 })
    expect(dearer.profit).toBeLessThan(today.profit)
    expect(higherFees.profit).toBeGreaterThan(today.profit)
  })

  it('finds the diesel price where profit hits zero', () => {
    const state = seed()
    const view = buildPlanView(state)
    const today = fleetEconomics(state, view)
    const price = breakEvenDiesel(today)!
    expect(fleetEconomics(state, view, { dieselPrice: price, feeChange: 0, crewChange: 0 }).profit).toBeCloseTo(0, 0)
  })

  it('still counts fixed costs for a benched vehicle, but not its crew', () => {
    const state = seed()
    const vehicle = state.vehicles[1]
    const next = updateVehicle(state, vehicle.id, { enabled: false })
    const money = fleetEconomics(next, buildPlanView(next)).vehicles.find((v) => v.vehicle.id === vehicle.id)!
    expect(money.crew).toBe(0)
    expect(money.standing).toBe(vehicle.standingMonthly)
    expect(money.fuel).toBe(0)
  })
})

describe('timing', () => {
  it('reaches school before the bell, with pickups in order', () => {
    const state = seed()
    const view = buildPlanView(state)
    for (const route of view.routes.values()) {
      if (route.stops.length === 0) continue
      expect(route.departure).toBeLessThan(route.arrival)
      for (let i = 1; i < route.stops.length; i++) expect(route.stops[i].pickup).toBeGreaterThan(route.stops[i - 1].pickup)
    }
  })

  it('moves a vehicle along its route over time', () => {
    const state = seed()
    const route = [...buildPlanView(state).routes.values()].find((r) => r.stops.length > 0)!
    const before = liveVehicle(route, route.departure - 5, state.settings)
    const during = liveVehicle(route, (route.departure + route.arrival) / 2, state.settings)
    const after = liveVehicle(route, route.arrival + 5, state.settings)
    expect(before.phase).toBe('scheduled')
    expect(during.along).toBeGreaterThan(before.along)
    expect(after.phase).toBe('arrived')
    expect(after.along).toBeGreaterThanOrEqual(during.along)
  })
})

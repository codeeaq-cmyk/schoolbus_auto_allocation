export interface LatLng {
  lat: number
  lng: number
}

export interface NamedPoint {
  name: string
  position: LatLng
}

export type VehicleType = 'bus' | 'van'

/** 0 no road · 1 foot only · 2 narrow, van only · 3 wide, bus and van */
export type RoadLevel = 0 | 1 | 2 | 3

/** Smallest vehicle class a stop forces: 'bus' means any vehicle fits, 'van' means vans only. */
export type StopAccess = 'bus' | 'van'

export interface Vehicle {
  id: string
  label: string
  plate: string
  type: VehicleType
  seats: number
  driverName: string
  driverPhone: string
  /** Index into ROUTE_COLORS. Fixed at creation so a vehicle keeps its color when others are removed. */
  colorSlot: number
  /** Where the vehicle starts its morning run. */
  start: NamedPoint
  /** Where it finishes after school. Null means it stays at school. */
  end: NamedPoint | null
  kmPerLitre: number
  maintenancePerKm: number
  /** Driver and attendant pay. Saved if the vehicle is benched. */
  crewMonthly: number
  /** Insurance, tax, permit, loan. Paid even when the vehicle is benched. */
  standingMonthly: number
  /** False keeps the vehicle out of the plan. */
  enabled: boolean
}

export interface BoardingPoint {
  id: string
  name: string
  position: LatLng
  access: StopAccess
  /** The school set `access` by hand, so road data must not change it. */
  accessManual: boolean
  /** Manual stops were placed or edited by the school and survive re-optimising. */
  source: 'auto' | 'manual'
  /** The school wants this stop served by one specific vehicle. */
  pinnedVehicleId: string | null
}

export interface Student {
  id: string
  name: string
  grade: string
  parentId: string
  parentName: string
  parentPhone: string
  home: LatLng
  address: string
  registeredAt: number
  /** School override: ride this vehicle. */
  pinnedVehicleId: string | null
  /** Parent or school override: board here. */
  pinnedStopId: string | null
  /** School override: charge this instead of the fee slab. */
  feeOverride: number | null
}

export interface Route {
  vehicleId: string
  /** Boarding points in driving order. */
  stopIds: string[]
  /** Frozen by the school: the optimiser leaves its stops and order alone. */
  locked: boolean
}

export interface Seat {
  stopId: string
  vehicleId: string
}

export type WaitReason =
  /** A vehicle could reach them but no seat is free. */
  | 'seats-full'
  /** No drivable road within walking distance. */
  | 'no-road'
  /** Even a direct ride would break the ride-time limit. */
  | 'too-far'
  /** They need a van and the fleet has none free. */
  | 'no-van'
  /** Vehicles have seats, but none passes close enough to be worth the detour. */
  | 'no-route'

export interface Plan {
  stops: BoardingPoint[]
  routes: Route[]
  seats: Record<string, Seat>
  waitlist: Record<string, WaitReason>
  /** Places the school removed a boarding point from, so it isn't recreated. */
  blocked: LatLng[]
  optimisedAt: number
}

/** Road-following geometry for a route; `key` is the waypoint signature it was built from. */
export interface RoutePath {
  key: string
  path: LatLng[]
  /** Road metres of each leg between consecutive waypoints. */
  legs: number[]
  /** Waypoints snapped onto the road. */
  snapped: LatLng[]
}

export interface FeeSlab {
  /** Upper distance limit in km; null for the last, open-ended slab. */
  upToKm: number | null
  monthly: number
}

export type Priority = 'profit' | 'balanced' | 'comfort'

export interface Settings {
  name: string
  address: string
  location: LatLng
  /** Furthest a child should walk from home to a boarding point. */
  maxWalkMeters: number
  /** Longest acceptable ride for any child. */
  maxRideMin: number
  /** Most children at one boarding point. */
  maxStopRiders: number
  /** Longest extra driving a vehicle will take on for one new child. */
  maxDetourMin: number
  /** School start time, "HH:MM" 24h. */
  startTime: string
  /** School end time, "HH:MM" 24h. */
  endTime: string
  /** Vehicles reach school this many minutes before start time. */
  arrivalBufferMin: number
  speedBusKmh: number
  speedVanKmh: number
  /** Time a vehicle spends at each boarding point. */
  dwellSec: number
  /** What the optimiser favours when goals conflict. */
  priority: Priority
  /** Re-plan on its own when the fleet or rules change. */
  autopilot: boolean
  dieselPrice: number
  schoolDays: number
  feeSlabs: FeeSlab[]
}

export interface ActivityEntry {
  id: string
  at: number
  kind: 'auto' | 'manual'
  text: string
}

export interface AppState {
  version: number
  settings: Settings
  vehicles: Vehicle[]
  students: Student[]
  plan: Plan
  paths: Record<string, RoutePath>
  activity: ActivityEntry[]
}

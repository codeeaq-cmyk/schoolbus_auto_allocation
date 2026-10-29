export interface LatLng {
  lat: number
  lng: number
}

export interface Stop {
  id: string
  name: string
  position: LatLng
}

export interface Bus {
  id: string
  label: string
  plate: string
  capacity: number
  driverName: string
  driverPhone: string
  /** Index into ROUTE_COLORS. Fixed at creation so a bus keeps its color when others are removed. */
  colorSlot: number
  /** Ordered pickup stops. The school is always the final destination and is not stored here. */
  stops: Stop[]
  /** Road-following geometry from the first stop to the school, or null until it is fetched. */
  path: LatLng[] | null
  /** Signature of the waypoints `path` was built from; a mismatch means the path is stale. */
  pathKey: string | null
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
  /** Set when the school pins the student to a bus, overriding auto-assignment. */
  manualBusId: string | null
}

export interface SchoolSettings {
  name: string
  address: string
  location: LatLng
  /** Furthest a child is expected to walk from home to the bus route. */
  maxWalkMeters: number
  /** School start time, "HH:MM" 24h. */
  startTime: string
  /** Buses reach school this many minutes before start time. */
  arrivalBufferMin: number
  avgSpeedKmh: number
}

export interface AppState {
  version: number
  settings: SchoolSettings
  buses: Bus[]
  students: Student[]
}

export type Assignment =
  | {
      status: 'assigned'
      busId: string
      /** Closest point on the bus route to the child's home. */
      pickup: LatLng
      walkMeters: number
      /** Distance travelled along the route when the bus reaches the pickup point. */
      alongMeters: number
      /** Minutes since midnight. */
      pickupMinutes: number
      nearestStop: Stop | null
      manual: boolean
    }
  | {
      status: 'waitlisted'
      reason: 'no-coverage' | 'buses-full'
      nearestBusId: string | null
      nearestMeters: number | null
    }

// Builds the demo data for a school in Thiruvananthapuram (Trivandrum):
//   src/data/roads.json  road-access grid and place names from OpenStreetMap
//   src/data/seed.json   students, fleet, and a plan produced by the real engine
//
// Run with `npm run seed` (needs internet the first time). Raw OSM downloads are
// cached in scripts/.cache so later runs only re-do routing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const OVERPASS = 'https://overpass-api.de/api/interpreter'
const OSRM = 'https://router.project-osrm.org'
const CACHE = new URL('./.cache/', import.meta.url)
const DATA = new URL('../src/data/', import.meta.url)

const BBOX = { south: 8.4, west: 76.83, north: 8.65, east: 77.06 }
const CELL_METERS = 50

const school = {
  name: 'Sunrise Valley School',
  address: 'Pattom, Thiruvananthapuram',
  location: { lat: 8.52406, lng: 76.93993 },
}

// ---------- OpenStreetMap ----------

async function overpass(file, query) {
  const url = new URL(file, CACHE)
  if (existsSync(url)) return JSON.parse(readFileSync(url, 'utf8')).elements
  mkdirSync(CACHE, { recursive: true })
  const res = await fetch(OVERPASS, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'smart-transport-demo/1.0' },
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const text = await res.text()
  writeFileSync(url, text)
  return JSON.parse(text).elements
}

const box = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`
const ways = await overpass(
  'roads.json',
  `[out:json][timeout:240];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|path|footway|pedestrian|steps|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${box}););out tags geom;`,
)
const placeNodes = await overpass(
  'places.json',
  `[out:json][timeout:120];(node["place"~"^(suburb|neighbourhood|quarter|village|hamlet|locality|town)$"](${box});node["highway"="bus_stop"]["name"](${box}););out body;`,
)

/**
 * Which vehicles fit a road. OSM rarely tags width, so class decides, and explicit
 * width or lane tags override it when present.
 *   3 wide: main roads and the minor public roads linking areas, buses and vans
 *   2 narrow: residential lanes, vans only
 *   1 foot only, or closed to vehicles
 */
function roadLevel(tags) {
  const h = tags.highway
  if (['footway', 'path', 'steps', 'pedestrian', 'track'].includes(h)) return 1
  if (tags.motor_vehicle === 'no' || tags.access === 'private' || tags.access === 'no') return 1
  if (h === 'service' && ['driveway', 'parking_aisle', 'drive-through'].includes(tags.service)) return 1
  let level = /^(motorway|trunk|primary|secondary|tertiary|unclassified)/.test(h) ? 3 : 2
  const lanes = parseInt(tags.lanes ?? '', 10)
  if (lanes >= 2) level = 3
  const width = parseFloat(tags.width ?? tags.est_width ?? '')
  if (!Number.isNaN(width)) level = width >= 5.5 ? 3 : width >= 2.6 ? 2 : 1
  return level
}

const RAD = Math.PI / 180
const haversine = (a, b) => {
  const dLat = (b.lat - a.lat) * RAD
  const dLng = (b.lng - a.lng) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

// ---------- Road grid ----------

const dLat = CELL_METERS / 110574
const dLng = CELL_METERS / (111320 * Math.cos(8.5 * RAD))
const rows = Math.ceil((BBOX.north - BBOX.south) / dLat)
const cols = Math.ceil((BBOX.east - BBOX.west) / dLng)
const levels = new Uint8Array(rows * cols)
const sumX = new Float64Array(rows * cols)
const sumY = new Float64Array(rows * cols)
const hits = new Uint32Array(rows * cols)
const roadPoints = { 2: [], 3: [] }

for (const way of ways) {
  const level = roadLevel(way.tags)
  const g = way.geometry
  for (let i = 1; i < g.length; i++) {
    const a = { lat: g[i - 1].lat, lng: g[i - 1].lon }
    const b = { lat: g[i].lat, lng: g[i].lon }
    const steps = Math.max(1, Math.ceil(haversine(a, b) / (CELL_METERS / 3)))
    for (let k = 0; k <= steps; k++) {
      const lat = a.lat + ((b.lat - a.lat) * k) / steps
      const lng = a.lng + ((b.lng - a.lng) * k) / steps
      const r = Math.floor((lat - BBOX.south) / dLat)
      const c = Math.floor((lng - BBOX.west) / dLng)
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue
      const cell = r * cols + c
      if (level > levels[cell]) {
        levels[cell] = level
        sumX[cell] = sumY[cell] = hits[cell] = 0
      }
      if (level === levels[cell]) {
        sumX[cell] += (lng - BBOX.west) / dLng - c
        sumY[cell] += (lat - BBOX.south) / dLat - r
        hits[cell]++
      }
      if (level >= 2 && k % 3 === 0) roadPoints[level].push({ lat, lng })
    }
  }
}

let rle = ''
let offsets = ''
for (let i = 0; i < levels.length; ) {
  let j = i
  while (j < levels.length && levels[j] === levels[i]) j++
  rle += `${levels[i]}${(j - i).toString(36)},`
  if (levels[i] === 3) {
    for (let k = i; k < j; k++) {
      offsets += Math.min(9, Math.floor((sumX[k] / hits[k]) * 10))
      offsets += Math.min(9, Math.floor((sumY[k] / hits[k]) * 10))
    }
  }
  i = j
}

const seen = new Set()
const places = []
for (const node of placeNodes) {
  const name = (node.tags['name:en'] ?? node.tags.name ?? '').trim()
  if (!name || /^(bus\s*stop|unknown|stop)$/i.test(name) || !/^[\x20-\x7e]+$/.test(name)) continue
  const kind = node.tags.highway === 'bus_stop' ? 0 : node.tags.place ? 1 : null
  if (kind === null) continue
  const key = `${name}|${node.lat.toFixed(3)}|${node.lon.toFixed(3)}`
  if (seen.has(key)) continue
  seen.add(key)
  const pretty = name === name.toLowerCase() ? name.replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase()) : name
  places.push([pretty, Math.round(node.lat * 1e5) / 1e5, Math.round(node.lon * 1e5) / 1e5, kind])
}

mkdirSync(DATA, { recursive: true })
writeFileSync(new URL('roads.json', DATA), JSON.stringify({ south: BBOX.south, west: BBOX.west, dLat, dLng, rows, cols, cellMeters: CELL_METERS, rle, offsets, places }))
console.log(`Grid ${rows}x${cols}; ${places.length} places; rle ${(rle.length / 1024) | 0} KB, offsets ${(offsets.length / 1024) | 0} KB`)

// ---------- Students ----------

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261030)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const between = (a, b) => a + rand() * (b - a)
const round5 = (n) => Math.round(n * 1e5) / 1e5

// Where families live: [name, lat, lng, children, share of them on inner lanes].
const neighbourhoods = [
  // Within about 3 km of school.
  ['Kesavadasapuram', 8.5327, 76.9438, 12, 0.6],
  ['Medical College', 8.5245, 76.928, 11, 0.6],
  ['Ulloor', 8.5345, 76.9245, 12, 0.6],
  ['Paruthippara', 8.5415, 76.9365, 7, 0.7],
  ['Kowdiar', 8.5205, 76.9605, 8, 0.6],
  ['Nalanchira', 8.5445, 76.9405, 10, 0.7],
  // 3 to 7 km.
  ['Sreekaryam', 8.5486, 76.9175, 12, 0.7],
  ['Peroorkada', 8.5435, 76.9665, 10, 0.7],
  ['Sasthamangalam', 8.5145, 76.9705, 9, 0.6],
  ['Palayam', 8.5015, 76.9505, 6, 0.4],
  ['Kudappanakunnu', 8.5455, 76.9565, 7, 0.9],
  ['Pettah', 8.4985, 76.9305, 6, 0.7],
  ['Mannanthala', 8.5635, 76.9505, 6, 0.8],
  // 7 to 12 km.
  ['Pangappara', 8.5575, 76.9025, 4, 0.9],
  ['Karyavattom', 8.5655, 76.8865, 4, 0.7],
  ['Kazhakkoottam', 8.5686, 76.8733, 4, 0.6],
  ['Vattiyoorkavu', 8.5265, 76.9845, 5, 0.8],
  ['Poojappura', 8.4925, 76.9745, 4, 0.7],
  ['Chackai', 8.4995, 76.9165, 3, 0.7],
]
// Beyond any sensible ride, so the demo shows how they're handled.
const faraway = [
  ['Neyyattinkara', 8.3985, 77.0855],
  ['Attingal', 8.6966, 76.8152],
]

const kidFirst = ['Aadhya', 'Aarav', 'Abhinav', 'Adithya', 'Advaith', 'Akhil', 'Alan', 'Alina', 'Amala', 'Ameya', 'Amrita', 'Anagha', 'Ananya', 'Aneesh', 'Anjali', 'Ann', 'Anoop', 'Aparna', 'Archana', 'Arjun', 'Arun', 'Arya', 'Ashwin', 'Athira', 'Aiswarya', 'Basil', 'Bhavana', 'Christy', 'Devika', 'Devan', 'Diya', 'Elsa', 'Fathima', 'Gautham', 'Gayathri', 'Gopika', 'Govind', 'Hari', 'Hiba', 'Ishaan', 'Jacob', 'Jithin', 'Joel', 'Karthik', 'Keerthana', 'Krishna', 'Lakshmi', 'Lekshmi', 'Maya', 'Meenakshi', 'Megha', 'Midhun', 'Nandana', 'Nandu', 'Navaneeth', 'Neha', 'Nikhil', 'Nithin', 'Niya', 'Parvathy', 'Pranav', 'Rahul', 'Rohan', 'Rohit', 'Sachin', 'Sandra', 'Sanjay', 'Sarah', 'Shreya', 'Sidharth', 'Sneha', 'Sreehari', 'Sreya', 'Tara', 'Thomas', 'Varun', 'Vishnu', 'Vivek', 'Zara', 'Zayan']
const surnames = ['Nair', 'Menon', 'Pillai', 'Kurup', 'Varma', 'Thomas', 'Mathew', 'Joseph', 'George', 'Rahman', 'Sasidharan', 'Krishnan', 'Raj', 'Mohan', 'Kumar', 'Das', 'Babu', 'Suresh', 'Varghese', 'Hameed']
const parentFirst = ['Anil', 'Bindu', 'Biju', 'Deepa', 'Gireesh', 'Jaya', 'Jose', 'Lathika', 'Manoj', 'Maya', 'Nisha', 'Prakash', 'Preetha', 'Rajesh', 'Rekha', 'Sajith', 'Sheeba', 'Shyam', 'Sindhu', 'Sunil']
const grades = ['LKG', 'UKG', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

function roadPointNear(lat, lng, pool, radius) {
  const centre = { lat, lng }
  for (let attempt = 0; attempt < 2000; attempt++) {
    const p = pool[Math.floor(rand() * pool.length)]
    if (Math.abs(p.lat - lat) > 0.015 || Math.abs(p.lng - lng) > 0.015) continue
    if (haversine(p, centre) <= radius) return p
  }
  return centre
}

function nearPool(p) {
  const near = []
  for (const q of roadPoints[2]) if (Math.abs(q.lat - p.lat) < 0.002 && Math.abs(q.lng - p.lng) < 0.002) near.push(q)
  for (const q of roadPoints[3]) if (Math.abs(q.lat - p.lat) < 0.002 && Math.abs(q.lng - p.lng) < 0.002) near.push(q)
  return near.length ? near : [p]
}

// Families cluster, so each neighbourhood gets a few pockets of homes on real roads.
const POCKET_SIZE = 4
const homes = []
for (const [name, lat, lng, count, laneShare] of neighbourhoods) {
  const pockets = []
  for (let i = 0; i < Math.ceil(count / POCKET_SIZE); i++) {
    const narrow = rand() < laneShare
    pockets.push(roadPointNear(lat, lng, narrow ? roadPoints[2] : roadPoints[3], 1000))
  }
  for (let i = 0; i < count; i++) {
    const pocket = pockets[i % pockets.length]
    const road = roadPointNear(pocket.lat, pocket.lng, nearPool(pocket), 170)
    homes.push({
      home: { lat: round5(road.lat + between(-0.00012, 0.00012)), lng: round5(road.lng + between(-0.00012, 0.00012)) },
      area: name,
    })
  }
}
for (const [name, lat, lng] of faraway) homes.push({ home: { lat, lng }, area: name })

for (let i = homes.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[homes[i], homes[j]] = [homes[j], homes[i]]
}

const SPAN = 14 * 24 * 60
const usedNames = new Set()
const students = homes.map(({ home, area }, i) => {
  const surname = pick(surnames)
  let name = `${pick(kidFirst)} ${surname}`
  while (usedNames.has(name)) name = `${pick(kidFirst)} ${pick(surnames)}`
  usedNames.add(name)
  return {
    id: `stu-${i + 1}`,
    name,
    grade: pick(grades),
    parentId: `parent-${i + 1}`,
    parentName: `${pick(parentFirst)} ${surname}`,
    parentPhone: `+91 9${Math.floor(between(100000000, 999999999))}`,
    home,
    address: `House ${Math.floor(between(3, 480))}, ${area}`,
    // Minutes before first load; earlier requests are favoured when seats run short.
    registeredMinutesAgo: Math.round(SPAN - (i / homes.length) * SPAN + between(0, 40)),
    pinnedVehicleId: null,
    pinnedStopId: null,
    feeOverride: null,
  }
})

// ---------- Fleet ----------

// Only start and end points are entered by hand: stops, riders and order are planned.
const fleetDefs = [
  { label: 'Bus 01', type: 'bus', seats: 40, plate: 'KL 01 BX 4521', driverName: 'Rajan P', driverPhone: '+91 94470 11201', start: ['Kazhakkoottam', 8.5686, 76.8733] },
  { label: 'Bus 02', type: 'bus', seats: 40, plate: 'KL 01 BX 4522', driverName: 'Shaji K', driverPhone: '+91 94470 11202', start: ['Vattiyoorkavu', 8.5265, 76.9845] },
  { label: 'Bus 03', type: 'bus', seats: 40, plate: 'KL 01 BX 4523', driverName: 'Sudheer M', driverPhone: '+91 94470 11203', start: ['Mannanthala', 8.5635, 76.9505] },
  { label: 'Van 01', type: 'van', seats: 14, plate: 'KL 01 CF 7711', driverName: 'Ajith V', driverPhone: '+91 94470 11204', start: ['Sreekaryam', 8.5486, 76.9175] },
  { label: 'Van 02', type: 'van', seats: 14, plate: 'KL 01 CF 7712', driverName: 'Binu S', driverPhone: '+91 94470 11205', start: ['Pettah', 8.4985, 76.9305] },
]

// ---------- Plan, using the same engine as the app ----------

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const load = (path) => server.ssrLoadModule(path)
const { optimise, emptyPlan } = await load('/src/lib/engine/plan.ts')
const { VEHICLE_PRESETS } = await load('/src/lib/engine/presets.ts')
const { addDistanceTable, pointKey } = await load('/src/lib/distance.ts')
const { nearestRoad } = await load('/src/lib/roads.ts')
const { routeKey } = await load('/src/lib/geo.ts')
const { waypointsOf } = await load('/src/lib/engine/view.ts')
const { fetchRoute } = await load('/src/lib/services.ts')

const settings = {
  name: school.name,
  address: school.address,
  location: school.location,
  maxWalkMeters: 300,
  maxRideMin: 70,
  maxStopRiders: 12,
  startTime: '08:45',
  endTime: '15:30',
  arrivalBufferMin: 10,
  speedBusKmh: 24,
  speedVanKmh: 28,
  dwellSec: 40,
  priority: 'balanced',
  autopilot: true,
  dieselPrice: 96,
  schoolDays: 22,
  feeSlabs: [
    { upToKm: 3, monthly: 1300 },
    { upToKm: 6, monthly: 1800 },
    { upToKm: 10, monthly: 2200 },
    { upToKm: 15, monthly: 2600 },
    { upToKm: null, monthly: 3100 },
  ],
}

const vehicles = fleetDefs.map((def, i) => {
  const { start, ...rest } = def
  const [name, lat, lng] = start
  const road = nearestRoad({ lat, lng }, 3, 1500)
  if (!road) throw new Error(`No wide road near ${name}`)
  const position = { lat: round5(road.position.lat), lng: round5(road.position.lng) }
  return {
    id: `veh-${i + 1}`,
    ...VEHICLE_PRESETS[def.type],
    ...rest,
    colorSlot: i,
    start: { name, position },
    end: null,
    enabled: true,
  }
})

const now = Date.now()
const state = {
  version: 2,
  settings,
  vehicles,
  students: students.map(({ registeredMinutesAgo, ...s }) => ({ ...s, registeredAt: now - registeredMinutesAgo * 60000 })),
  plan: emptyPlan(),
  paths: {},
  activity: [],
}

async function osrmTable(points) {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const res = await fetch(`${OSRM}/table/v1/driving/${coords}?annotations=distance`)
  const json = await res.json()
  if (json.code !== 'Ok') throw new Error(`OSRM table ${json.code}`)
  return json.distances
}

// First pass finds the boarding points; road distances between them then drive the real solve.
const firstPass = optimise(state, { recluster: true, iterations: 200, stability: false })
const points = [school.location, ...vehicles.map((v) => v.start.position), ...firstPass.stops.map((s) => s.position)]
const table = { keys: points.map(pointKey), meters: (await osrmTable(points)).map((row) => row.map((m) => Math.round(m))) }
addDistanceTable(table)

// Measure how winding the roads really are, to calibrate estimates for points not in the table.
let ratioSum = 0
let ratioCount = 0
for (let i = 0; i < points.length; i++) {
  for (let j = 0; j < points.length; j++) {
    const straight = haversine(points[i], points[j])
    if (i !== j && straight > 1000) {
      ratioSum += table.meters[i][j] / straight
      ratioCount++
    }
  }
}
console.log(`Road/straight ratio: ${(ratioSum / ratioCount).toFixed(2)} over ${ratioCount} pairs`)

const t0 = performance.now()
state.plan = optimise(state, { recluster: true, iterations: 2500, stability: false })
console.log(`Optimised in ${Math.round(performance.now() - t0)} ms`)

const stopsById = new Map(state.plan.stops.map((s) => [s.id, s]))
for (const route of state.plan.routes) {
  const vehicle = vehicles.find((v) => v.id === route.vehicleId)
  const stops = route.stopIds.map((id) => stopsById.get(id))
  if (stops.length === 0) continue
  const waypoints = waypointsOf(vehicle, stops, settings)
  state.paths[vehicle.id] = { key: routeKey(waypoints), ...(await fetchRoute(waypoints, vehicle.type)) }
}

await server.close()

const { students: _s, ...rest } = state
writeFileSync(
  new URL('seed.json', DATA),
  JSON.stringify({ ...rest, generatedAt: now, table, students: students }),
)
console.log(`Seed: ${students.length} students, ${vehicles.length} vehicles, ${state.plan.stops.length} stops, ${Object.keys(state.plan.waitlist).length} waitlisted`)

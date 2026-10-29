// Generates src/data/seed.json: demo school, buses with road-snapped routes (OSRM)
// and students scattered around those routes. Run with `npm run seed`.
import { writeFile } from 'node:fs/promises'

const OSRM = 'https://router.project-osrm.org/route/v1/driving'

const school = {
  name: 'Sunrise Valley School',
  address: '80 Feet Road, Koramangala, Bengaluru',
  location: { lat: 12.9345, lng: 77.6266 },
}

const buses = [
  {
    label: 'Bus 01', plate: 'KA 01 F 4521', capacity: 12,
    driverName: 'Ramesh Kumar', driverPhone: '+91 98450 11201',
    stops: [
      ['Indiranagar 100 Ft Road', 12.9719, 77.6412],
      ['Domlur Flyover', 12.9609, 77.6387],
      ['Ejipura Junction', 12.9447, 77.6285],
    ],
    students: 10,
  },
  {
    label: 'Bus 02', plate: 'KA 01 F 4522', capacity: 10,
    driverName: 'Suresh Gowda', driverPhone: '+91 98450 11202',
    stops: [
      ['HSR Layout Sector 7', 12.9081, 77.6476],
      ['HSR BDA Complex', 12.9121, 77.6446],
      ['Jakkasandra', 12.9255, 77.6363],
    ],
    students: 8,
  },
  {
    label: 'Bus 03', plate: 'KA 01 F 4523', capacity: 14,
    driverName: 'Manjunath R', driverPhone: '+91 98450 11203',
    stops: [
      ['Jayanagar 4th Block', 12.9293, 77.5824],
      ['BTM Layout 2nd Stage', 12.9166, 77.6101],
      ['Madiwala Market', 12.9226, 77.6174],
    ],
    students: 11,
  },
  {
    label: 'Bus 04', plate: 'KA 01 F 4524', capacity: 8,
    driverName: 'Abdul Rahman', driverPhone: '+91 98450 11204',
    stops: [
      ['Marathahalli Bridge', 12.9569, 77.7011],
      ['Kadubeesanahalli', 12.9387, 77.6966],
      ['Bellandur', 12.9304, 77.6784],
      ['Iblur Junction', 12.9213, 77.6626],
    ],
    // Deliberately more than capacity so the demo shows the waitlist.
    students: 10,
    alongRange: [0.15, 0.8],
  },
]

const outOfCoverage = [
  ['Whitefield, Bengaluru', 12.9698, 77.75],
  ['Electronic City Phase 1, Bengaluru', 12.8452, 77.6602],
]

const kidNames = ['Aarav', 'Vihaan', 'Ananya', 'Diya', 'Ishaan', 'Saanvi', 'Advik', 'Myra', 'Reyansh', 'Aadhya', 'Kabir', 'Kiara', 'Arjun', 'Meera', 'Rohan', 'Anika', 'Dhruv', 'Tara', 'Krish', 'Nila', 'Aditya', 'Ira', 'Siddharth', 'Riya', 'Vivaan', 'Zara', 'Nikhil', 'Pari', 'Yash', 'Avni', 'Karthik', 'Sneha', 'Rahul', 'Isha', 'Varun', 'Aditi', 'Pranav', 'Navya', 'Atharv', 'Lavanya', 'Samarth']
const surnames = ['Sharma', 'Reddy', 'Iyer', 'Nair', 'Rao', 'Menon', 'Gowda', 'Patel', 'Kulkarni', 'Shetty', 'Joshi', 'Pillai', 'Hegde', 'Kumar', 'Das', 'Bhat', 'Krishnan', 'Verma', 'Naidu', 'Mehta']
const parentNames = ['Rajesh', 'Sunita', 'Venkat', 'Deepa', 'Arun', 'Kavya', 'Suresh', 'Lakshmi', 'Manoj', 'Pooja', 'Ganesh', 'Shalini', 'Prakash', 'Anjali', 'Ramesh', 'Divya', 'Srinivas', 'Neha', 'Mahesh', 'Rekha']
const grades = ['LKG', 'UKG', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

// Deterministic RNG so regenerating gives the same demo.
function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261026)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const between = (a, b) => a + rand() * (b - a)

const round5 = (n) => Math.round(n * 1e5) / 1e5
const routeKey = (points) => points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')

function haversine(a, b) {
  const R = 6371000
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lng - a.lng) * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function pointAlong(path, fraction) {
  const cumulative = [0]
  for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1] + haversine(path[i - 1], path[i]))
  const target = fraction * cumulative[cumulative.length - 1]
  let i = 1
  while (i < path.length - 1 && cumulative[i] < target) i++
  const a = path[i - 1]
  const b = path[i]
  const seg = cumulative[i] - cumulative[i - 1] || 1
  const t = (target - cumulative[i - 1]) / seg
  const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
  // Heading in a local metric frame, used to offset perpendicular to the road.
  const kx = Math.cos(a.lat * Math.PI / 180)
  const dx = (b.lng - a.lng) * kx
  const dy = b.lat - a.lat
  const len = Math.hypot(dx, dy) || 1
  return { point, normal: { x: -dy / len, y: dx / len } }
}

function offset(point, normal, meters) {
  const kx = 111320 * Math.cos(point.lat * Math.PI / 180)
  return {
    lat: round5(point.lat + (normal.y * meters) / 110574),
    lng: round5(point.lng + (normal.x * meters) / kx),
  }
}

async function roadPath(points) {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const res = await fetch(`${OSRM}/${coords}?overview=full&geometries=geojson`)
  if (!res.ok) throw new Error(`OSRM ${res.status}`)
  const json = await res.json()
  if (json.code !== 'Ok') throw new Error(`OSRM ${json.code}`)
  return json.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat: round5(lat), lng: round5(lng) }))
}

const students = []
const outBuses = []
let nameIndex = 0

for (const [i, def] of buses.entries()) {
  const id = `bus-${i + 1}`
  const stops = def.stops.map(([name, lat, lng], s) => ({ id: `${id}-stop-${s + 1}`, name, position: { lat, lng } }))
  const waypoints = [...stops.map((s) => s.position), school.location]
  const path = await roadPath(waypoints)
  console.log(`${def.label}: ${path.length} points`)
  outBuses.push({
    id, label: def.label, plate: def.plate, capacity: def.capacity,
    driverName: def.driverName, driverPhone: def.driverPhone,
    colorSlot: i, stops, path, pathKey: routeKey(waypoints),
  })

  const [from, to] = def.alongRange ?? [0.04, 0.85]
  for (let k = 0; k < def.students; k++) {
    const { point, normal } = pointAlong(path, between(from, to))
    const meters = between(70, 560) * (rand() < 0.5 ? -1 : 1)
    const nearestStop = stops.reduce((best, s) => (haversine(s.position, point) < haversine(best.position, point) ? s : best))
    students.push({
      home: offset(point, normal, meters),
      address: `#${Math.floor(between(3, 480))}, near ${nearestStop.name}`,
    })
  }
}

for (const [address, lat, lng] of outOfCoverage) students.push({ home: { lat, lng }, address })

// Shuffle so registrations from different areas interleave over time.
for (let i = students.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[students[i], students[j]] = [students[j], students[i]]
}

const now = 14 * 24 * 60 // spread registrations over the last two weeks
const outStudents = students.map((s, i) => {
  const surname = pick(surnames)
  return {
    id: `stu-${i + 1}`,
    name: `${kidNames[nameIndex++ % kidNames.length]} ${surname}`,
    grade: pick(grades),
    parentId: `parent-${i + 1}`,
    parentName: `${pick(parentNames)} ${surname}`,
    parentPhone: `+91 9${Math.floor(between(100000000, 999999999))}`,
    home: s.home,
    address: s.address,
    // Minutes before "now" at first load; earlier registrations get seats first.
    registeredMinutesAgo: Math.round(now - (i / students.length) * now + between(0, 40)),
  }
})

const seed = {
  settings: {
    name: school.name,
    address: school.address,
    location: school.location,
    maxWalkMeters: 800,
    startTime: '08:30',
    arrivalBufferMin: 10,
    avgSpeedKmh: 18,
  },
  buses: outBuses,
  students: outStudents,
}

await writeFile(new URL('../src/data/seed.json', import.meta.url), JSON.stringify(seed))
console.log(`Wrote ${outBuses.length} buses and ${outStudents.length} students.`)

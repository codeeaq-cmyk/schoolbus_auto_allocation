# Smart Transport: automatic school bus seat assignment

A working React demo of a feature for a school management app. Parents pin their home on a map and their child is automatically given a seat on the bus whose route passes closest. The school manages buses, seat counts and routes.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`). No backend or API keys are needed. Data lives in the browser's `localStorage`, and **Reset demo** in the header restores the sample data.

Tip: open the parent app and the school admin in two tabs side by side. Changes sync between tabs instantly.

## What's in the demo

**Parent app** (`#/parent`)
- Request a seat: child details, then drop a home pin by tapping the map, searching an address, or using GPS. The shaded band shows everywhere within walking distance of a route.
- A live preview runs the real assignment engine as the pin moves: which bus, pickup point, pickup time, walking distance. It also shows the waitlist position if the nearby buses are full.
- Child page: bus, driver contact, the morning route timeline with your pickup point, and **live tracking**, a sped-up simulation of tomorrow's run with an ETA and a "head out now" alert.
- Change the home location or cancel the request; the seat is released to the next child in the queue.

**School admin** (`#/school`)
- **Overview:** seats filled, waitlist, average walk, a map of every route and student home, seats per bus, and the latest requests. You can simulate the whole fleet's morning run.
- **Fleet & routes:** add, edit or remove buses; change seats with a stepper (waitlisted students are seated instantly); draw routes by clicking stops on the map; drag stops to adjust them; reorder or rename stops. Routes snap to real roads. Each bus has a pickup-order manifest with CSV export.
- **Students:** search and filter everyone; see each assignment; pin a student to a specific bus (override) or set them back to automatic; remove a student; export to CSV.
- **Settings:** school start time, arrival buffer, average speed, maximum walking distance, and school location. The page previews how many students would gain or lose a seat before you save.

## How seats are assigned

`src/lib/assign.ts` derives every assignment from the current state, so any change re-balances seats deterministically:

1. Students the school **pinned** to a bus keep that bus while it has seats.
2. Everyone else is served **first come, first served** by request time, so a later request never bumps an earlier one.
3. Each student gets the **closest route within the walking limit** (default 800 m) that still has a free seat. The pickup point is the nearest point on that route.
4. Otherwise they are **waitlisted**: *buses full* if a route is close enough, *outside every route* if none is.

Pickup times are worked back from the school arrival time (start time minus buffer) using the distance along the route and the average bus speed.

## Project layout

```
src/
  lib/          assignment engine, geometry, time, map services, router
  store/        app state (reducer), localStorage persistence, cross-tab sync, road-path sync
  sim/          morning-run simulation clock
  components/   UI kit (buttons, fields, dialog, tabs, meters…) and map layers
  pages/        Landing, parent/*, school/*
  data/seed.json  sample school, 4 buses with road geometry, 41 students (Bengaluru)
scripts/generate-seed.mjs  regenerates seed.json (`npm run seed`, needs internet)
```

## External services

The map tiles come from OpenStreetMap, routes are snapped to roads by the public OSRM demo server, and address search uses Nominatim. All three are free, rate-limited public endpoints that are fine for a demo but not for production. If routing is unreachable, a route falls back to straight dashed lines between stops, and the rest of the app keeps working.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet / react-leaflet, Radix Dialog, Lucide icons.

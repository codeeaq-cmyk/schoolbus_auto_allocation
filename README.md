# Smart Transport: school transport that plans itself

A working React demo of a feature for a school management app, set in Thiruvananthapuram (Trivandrum). The school enters its vehicles. Parents pin their homes. The system works out boarding points, bus or van, allocation, routes, times and fees, and shows what it all costs and earns. **Every automatic decision can be overruled by hand, and the system plans around the change.**

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`). No backend or API keys are needed. Data lives in the browser's `localStorage`, and **Reset demo** in the header restores the sample data.

Tip: open the parent app and school admin in two tabs. Changes sync between them instantly.

```bash
npm test           # engine rules: seats, road access, overrides, money, timing
npm run typecheck
npm run lint
npm run seed       # rebuild the sample data (needs internet; see below)
```

## What is automatic, and how to overrule it

| The system decides | How | You can overrule it by |
| --- | --- | --- |
| **Boarding points** | The fewest stops that keep every child within the walking limit, on a road a vehicle can reach. Real named bus stops are preferred. | Adding, moving, renaming or removing a stop. A parent can also pick another nearby stop. |
| **Bus or van** | From road class in OpenStreetMap: main roads fit a bus, narrow lanes only a van. A child in a lane with a main road in walking distance boards there, so one bus can serve them. | Marking a stop "van only" or "bus or van". |
| **Which child rides what** | Lowest monthly running cost that respects seats, road access and the ride limit. | Pinning a child, or a whole stop, to a vehicle. |
| **Driving order** | Optimised for fuel and time on board. | Reordering stops, or locking a route. |
| **Pickup and drop times** | Worked back from the school bell using road distances and vehicle speed. | Changing start time, speeds or stop time in Settings. |
| **Fees** | By road distance from the boarding point to school, in slabs. | Editing the slabs, or setting one child's fee. |

You give each vehicle only a **type, seat count, start point and end point**. The start point is suggested and can be dragged on the map; the end point defaults to the school.

**Manual choices persist.** Pinned children, hand-placed stops and locked routes are kept when the system re-plans, and **Clear manual changes** on the overview returns everything to automatic.

**Small changes stay small.** New requests slot into the current plan without moving anyone else. Re-planning starts from today's routes, so families aren't reshuffled over a minor edit. A full rebuild happens only when you ask for it or change the rules for stops.

## What the school sees

- **Overview:** profit, seats, distance and rides; the live map (with a road-width overlay); suggested improvements; waitlist; a log of what the system did and what people changed.
- **Fleet & routes:** each vehicle's money, route and riders; boarding points; a run sheet to export.
- **Students:** every child's decision with the reason in plain language, and the controls to change it.
- **Analytics:** profit by vehicle, where the money goes, ride-time spread, fee income by distance, the comparison with a plan made by hand, and a what-if on diesel, fees and crew pay. Every chart has a table view.
- **Settings:** autopilot on or off, plan for lowest cost / balanced / shortest rides, rules, costs and fees, with a preview of the effect before saving.

Suggested improvements are priced by actually planning each change: add a vehicle for the waitlist, bench one, switch a bus to a van, move a start point.

## How the planning works

Code is in `src/lib/engine`.

1. **Boarding points (`boarding.ts`):** greedy maximum coverage over road points and real bus stops. Children with a wide road in reach get a stop any vehicle can serve; only those with none get a van-only stop.
2. **Routing (`solver.ts`):** a capacitated vehicle routing problem with a mixed fleet and a different start per vehicle, solved with Large Neighbourhood Search (regret insertion, then tear out and re-insert stops, keeping what lowers cost). The objective is monthly cost in rupees: crew, fuel and upkeep per metre, a value on time on board, a steep penalty over the ride limit, and a penalty for leaving a child unseated. The random generator is seeded, so the same input gives the same plan.
3. **Keeping buses on wide roads (`services.ts`, `roads.ts`):** the public router only knows cars and takes shortcuts through lanes. Bus paths are checked against road widths and re-routed through extra points found by A* over the road grid. Whatever can't be avoided is flagged as "check on the ground".
4. **Money (`economics.ts`):** closed-form per vehicle, so what-ifs are instant.

## What to trust, and what not to

- **Costs and fees are sample figures**, not data from a real school. Replace them in Settings and in each vehicle's running costs.
- **Road widths are estimates.** OpenStreetMap rarely records width (0 of 397 roads sampled near the school; 23 had lane counts), so width comes from road class, with width and lane tags used when present. Check routes on the ground before relying on them.
- **The "by hand" comparison is a model**, not a measured real-world plan. It is described on the Analytics page and in `baseline.ts`, and it respects the same seats and road limits. Treat its numbers as an indication.
- **The school, children and families are fictional.** Homes are placed on real roads so the geometry is realistic.
- The plan assumes one morning and one evening run per vehicle. Multiple runs per vehicle, traffic by time of day, and live GPS are not modelled; tracking is a simulation.

## External services

Map tiles come from OpenStreetMap, road routes and distances from the public OSRM demo server, and address search from Nominatim. All are free, rate-limited public endpoints: fine for a demo, not for production. The sample plan ships with its routes included, so it loads without them. If routing is unreachable later, routes fall back to dashed estimates and planning continues on estimated distances.

The road data covers roughly 8.40–8.65°N, 76.83–77.06°E. Homes outside it are treated as too far.

## Project layout

```
src/
  lib/engine/   boarding points, solver, plan updates, economics, baseline, recommendations
  lib/          road grid, distances, map services, geometry, formatting, router
  store/        app state, every state change (actions.ts), persistence, tab sync, route sync
  sim/          morning-run simulation clock
  components/   UI kit, map layers, charts
  pages/        Landing, parent/*, school/*
  data/         roads.json (road grid, place names), seed.json (sample plan)
scripts/generate-seed.mjs   rebuilds data/ from OpenStreetMap using the real engine
```

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet / react-leaflet, Radix Dialog, Lucide icons, Vitest.

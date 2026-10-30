import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDistanceTable, missingKeys, pointKey } from '../lib/distance'
import { fleetEconomics } from '../lib/engine/economics'
import { buildPlanView, type RouteStatus } from '../lib/engine/view'
import { fetchDistanceTable, fetchRoute } from '../lib/services'
import type { AppState, LatLng } from '../lib/types'
import { StoreContext } from './context'
import { loadState, parseState, persistDistances, STORAGE_KEY } from './state'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadState)
  const stateRef = useRef(state)
  const lastSynced = useRef<string | null>(null)

  // Planning work runs once per change, outside React's render phase.
  const update = useCallback((change: (state: AppState) => AppState) => {
    const next = change(stateRef.current)
    stateRef.current = next
    setState(next)
  }, [])

  // Persist, skipping writes that only echo what another tab just stored.
  useEffect(() => {
    const json = JSON.stringify(state)
    if (json === lastSynced.current) return
    lastSynced.current = json
    try {
      localStorage.setItem(STORAGE_KEY, json)
    } catch {
      // Storage can be full or blocked (private mode); the demo still works in memory.
    }
  }, [state])

  // Keep parent and school tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const next = parseState(e.newValue)
      if (!next) return
      lastSynced.current = e.newValue
      stateRef.current = next
      setState(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const view = useMemo(() => buildPlanView(state), [state])
  const fleet = useMemo(() => fleetEconomics(state, view), [state, view])
  const routeStatus = useRoadPathSync(state, view, update)
  useDistanceSync(state)

  const value = useMemo(() => ({ state, update, view, fleet, routeStatus }), [state, update, view, fleet, routeStatus])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

/** Fetches road geometry for any route whose stops changed since its path was built. */
function useRoadPathSync(state: AppState, view: ReturnType<typeof buildPlanView>, update: (change: (state: AppState) => AppState) => void): Record<string, RouteStatus> {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const inflight = useRef(new Set<string>())

  useEffect(() => {
    // Short delay so a burst of edits results in one request.
    const timer = window.setTimeout(() => {
      for (const route of view.routes.values()) {
        if (route.stops.length === 0 || route.roadSnapped) continue
        const token = `${route.vehicle.id}|${route.key}`
        if (inflight.current.has(token) || failed.has(token)) continue
        inflight.current.add(token)
        const waypoints = [route.vehicle.start.position, ...route.stops.map((s) => s.stop.position), state.settings.location, ...(route.vehicle.end ? [route.vehicle.end.position] : [])]
        const { id, type } = route.vehicle
        fetchRoute(waypoints, type)
          .then((road) => update((s) => ({ ...s, paths: { ...s.paths, [id]: { key: route.key, ...road } } })))
          .catch(() => setFailed((prev) => new Set(prev).add(token)))
          .finally(() => inflight.current.delete(token))
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [view, failed, state.settings.location, update])

  return useMemo(() => {
    const status: Record<string, RouteStatus> = {}
    for (const route of view.routes.values()) {
      if (route.stops.length === 0) status[route.vehicle.id] = 'none'
      else if (route.roadSnapped) status[route.vehicle.id] = 'road'
      else if (failed.has(`${route.vehicle.id}|${route.key}`)) status[route.vehicle.id] = 'straight'
      else status[route.vehicle.id] = 'loading'
    }
    return status
  }, [view, failed])
}

/** Keeps exact road distances for the current stops, so re-planning uses real roads. */
function useDistanceSync(state: AppState) {
  const { plan, vehicles, settings } = state
  const requested = useRef('')
  useEffect(() => {
    const points: LatLng[] = [settings.location, ...vehicles.map((v) => v.start.position), ...plan.stops.map((s) => s.position)]
    const signature = points.map(pointKey).join(';')
    if (signature === requested.current || !missingKeys(points)) return
    const timer = window.setTimeout(() => {
      requested.current = signature
      fetchDistanceTable(points).then((meters) => {
        if (!meters) return
        addDistanceTable({ keys: points.map(pointKey), meters })
        persistDistances()
      })
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [plan.stops, vehicles, settings.location])
}

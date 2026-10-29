import { useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { computeAssignments } from '../lib/assign'
import { hasFreshPath, routeKey, waypointsOf } from '../lib/geo'
import { fetchRoadPath } from '../lib/services'
import type { AppState } from '../lib/types'
import { StoreContext, type RouteStatus } from './context'
import { loadState, parseState, reducer, STORAGE_KEY, type Action } from './state'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const lastSynced = useRef<string | null>(null)

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
      dispatch({ type: 'replace', state: next })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const routeStatus = useRoadPathSync(state, dispatch)
  const result = useMemo(() => computeAssignments(state), [state])
  const value = useMemo(() => ({ state, dispatch, result, routeStatus }), [state, result, routeStatus])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

/** Fetches road-following paths for buses whose stops changed since their path was built. */
function useRoadPathSync(state: AppState, dispatch: Dispatch<Action>): Record<string, RouteStatus> {
  const { buses, settings } = state
  const school = settings.location
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const inflight = useRef(new Set<string>())

  useEffect(() => {
    // Short delay so a burst of stop edits results in one request.
    const timer = window.setTimeout(() => {
      for (const bus of buses) {
        if (bus.stops.length === 0 || hasFreshPath(bus, school)) continue
        const waypoints = waypointsOf(bus, school)
        const key = routeKey(waypoints)
        const token = `${bus.id}|${key}`
        if (inflight.current.has(token) || failed.has(token)) continue
        inflight.current.add(token)
        fetchRoadPath(waypoints)
          .then((path) => dispatch({ type: 'bus/setPath', id: bus.id, path, pathKey: key }))
          .catch(() => setFailed((prev) => new Set(prev).add(token)))
          .finally(() => inflight.current.delete(token))
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [buses, school, failed, dispatch])

  return useMemo(() => {
    const status: Record<string, RouteStatus> = {}
    for (const bus of buses) {
      if (bus.stops.length === 0) status[bus.id] = 'none'
      else if (hasFreshPath(bus, school)) status[bus.id] = 'road'
      else if (failed.has(`${bus.id}|${routeKey(waypointsOf(bus, school))}`)) status[bus.id] = 'straight'
      else status[bus.id] = 'loading'
    }
    return status
  }, [buses, school, failed])
}

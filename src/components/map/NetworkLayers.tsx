import { networkBounds, type AssignmentResult, type BusRoute } from '../../lib/assign'
import type { AppState } from '../../lib/types'
import type { RouteStatus } from '../../store/context'
import { FitBounds } from './BaseMap'
import { HomeDot, RouteLine, SchoolMarker, StopMarkers, type Emphasis } from './layers'

interface NetworkLayersProps {
  state: AppState
  result: AssignmentResult
  routeStatus: Record<string, RouteStatus>
  showStops?: boolean
  showHomes?: boolean
  /** When set, this bus is emphasised and the others recede. */
  focusBusId?: string | null
  onSelectBus?: (busId: string) => void
  fit?: boolean
}

/** Every route, its stops, the school and (optionally) every student's home. */
export function NetworkLayers({ state, result, routeStatus, showStops = true, showHomes = false, focusBusId, onSelectBus, fit = true }: NetworkLayersProps) {
  const routes = [...result.routes.values()]
  const emphasis = (route: BusRoute): Emphasis => (!focusBusId ? 'normal' : route.bus.id === focusBusId ? 'focus' : 'dim')
  // Draw the focused route last so it sits on top.
  const ordered = focusBusId ? [...routes.filter((r) => r.bus.id !== focusBusId), ...routes.filter((r) => r.bus.id === focusBusId)] : routes

  return (
    <>
      {fit && <FitBounds points={networkBounds(state, routes)} fitKey={`network-${state.buses.length}`} />}
      {ordered.map((route) => (
        <RouteLine
          key={route.bus.id}
          route={route}
          emphasis={emphasis(route)}
          approximate={routeStatus[route.bus.id] !== 'road'}
          onSelect={onSelectBus ? () => onSelectBus(route.bus.id) : undefined}
        />
      ))}
      {showHomes &&
        state.students.map((s) => {
          const a = result.byStudent.get(s.id)
          const bus = a?.status === 'assigned' ? result.routes.get(a.busId)?.bus : undefined
          // When focused, show the bus's riders plus anyone queued for a seat on it.
          const waitingForFocus = a?.status === 'waitlisted' && a.reason === 'buses-full' && a.nearestBusId === focusBusId
          if (focusBusId && bus?.id !== focusBusId && !waitingForFocus) return null
          return (
            <HomeDot
              key={s.id}
              position={s.home}
              colorSlot={bus ? bus.colorSlot : null}
              label={`${s.name} · ${bus ? bus.label : 'Waitlisted'}`}
            />
          )
        })}
      {showStops && ordered.map((route) => <StopMarkers key={route.bus.id} route={route} settings={state.settings} dim={emphasis(route) === 'dim'} />)}
      <SchoolMarker position={state.settings.location} name={state.settings.name} />
    </>
  )
}

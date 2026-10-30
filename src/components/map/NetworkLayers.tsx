import type { PlanView, RouteStatus, RouteView } from '../../lib/engine/view'
import type { AppState, LatLng } from '../../lib/types'
import { FitBounds } from './BaseMap'
import { HomeDot, RouteLine, SchoolMarker, StartMarker, StopMarkers, type Emphasis } from './layers'

interface NetworkLayersProps {
  state: AppState
  view: PlanView
  routeStatus: Record<string, RouteStatus>
  showStops?: boolean
  showHomes?: boolean
  showStarts?: boolean
  /** When set, this vehicle is emphasised and the others recede. */
  focusVehicleId?: string | null
  onSelectVehicle?: (vehicleId: string) => void
  fit?: boolean
}

/** Every route, its stops, the school and (optionally) every child's home. */
export function NetworkLayers({ state, view, routeStatus, showStops = true, showHomes = false, showStarts = true, focusVehicleId, onSelectVehicle, fit = true }: NetworkLayersProps) {
  const routes = [...view.routes.values()]
  const emphasis = (route: RouteView): Emphasis => (!focusVehicleId ? 'normal' : route.vehicle.id === focusVehicleId ? 'focus' : 'dim')
  // Draw the focused route last so it sits on top.
  const ordered = focusVehicleId ? [...routes.filter((r) => r.vehicle.id !== focusVehicleId), ...routes.filter((r) => r.vehicle.id === focusVehicleId)] : routes

  return (
    <>
      {fit && <FitBounds points={networkBounds(state)} fitKey={`network-${state.vehicles.length}`} />}
      {ordered.map((route) => (
        <RouteLine
          key={route.vehicle.id}
          route={route}
          emphasis={emphasis(route)}
          approximate={routeStatus[route.vehicle.id] === 'straight'}
          onSelect={onSelectVehicle ? () => onSelectVehicle(route.vehicle.id) : undefined}
        />
      ))}
      {showHomes &&
        state.students.map((s) => {
          const student = view.students.get(s.id)
          const vehicle = student?.status === 'seated' ? student.vehicle : undefined
          if (focusVehicleId && vehicle?.id !== focusVehicleId) return null
          return <HomeDot key={s.id} position={s.home} colorSlot={vehicle ? vehicle.colorSlot : null} label={`${s.name} · ${vehicle ? vehicle.label : 'Waitlisted'}`} />
        })}
      {showStops && ordered.map((route) => <StopMarkers key={route.vehicle.id} route={route} dim={emphasis(route) === 'dim'} compact={!focusVehicleId} />)}
      {showStarts && ordered.filter((r) => r.stops.length > 0).map((route) => <StartMarker key={route.vehicle.id} vehicle={route.vehicle} dim={emphasis(route) === 'dim'} />)}
      <SchoolMarker position={state.settings.location} name={state.settings.name} />
    </>
  )
}

/** Points that frame the whole network: the school and every stop in use. */
function networkBounds(state: AppState): LatLng[] {
  return [state.settings.location, ...state.plan.stops.map((s) => s.position)]
}

import { useState } from 'react'
import { CircleMarker, Marker, Pane, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { liveBus, timeAtAlong, type BusRoute } from '../../lib/assign'
import { routeColor } from '../../lib/colors'
import { formatClock } from '../../lib/time'
import type { LatLng, SchoolSettings } from '../../lib/types'
import { useSimClock } from '../../sim/context'
import { busIcon, schoolIcon, stopIcon } from './icons'

export type Emphasis = 'normal' | 'focus' | 'dim'

interface RouteLineProps {
  route: BusRoute
  emphasis?: Emphasis
  approximate?: boolean
  onSelect?: () => void
}

/** Route polyline with a white casing so crossing routes stay separable. */
export function RouteLine({ route, emphasis = 'normal', approximate, onSelect }: RouteLineProps) {
  const points = route.geometry.points
  if (points.length < 2) return null
  const color = routeColor(route.bus.colorSlot)
  const weight = emphasis === 'focus' ? 6 : emphasis === 'dim' ? 3 : 4
  const dim = emphasis === 'dim'
  return (
    <>
      <Polyline positions={points} pathOptions={{ color: '#ffffff', weight: weight + 4, opacity: dim ? 0.5 : 0.95, interactive: false }} />
      <Polyline
        positions={points}
        pathOptions={{ color, weight, opacity: dim ? 0.45 : 1, dashArray: approximate ? '1 9' : undefined, lineCap: 'round', lineJoin: 'round' }}
        eventHandlers={onSelect ? { click: onSelect } : undefined}
      >
        <Tooltip sticky className="route-tooltip">
          {route.bus.label} · {route.bus.stops.length} stops{approximate ? ' · approximate path' : ''}
        </Tooltip>
      </Polyline>
    </>
  )
}

export function StopMarkers({ route, settings, dim }: { route: BusRoute; settings: SchoolSettings; dim?: boolean }) {
  const color = routeColor(route.bus.colorSlot)
  return (
    <>
      {route.bus.stops.map((stop, i) => (
        <Marker key={stop.id} position={stop.position} icon={stopIcon(color, String(i + 1))} opacity={dim ? 0.55 : 1} keyboard={false}>
          <Tooltip direction="top" offset={[0, -12]} className="route-tooltip">
            {route.bus.label} · Stop {i + 1}: {stop.name} · {formatClock(timeAtAlong(route, route.stopAlong[i], settings))}
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}

export function SchoolMarker({ position, name }: { position: LatLng; name: string }) {
  return (
    <Marker position={position} icon={schoolIcon()} zIndexOffset={500} keyboard={false}>
      <Tooltip direction="top" offset={[0, -20]} className="route-tooltip">
        {name}
      </Tooltip>
    </Marker>
  )
}

/** A student's home: filled with their bus color, hollow grey ring when waitlisted. */
export function HomeDot({ position, colorSlot, label }: { position: LatLng; colorSlot: number | null; label: string }) {
  const assigned = colorSlot !== null
  return (
    <CircleMarker
      center={position}
      radius={assigned ? 5 : 6}
      pathOptions={
        assigned
          ? { color: '#ffffff', weight: 2, fillColor: routeColor(colorSlot), fillOpacity: 1 }
          : { color: '#475569', weight: 2.5, fillColor: '#ffffff', fillOpacity: 1, dashArray: '2 3' }
      }
    >
      <Tooltip direction="top" offset={[0, -6]} className="route-tooltip">
        {label}
      </Tooltip>
    </CircleMarker>
  )
}

/**
 * Areas within walking distance of any route. Bands are drawn opaque into a
 * translucent pane so overlaps read as one uniform region, and the stroke width
 * tracks zoom so the band is true to scale.
 */
export function CoverageLayer({ routes, meters }: { routes: BusRoute[]; meters: number }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const lat = map.getCenter().lat
  const metersPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8)
  const weight = Math.max(4, (meters * 2) / metersPerPixel)
  return (
    <Pane name="coverage" style={{ zIndex: 350, opacity: 0.13 }}>
      {routes.map((route) =>
        route.geometry.points.length < 2 ? null : (
          <Polyline
            key={route.bus.id}
            positions={route.geometry.points}
            pathOptions={{ color: '#4f46e5', weight, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }}
          />
        ),
      )}
    </Pane>
  )
}

/** Buses at their simulated position. Only this layer re-renders on each simulation tick. */
export function LiveBuses({ routes, settings }: { routes: BusRoute[]; settings: SchoolSettings }) {
  const clock = useSimClock()
  if (clock === null) return null
  return (
    <>
      {routes.map((route) => {
        if (route.geometry.points.length < 2) return null
        const live = liveBus(route, clock, settings)
        const status = live.phase === 'scheduled' ? `departs ${formatClock(route.departure)}` : live.phase === 'arrived' ? 'at school' : 'on the way'
        return (
          <Marker
            key={route.bus.id}
            position={live.position}
            icon={busIcon(routeColor(route.bus.colorSlot), route.bus.label, live.phase === 'en-route')}
            zIndexOffset={1000}
            keyboard={false}
          >
            <Tooltip direction="top" offset={[0, -18]} className="route-tooltip">
              {route.bus.label} · {status}
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}

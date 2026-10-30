import type { Polyline as LeafletPolyline } from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, ImageOverlay, Marker, Pane, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { routeColor } from '../../lib/colors'
import { liveVehicle, type RouteView } from '../../lib/engine/view'
import { roadOverlayImage } from '../../lib/roads'
import { formatClock } from '../../lib/time'
import type { LatLng, Settings, Vehicle } from '../../lib/types'
import { useSimClock } from '../../sim/context'
import { schoolIcon, startIcon, stopIcon, vehicleIcon } from './icons'

export type Emphasis = 'normal' | 'focus' | 'dim'

interface RouteLineProps {
  route: RouteView
  emphasis?: Emphasis
  approximate?: boolean
  onSelect?: () => void
}

/**
 * Route polyline with a white casing so crossing routes stay separable. It draws
 * itself when it first appears or its stops change, and a selected route shows
 * moving dots in its direction of travel.
 */
export function RouteLine({ route, emphasis = 'normal', approximate, onSelect }: RouteLineProps) {
  const line = useRef<LeafletPolyline>(null)
  const points = route.geometry.points
  const drawable = emphasis !== 'dim' && points.length >= 2

  useEffect(() => {
    const el = line.current?.getElement()
    if (!el || !drawable) return
    el.setAttribute('pathLength', '1')
    el.classList.add('route-draw')
    const done = () => {
      el.classList.remove('route-draw')
      el.removeAttribute('pathLength')
    }
    el.addEventListener('animationend', done, { once: true })
    return () => {
      el.removeEventListener('animationend', done)
      done()
    }
  }, [route.key, drawable])

  if (points.length < 2) return null
  const color = routeColor(route.vehicle.colorSlot)
  const weight = emphasis === 'focus' ? 6 : emphasis === 'dim' ? 3 : 4
  const dim = emphasis === 'dim'
  return (
    <>
      <Polyline positions={points} pathOptions={{ color: '#ffffff', weight: weight + 4, opacity: dim ? 0.5 : 0.95, interactive: false }} />
      <Polyline
        ref={line}
        positions={points}
        pathOptions={{ color, weight, opacity: dim ? 0.45 : 1, dashArray: approximate ? '1 9' : undefined, lineCap: 'round', lineJoin: 'round' }}
        eventHandlers={onSelect ? { click: onSelect } : undefined}
      >
        <Tooltip sticky className="route-tooltip">
          {route.vehicle.label} · {route.stops.length} stops{approximate ? ' · approximate path' : ''}
        </Tooltip>
      </Polyline>
      {emphasis === 'focus' && (
        <Polyline positions={points} pathOptions={{ color: '#ffffff', weight: 2.5, opacity: 0.95, dashArray: '0.5 13.5', lineCap: 'round', interactive: false, className: 'route-flow' }} />
      )}
    </>
  )
}

export function StopMarkers({ route, dim, compact }: { route: RouteView; dim?: boolean; compact?: boolean }) {
  const color = routeColor(route.vehicle.colorSlot)
  return (
    <>
      {route.stops.map((s, i) => (
        <Marker key={s.stop.id} position={s.position} icon={stopIcon(color, String(i + 1), { vanOnly: s.stop.access === 'van', compact })} opacity={dim ? 0.55 : 1} keyboard={false}>
          <Tooltip direction="top" offset={[0, -12]} className="route-tooltip">
            {route.vehicle.label} · {s.stop.name} · {formatClock(s.pickup)} · {s.riders.length} riders
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}

export function StartMarker({ vehicle, dim }: { vehicle: Vehicle; dim?: boolean }) {
  return (
    <Marker position={vehicle.start.position} icon={startIcon(routeColor(vehicle.colorSlot))} opacity={dim ? 0.55 : 1} keyboard={false}>
      <Tooltip direction="top" offset={[0, -14]} className="route-tooltip">
        {vehicle.label} starts at {vehicle.start.name}
      </Tooltip>
    </Marker>
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

/** A child's home: filled with their vehicle color, hollow grey ring when waitlisted. */
export function HomeDot({ position, colorSlot, label }: { position: LatLng; colorSlot: number | null; label: string }) {
  const assigned = colorSlot !== null
  return (
    <CircleMarker
      center={position}
      radius={assigned ? 4 : 6}
      pathOptions={
        assigned
          ? { color: '#ffffff', weight: 1.5, fillColor: routeColor(colorSlot), fillOpacity: 1 }
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
 * Areas within walking distance of a route. Bands are drawn opaque into a
 * translucent pane so overlaps read as one uniform region, and the stroke width
 * tracks zoom so the band is true to scale.
 */
export function CoverageLayer({ routes, meters }: { routes: RouteView[]; meters: number }) {
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
            key={route.vehicle.id}
            positions={route.geometry.points}
            pathOptions={{ color: '#4f46e5', weight, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }}
          />
        ),
      )}
    </Pane>
  )
}

/** Road widths from map data: which roads a bus fits and which only a van fits. */
export function RoadAccessLayer() {
  const image = useMemo(() => roadOverlayImage([42, 120, 214], [235, 104, 52]), [])
  if (!image) return null
  return (
    <Pane name="road-access" style={{ zIndex: 340 }}>
      <ImageOverlay url={image.url} bounds={image.bounds} opacity={0.6} className="road-access-image" interactive={false} />
    </Pane>
  )
}

/** Vehicles at their simulated position. Only this layer re-renders on each simulation tick. */
export function LiveVehicles({ routes, settings }: { routes: RouteView[]; settings: Settings }) {
  const clock = useSimClock()
  if (clock === null) return null
  return (
    <>
      {routes.map((route) => {
        if (route.geometry.points.length < 2) return null
        const live = liveVehicle(route, clock, settings)
        const status = live.phase === 'scheduled' ? `leaves ${formatClock(route.departure)}` : live.phase === 'arrived' ? 'at school' : live.phase === 'stopped' ? 'at a stop' : 'on the way'
        return (
          <Marker
            key={route.vehicle.id}
            position={live.position}
            icon={vehicleIcon(routeColor(route.vehicle.colorSlot), route.vehicle.type, route.vehicle.label, live.phase === 'en-route')}
            zIndexOffset={1000}
            keyboard={false}
          >
            <Tooltip direction="top" offset={[0, -18]} className="route-tooltip">
              {route.vehicle.label} · {status}
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}

import L from 'leaflet'
import { useEffect, type ReactNode } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import { cn } from '../../lib/cn'
import type { LatLng } from '../../lib/types'

interface BaseMapProps {
  center: LatLng
  zoom?: number
  label: string
  className?: string
  interactive?: boolean
  children?: ReactNode
}

export function BaseMap({ center, zoom = 13, label, className, interactive = true, children }: BaseMapProps) {
  return (
    <div role="region" aria-label={label} className={cn('relative h-full w-full', className)}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        zoomControl={false}
        zoomSnap={0.5}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        className="h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        {interactive && <ZoomControl position="bottomright" />}
        <AutoResize />
        {children}
      </MapContainer>
    </div>
  )
}

/** Leaflet measures its container once; re-measure when layouts reflow. */
function AutoResize() {
  const map = useMap()
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

/** Fits the view to `points` whenever `fitKey` changes (not on every point update). */
export function FitBounds({ points, fitKey, padding = 48, maxZoom = 16 }: { points: LatLng[]; fitKey: string; padding?: number; maxZoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) map.setView(points[0], Math.min(maxZoom, 16))
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [padding, padding], maxZoom })
    // Points are read at the moment the key changes; later point updates must not re-fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])
  return null
}

export function MapClick({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Pans to `target` whenever its value changes. */
export function FlyTo({ target, zoom = 16 }: { target: LatLng | null; zoom?: number }) {
  const map = useMap()
  const lat = target?.lat
  const lng = target?.lng
  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.6 })
  }, [map, lat, lng, zoom])
  return null
}

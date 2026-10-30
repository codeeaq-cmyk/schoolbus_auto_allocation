import L from 'leaflet'
import { inkOn } from '../../lib/colors'
import type { VehicleType } from '../../lib/types'

// Lucide icon paths, inlined because Leaflet markers take HTML strings.
const PATHS = {
  bus: '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  van: '<path d="M13 6v5a1 1 0 0 0 1 1h6.102a1 1 0 0 1 .712.298l.898.91a1 1 0 0 1 .288.702V17a1 1 0 0 1-1 1h-3"/><path d="M5 18H3a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2h12c1.1 0 2.1.8 2.4 1.8l1.176 4.2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  school: '<path d="M14 22v-4a2 2 0 1 0-4 0v4"/><path d="m18 10 3.447 1.724a1 1 0 0 1 .553.894V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7.382a1 1 0 0 1 .553-.894L6 10"/><path d="M18 5v17"/><path d="m4 6 7.106-3.553a2 2 0 0 1 1.788 0L20 6"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/>',
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
}

function svg(name: keyof typeof PATHS, size: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

// Reusing icon instances stops Leaflet from rebuilding marker DOM on every render.
const cache = new Map<string, L.DivIcon>()
function cached(key: string, make: () => L.DivIcon) {
  let icon = cache.get(key)
  if (!icon) {
    icon = make()
    cache.set(key, icon)
  }
  return icon
}

export function schoolIcon() {
  return cached('school', () =>
    L.divIcon({ className: 'map-icon', html: `<div class="pin-school">${svg('school', 20)}</div>`, iconSize: [42, 42], iconAnchor: [21, 21] }),
  )
}

/** A boarding point. Van-only stops are square so the difference isn't carried by shape of color alone. */
export function stopIcon(color: string, label: string, options: { editable?: boolean; vanOnly?: boolean; compact?: boolean } = {}) {
  const { editable = false, vanOnly = false, compact = false } = options
  const size = compact ? 14 : editable ? 28 : 24
  return cached(`stop|${color}|${label}|${editable}|${vanOnly}|${compact}`, () =>
    L.divIcon({
      className: 'map-icon',
      html: `<div class="pin-stop${editable ? ' is-editable' : ''}${vanOnly ? ' is-van-only' : ''}${compact ? ' is-compact' : ''}" style="background:${color};color:${inkOn(color)}">${compact ? '' : escapeHtml(label)}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    }),
  )
}

export function homeIcon(draggable = false) {
  return cached(`home|${draggable}`, () =>
    L.divIcon({
      className: 'map-icon',
      html: `<div class="pin-wrap"><span class="pin-pulse"></span><div class="pin-home${draggable ? ' is-draggable' : ''}">${svg('house', 17)}</div></div>`,
      iconSize: [38, 46],
      // The pin's point sits below the rotated square.
      iconAnchor: [19, 46],
    }),
  )
}

export function pickupIcon(color: string) {
  return cached(`pickup|${color}`, () =>
    L.divIcon({ className: 'map-icon', html: `<div class="pin-pickup" style="color:${color}"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
  )
}

/** A vehicle's starting point. */
export function startIcon(color: string, draggable = false) {
  return cached(`start|${color}|${draggable}`, () =>
    L.divIcon({
      className: 'map-icon',
      html: `<div class="pin-start${draggable ? ' is-draggable' : ''}" style="background:${color};color:${inkOn(color)}">${svg('flag', 15)}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }),
  )
}

export function vehicleIcon(color: string, type: VehicleType, label: string, moving: boolean) {
  const short = label.replace(/^(bus|van)\s*/i, '') || label
  return cached(`vehicle|${color}|${type}|${label}|${moving}`, () =>
    L.divIcon({
      className: 'map-icon',
      html: `<div class="pin-bus${moving ? ' is-moving' : ''}" style="background:${color};color:${inkOn(color)};--pin-color:${color}">${svg(type, 15)}<span>${escapeHtml(short)}</span></div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    }),
  )
}

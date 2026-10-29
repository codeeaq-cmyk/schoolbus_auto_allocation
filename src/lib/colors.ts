// Categorical route colors in a fixed order (validated adjacent-pair CVD-safe).
// Maps put every pair of routes side by side, which no 4+ color set can survive
// on hue alone, so a route's color is always paired with its bus label.
export const ROUTE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

export function routeColor(slot: number): string {
  return ROUTE_COLORS[((slot % ROUTE_COLORS.length) + ROUTE_COLORS.length) % ROUTE_COLORS.length]
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** Text color with the higher contrast on top of `hex`. */
export function inkOn(hex: string): string {
  const l = luminance(hex)
  const onWhite = 1.05 / (l + 0.05)
  const onBlack = (l + 0.05) / 0.05
  return onBlack > onWhite ? '#0b0b0b' : '#ffffff'
}

/** Lowest color slot no current bus uses, so new buses never repaint existing ones. */
export function nextColorSlot(used: number[]): number {
  const taken = new Set(used)
  let slot = 0
  while (taken.has(slot)) slot++
  return slot
}

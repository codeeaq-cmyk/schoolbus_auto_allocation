const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** ₹1,23,456 */
export function inr(amount: number): string {
  return rupees.format(Math.round(amount))
}

/** +₹1,200 or −₹1,200 */
export function inrSigned(amount: number): string {
  const rounded = Math.round(amount)
  return `${rounded >= 0 ? '+' : '−'}${rupees.format(Math.abs(rounded))}`
}

/** ₹1.2L or ₹48K, for chart axes. */
export function inrCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '−' : ''
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(abs >= 1000000 ? 0 : 1)}L`
  if (abs >= 1000) return `${sign}₹${Math.round(abs / 1000)}K`
  return `${sign}₹${Math.round(abs)}`
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function kmValue(km: number): string {
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`
}

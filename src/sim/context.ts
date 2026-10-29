import { createContext, useContext } from 'react'

export const SPEED_OPTIONS = [
  { value: 0.5, label: '30×' },
  { value: 1, label: '60×' },
  { value: 2, label: '120×' },
  { value: 5, label: '300×' },
] as const

export interface SimControls {
  /** A trip is loaded (running or paused). */
  active: boolean
  running: boolean
  /** Every bus has reached school. */
  finished: boolean
  /** Simulated minutes per real second. */
  speed: number
  /** Starts a run at `at` (minutes since midnight), defaulting to just before the first bus leaves. */
  start: (at?: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setSpeed: (speed: number) => void
}

// Split in two so only components that draw the moving buses re-render every frame.
export const SimControlsContext = createContext<SimControls | null>(null)
/** Simulated time of day in minutes since midnight, or null when no trip is loaded. */
export const SimClockContext = createContext<number | null>(null)

export function useSimControls(): SimControls {
  const value = useContext(SimControlsContext)
  if (!value) throw new Error('useSimControls must be used inside <SimulationProvider>')
  return value
}

export function useSimClock(): number | null {
  return useContext(SimClockContext)
}

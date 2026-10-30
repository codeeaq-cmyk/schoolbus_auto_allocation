import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store/context'
import { SimClockContext, SimControlsContext } from './context'

const FRAME_MS = 50

/** Plays the morning run: every vehicle leaves its start so that it reaches school on time. */
export function SimulationProvider({ children }: { children: ReactNode }) {
  const { view } = useStore()
  const [clock, setClock] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const clockRef = useRef<number | null>(null)

  const tripWindow = useMemo(() => {
    let start = Infinity
    let end = -Infinity
    for (const route of view.routes.values()) {
      if (route.geometry.points.length < 2) continue
      start = Math.min(start, route.departure)
      end = Math.max(end, route.arrival)
    }
    return Number.isFinite(start) ? { start: start - 2, end: end + 1 } : null
  }, [view.routes])

  useEffect(() => {
    if (!running || !tripWindow) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // A frame can fire after stop() but before React has re-rendered; it must not restart the clock.
      if (clockRef.current === null) return
      const dt = now - last
      if (dt >= FRAME_MS) {
        last = now
        const next = clockRef.current + (dt / 1000) * speed
        clockRef.current = Math.min(next, tripWindow.end)
        setClock(clockRef.current)
        if (next >= tripWindow.end) {
          setRunning(false)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, speed, tripWindow])

  const start = useCallback(
    (at?: number) => {
      if (!tripWindow) return
      const from = at === undefined ? tripWindow.start : Math.min(Math.max(at, tripWindow.start), tripWindow.end)
      clockRef.current = from
      setClock(from)
      setRunning(true)
    },
    [tripWindow],
  )

  const stop = useCallback(() => {
    clockRef.current = null
    setClock(null)
    setRunning(false)
  }, [])

  // Depends on `active` rather than `clock` so control consumers don't re-render every frame.
  const active = clock !== null
  const finished = active && !!tripWindow && clock >= tripWindow.end
  const controls = useMemo(
    () => ({
      active,
      running,
      finished,
      speed,
      start,
      stop,
      pause: () => setRunning(false),
      resume: () => setRunning(clockRef.current !== null),
      setSpeed,
    }),
    [active, running, finished, speed, start, stop],
  )

  return (
    <SimControlsContext.Provider value={controls}>
      <SimClockContext.Provider value={clock}>{children}</SimClockContext.Provider>
    </SimControlsContext.Provider>
  )
}

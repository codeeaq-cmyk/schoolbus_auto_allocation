import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { recommendationSteps, type Recommendation } from '../lib/engine/recommend'
import { RecommendationsContext, useStore } from './context'

/** Prices possible improvements in the background, one step at a time, whenever the plan changes. */
export function RecommendationsProvider({ children }: { children: ReactNode }) {
  const { state, fleet } = useStore()
  const [items, setItems] = useState<Recommendation[]>([])
  const [analysing, setAnalysing] = useState(false)
  const { plan, vehicles, students, settings, paths } = state

  useEffect(() => {
    let cancelled = false
    let timer = 0
    const found: Recommendation[] = []

    const start = window.setTimeout(() => {
      setAnalysing(true)
      const steps = recommendationSteps(state, fleet)
      const run = () => {
        if (cancelled) return
        const step = steps.next()
        if (step.done) {
          found.sort((a, b) => (b.profitDelta ?? -Infinity) - (a.profitDelta ?? -Infinity))
          setItems(found)
          setAnalysing(false)
          return
        }
        if (step.value) found.push(step.value)
        // Give the browser room to paint between the expensive steps.
        timer = window.setTimeout(run, 0)
      }
      run()
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(start)
      window.clearTimeout(timer)
    }
    // Activity log and other non-plan changes shouldn't restart the analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, vehicles, students, settings, paths])

  const value = useMemo(() => ({ items, analysing }), [items, analysing])
  return <RecommendationsContext.Provider value={value}>{children}</RecommendationsContext.Provider>
}

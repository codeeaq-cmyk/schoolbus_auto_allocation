import { createContext, useContext } from 'react'
import type { FleetEconomics } from '../lib/engine/economics'
import type { Recommendation } from '../lib/engine/recommend'
import type { PlanView, RouteStatus } from '../lib/engine/view'
import type { AppState } from '../lib/types'

export interface StoreValue {
  state: AppState
  /** Applies a change: pass any function from store/actions. */
  update: (change: (state: AppState) => AppState) => void
  view: PlanView
  fleet: FleetEconomics
  routeStatus: Record<string, RouteStatus>
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}

export interface RecommendationsValue {
  items: Recommendation[]
  analysing: boolean
}

export const RecommendationsContext = createContext<RecommendationsValue>({ items: [], analysing: false })

export function useRecommendations(): RecommendationsValue {
  return useContext(RecommendationsContext)
}

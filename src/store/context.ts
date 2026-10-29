import { createContext, useContext, type Dispatch } from 'react'
import type { AssignmentResult } from '../lib/assign'
import type { AppState } from '../lib/types'
import type { Action } from './state'

/**
 * none: no stops yet · loading: fetching the road path · road: road-snapped ·
 * straight: routing service unavailable, drawing straight segments instead.
 */
export type RouteStatus = 'none' | 'loading' | 'road' | 'straight'

export interface StoreValue {
  state: AppState
  dispatch: Dispatch<Action>
  result: AssignmentResult
  routeStatus: Record<string, RouteStatus>
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}

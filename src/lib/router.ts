import { useMemo, useSyncExternalStore } from 'react'

// Hash routing keeps every view deep-linkable without any server config.

export interface Route {
  path: string
  segments: string[]
  query: URLSearchParams
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, search = ''] = raw.split('?')
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(search) }
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash)
  return useMemo(() => parseHash(hash), [hash])
}

export function navigate(to: string) {
  window.location.hash = to
}

export const href = (to: string) => `#${to}`

import { useEffect, useSyncExternalStore } from 'react'

export type Route = { name: 'library' }

export const LIBRARY_HASH = '#/'

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function readHash(): string {
  return window.location.hash
}

/** Returns the route for a location hash, or null if no route matches. */
export function parseHash(hash: string): Route | null {
  if (hash === '' || hash === '#' || hash === LIBRARY_HASH) return { name: 'library' }
  return null
}

/**
 * Returns the route for the current location hash.
 * An unknown hash goes back to the song library, so a stale link shows a usable page.
 */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribeToHash, readHash)
  const route = parseHash(hash)

  useEffect(() => {
    if (route === null) window.location.replace(LIBRARY_HASH)
  }, [route])

  return route ?? { name: 'library' }
}

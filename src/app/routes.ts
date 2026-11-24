import { useEffect, useSyncExternalStore } from 'react'

export type Route = { name: 'library' } | { name: 'song'; songId: string }

export const LIBRARY_HASH = '#/'

// A song id is a UUID, so it needs no URL encoding.
const SONG_PREFIX = '#/song/'
const SONG_HASH = /^#\/song\/[0-9A-Za-z-]+$/

/** Returns the hash of the editor route for a song. */
export function songHash(songId: string): string {
  return `${SONG_PREFIX}${songId}`
}

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
  if (SONG_HASH.test(hash)) return { name: 'song', songId: hash.slice(SONG_PREFIX.length) }
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

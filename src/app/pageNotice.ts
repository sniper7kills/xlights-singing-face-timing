import { useEffect, useState } from 'react'

/**
 * A note that one page gives to the next page.
 * - `song-not-found`: the editor did not find the song of the route.
 * - `one-file-added`: the person dropped several files, and the app took one.
 */
export type PageNotice = 'song-not-found' | 'one-file-added'

// The page that sets the note goes away before the next page shows, so the note lives outside React.
let pending: PageNotice | null = null

/** Keeps a note for the next page that asks for it. A later note replaces an earlier note. */
export function setPageNotice(notice: PageNotice): void {
  pending = notice
}

/**
 * Returns true when the note is pending as the component mounts. The note then goes away,
 * so a later page does not show it again.
 */
export function usePageNotice(notice: PageNotice): boolean {
  // The read happens in the state initializer and the clear in an effect, so a double render of StrictMode keeps the result.
  const [shown] = useState(() => pending === notice)
  useEffect(() => {
    if (pending === notice) pending = null
  }, [notice])
  return shown
}

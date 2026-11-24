/** The zoom and the scroll offset that the browser keeps for one song. */
export type SavedView = {
  /** The zoom in pixels for each second. Null fits the full song in the width. */
  pxPerSecond: number | null
  /** The time at the left edge of the editor, in milliseconds. */
  scrollMs: number
}

function storageKey(songId: string): string {
  return `sft.view.${songId}`
}

function isSavedView(value: unknown): value is SavedView {
  if (typeof value !== 'object' || value === null) return false
  const { pxPerSecond, scrollMs } = value as Record<string, unknown>
  return (
    (pxPerSecond === null || (typeof pxPerSecond === 'number' && Number.isFinite(pxPerSecond))) &&
    typeof scrollMs === 'number' &&
    Number.isFinite(scrollMs)
  )
}

/**
 * Returns the zoom and the scroll offset that `localStorage` keeps for the song.
 * Returns null when the browser keeps no valid view, or when `localStorage` is not available.
 */
export function readSavedView(songId: string): SavedView | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(songId)) ?? 'null')
    return isSavedView(value) ? { pxPerSecond: value.pxPerSecond, scrollMs: value.scrollMs } : null
  } catch {
    // A private window can refuse `localStorage`, and the editor then opens at the default view.
    return null
  }
}

/** Keeps the zoom and the scroll offset of the song in `localStorage`. A refused write changes nothing. */
export function saveView(songId: string, view: SavedView): void {
  try {
    localStorage.setItem(
      storageKey(songId),
      JSON.stringify({ pxPerSecond: view.pxPerSecond, scrollMs: view.scrollMs }),
    )
  } catch {
    // A private window or a full storage refuses the write, and the editor works without it.
  }
}

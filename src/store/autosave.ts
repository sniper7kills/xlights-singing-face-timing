import { create } from 'zustand'
import { saveSong } from './db.ts'
import { useSongStore } from './songStore.ts'
import type { SongContent } from './types.ts'

/** The time from the last change of the open song to its save (FR-audio-19). */
export const AUTOSAVE_DELAY_MS = 1000

export type SaveState = 'saved' | 'saving'

export type AutosaveState = {
  /** 'saving' from the first unsaved change until the save of the last change ends. */
  saveState: SaveState
  /**
   * The failure of the last save, or null. After a failure, `saveState` stays 'saving',
   * and the change stays pending until a later save succeeds.
   */
  error: Error | null
}

/** The store of the save state of the open song. */
export const useAutosaveStore = create<AutosaveState>()(() => ({
  saveState: 'saved',
  error: null,
}))

/** Returns 'saving' while the open song has a change that is not saved, else 'saved'. */
export function useSaveState(): SaveState {
  return useAutosaveStore((state) => state.saveState)
}

let timer: ReturnType<typeof setTimeout> | undefined
let pending: SongContent | null = null
// Each save starts after the save before it ends, so an old save cannot replace a new one.
let saves: Promise<void> = Promise.resolve()

/**
 * Saves the pending change of the open song now, without the wait for AUTOSAVE_DELAY_MS.
 * Resolves after all saves end, with the change that is still not saved, or with null.
 * Does not reject. A failed save keeps the change pending and records the error in the
 * autosave store, so that the next call tries the save again.
 */
export function flushAutosave(): Promise<SongContent | null> {
  clearTimeout(timer)
  const content = pending
  if (content) {
    saves = saves.then(async () => {
      // A save earlier in the queue can save this change, and a newer change can replace it.
      if (pending !== content) return
      try {
        await saveSong(content)
      } catch (error) {
        useAutosaveStore.setState({
          error: error instanceof Error ? error : new Error(String(error)),
        })
        return
      }
      if (pending !== content) return
      pending = null
      useAutosaveStore.setState({ saveState: 'saved', error: null })
    })
  }
  return saves.then(() => pending)
}

/**
 * Saves the open song AUTOSAVE_DELAY_MS after its last change, and returns a function
 * that stops the autosave. An open of a song or a close of the open song saves a pending
 * change at once, so no change is lost.
 */
export function startAutosave(): () => void {
  const unsubscribe = useSongStore.subscribe((state, previous) => {
    const { current, history } = state
    if (current === previous.current) return
    // An open gives an empty history. An edit leaves one step or more in the history.
    const edited =
      current?.song.id === previous.current?.song.id &&
      history.past.length + history.future.length > 0
    if (current && edited) {
      pending = current
      useAutosaveStore.setState({ saveState: 'saving' })
      clearTimeout(timer)
      timer = setTimeout(flushAutosave, AUTOSAVE_DELAY_MS)
    } else {
      void flushAutosave()
    }
  })

  return () => {
    unsubscribe()
    clearTimeout(timer)
    pending = null
  }
}

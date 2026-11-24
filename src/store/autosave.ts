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
   * and the next change tries the save again.
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

/**
 * Saves the open song AUTOSAVE_DELAY_MS after its last change, and returns a function
 * that stops the autosave. A change of the open song or a close of it saves a pending
 * change at once, so no change is lost.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: SongContent | null = null

  const save = (content: SongContent) => {
    clearTimeout(timer)
    pending = null
    saveSong(content).then(
      () => {
        if (!pending) useAutosaveStore.setState({ saveState: 'saved', error: null })
      },
      (error: unknown) => {
        useAutosaveStore.setState({
          error: error instanceof Error ? error : new Error(String(error)),
        })
      },
    )
  }

  const unsubscribe = useSongStore.subscribe((state, previous) => {
    const { current } = state
    if (current === previous.current) return
    if (current && previous.current && current.song.id === previous.current.song.id) {
      pending = current
      useAutosaveStore.setState({ saveState: 'saving' })
      clearTimeout(timer)
      timer = setTimeout(save, AUTOSAVE_DELAY_MS, current)
    } else if (pending) {
      save(pending)
    }
  })

  return () => {
    unsubscribe()
    clearTimeout(timer)
  }
}

import { create } from 'zustand'
import { saveSong } from './db.ts'
import { useSongStore } from './songStore.ts'
import type { SongContent } from './types.ts'

/** The time from the last change of the open song to its save (FR-audio-19). */
export const AUTOSAVE_DELAY_MS = 1000

/**
 * The longest time from the first change that is not saved to the start of its save
 * (FR-audio-23). A series of changes with no pause cannot hold back the save.
 */
export const AUTOSAVE_MAX_WAIT_MS = 2000

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

let quietTimer: ReturnType<typeof setTimeout> | undefined
let maxWaitTimer: ReturnType<typeof setTimeout> | undefined
let pending: SongContent | null = null
// A flush during a save sets this flag, and the running save starts one more save when it ends.
let queued = false
let writing = false
let writes: Promise<void> = Promise.resolve()

function clearTimers() {
  clearTimeout(quietTimer)
  clearTimeout(maxWaitTimer)
  maxWaitTimer = undefined
}

/** Saves the newest pending change while a save is queued. One save runs at a time. */
async function writeQueued(): Promise<void> {
  while (queued && pending) {
    queued = false
    const content = pending
    try {
      await saveSong(content)
    } catch (error) {
      // The change stays pending, so the next change or flush saves it again.
      useAutosaveStore.setState({
        error: error instanceof Error ? error : new Error(String(error)),
      })
      continue
    }
    if (pending !== content) continue
    pending = null
    useAutosaveStore.setState({ saveState: 'saved', error: null })
  }
  queued = false
  writing = false
}

/**
 * Starts the save of the pending change of the open song now, with no wait.
 * If no save runs, the IndexedDB transaction starts in the same task as the call.
 * If a save runs, one more save of the newest change starts when it ends.
 * Resolves after all saves end, with the change that is still not saved, or with null.
 * Does not reject. A failed save keeps the change pending and records the error in the
 * autosave store, so that the next call tries the save again.
 */
export function flushAutosave(): Promise<SongContent | null> {
  clearTimers()
  if (pending) queued = true
  if (queued && !writing) {
    writing = true
    writes = writeQueued()
  }
  return writes.then(() => pending)
}

/**
 * Saves the open song AUTOSAVE_DELAY_MS after its last change, or AUTOSAVE_MAX_WAIT_MS
 * after its first unsaved change if that is earlier. Returns a function that stops the
 * autosave. An open of a song or a close of the open song saves a pending change at once,
 * so no change is lost.
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
      clearTimeout(quietTimer)
      quietTimer = setTimeout(flushAutosave, AUTOSAVE_DELAY_MS)
      maxWaitTimer ??= setTimeout(flushAutosave, AUTOSAVE_MAX_WAIT_MS)
    } else {
      void flushAutosave()
    }
  })

  return () => {
    unsubscribe()
    clearTimers()
    pending = null
    queued = false
  }
}

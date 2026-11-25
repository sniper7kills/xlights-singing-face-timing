import { create } from 'zustand'
import { saveSong, type SaveSongOptions } from './db.ts'
import { useSongStore } from './songStore.ts'
import type { SongContent } from './types.ts'

/** The time from the last change of the open song to its save (FR-audio-19). */
export const AUTOSAVE_DELAY_MS = 1000

/**
 * The longest time from the first change that is not saved to the start of its save
 * (FR-audio-23). A series of changes with no pause cannot hold back the save.
 */
export const AUTOSAVE_MAX_WAIT_MS = 2000

/** The longest time of one save. A save that takes longer counts as failed (FR-audio-28). */
export const SAVE_LIMIT_MS = 10_000

/** The longest wait of the link back to the song library for the save (FR-audio-26). */
export const LEAVE_WAIT_MS = 3000

/** The error of a save that did not end in its time limit. */
export class SaveTimeoutError extends Error {
  constructor() {
    super('The app could not save the song. Try again.')
    this.name = 'SaveTimeoutError'
  }
}

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

/** Returns `work`, or rejects with SaveTimeoutError when `work` does not settle in `limitMs`. */
function withLimit<T>(work: Promise<T>, limitMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SaveTimeoutError()), limitMs)
    work.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

/**
 * Saves the newest pending change while a save is queued. One save runs at a time.
 * `options` applies to the first save only, because a later save starts in a callback.
 */
async function writeQueued(options: SaveSongOptions): Promise<void> {
  let saveOptions = options
  while (queued && pending) {
    queued = false
    const content = pending
    try {
      // A transaction that never settles, for example behind a blocked upgrade, must not stop all later saves.
      await withLimit(saveSong(content, undefined, saveOptions), SAVE_LIMIT_MS)
    } catch (error) {
      // The change stays pending, so the next change or flush saves it again.
      useAutosaveStore.setState({
        error: error instanceof Error ? error : new Error(String(error)),
      })
      continue
    } finally {
      saveOptions = {}
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
 * @param options Set `unloading` only for a flush that starts as the page becomes hidden or unloads.
 */
export function flushAutosave(options: SaveSongOptions = {}): Promise<SongContent | null> {
  clearTimers()
  if (pending) queued = true
  if (queued && !writing) {
    writing = true
    writes = writeQueued(options)
  }
  return writes.then(() => pending)
}

/**
 * Starts the save of the pending change, and resolves with true when all saves end in
 * LEAVE_WAIT_MS. Else resolves with false and records a SaveTimeoutError in the autosave
 * store, so that the editor shows the message and the person stays on the song.
 * A save that ends with a different failure resolves with true, because the leave keeps the change in memory.
 */
export function flushBeforeLeave(): Promise<boolean> {
  return withLimit(flushAutosave(), LEAVE_WAIT_MS).then(
    () => true,
    () => {
      useAutosaveStore.setState({ error: new SaveTimeoutError() })
      return false
    },
  )
}

/**
 * Removes `content` from the autosave when it is still the pending change, and keeps the
 * error of its failed save in the autosave store. Use it when a different song opens, so
 * that the next change of that song does not replace the change of this song.
 */
export function dropPendingChange(content: SongContent): void {
  if (pending !== content) return
  pending = null
  queued = false
  useAutosaveStore.setState({ saveState: 'saved' })
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

import { create } from 'zustand'
import { loadSong } from './db.ts'
import { emptyHistory, recordStep, redoStep, undoStep, type History } from './history.ts'
import type { SongContent } from './types.ts'

/**
 * One change to the open song. It returns the new content and does not change its input.
 * Return the same object to make no change.
 */
export type Step = (content: SongContent) => SongContent

export type SongStoreState = {
  /** The open song with its voices, sections and marks, or null when no song is open. */
  current: SongContent | null
  /** The undo history of the open song. It is in memory only, so a reload clears it. */
  history: History<SongContent>
  /**
   * Reads the song from the database and makes it the open song, with an empty history.
   * Returns false, and closes the open song, if no song has the id.
   */
  openSong: (songId: string) => Promise<boolean>
  /** Closes the open song and clears the history. */
  closeSong: () => void
  /**
   * Applies one step to the open song and records it as one undo step.
   * Every action that changes marks, voices or sections calls apply.
   * A step that returns its input, or a call with no open song, records nothing.
   */
  apply: (step: Step) => void
  /** Restores the open song to the value before the last step. */
  undo: () => void
  /** Applies again the step that the last undo removed. */
  redo: () => void
}

/** The store of the open song and its history stack. */
export const useSongStore = create<SongStoreState>()((set, get) => ({
  current: null,
  history: emptyHistory(),
  openSong: async (songId) => {
    const content = await loadSong(songId)
    set({ current: content ?? null, history: emptyHistory() })
    return content !== undefined
  },
  closeSong: () => set({ current: null, history: emptyHistory() }),
  apply: (step) => {
    const { current, history } = get()
    if (!current) return
    const next = step(current)
    if (next === current) return
    set({ current: next, history: recordStep(history, current) })
  },
  undo: () => {
    const { current, history } = get()
    const result = current && undoStep(history, current)
    if (result) set({ current: result.present, history: result.history })
  },
  redo: () => {
    const { current, history } = get()
    const result = current && redoStep(history, current)
    if (result) set({ current: result.present, history: result.history })
  },
}))

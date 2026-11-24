import { create } from 'zustand'
import type { Voice } from './types.ts'

export type ViewState = {
  /** The zoom of the editor in pixels for each second. Null fits the full song in the width. */
  pxPerSecond: number | null
  /** The time at the left edge of the editor, in milliseconds. */
  scrollMs: number
  /** The play time, in milliseconds. */
  playTimeMs: number
  /** The voice that the layers show. Null selects the first voice of the open song. */
  selectedVoiceId: string | null
  setZoom: (pxPerSecond: number | null) => void
  setScroll: (scrollMs: number) => void
  setPlayTime: (playTimeMs: number) => void
  selectVoice: (voiceId: string | null) => void
  /** Sets the default view: the full song in the width, at time 0, with the first voice. */
  resetView: () => void
}

const DEFAULT_VIEW = { pxPerSecond: null, scrollMs: 0, playTimeMs: 0, selectedVoiceId: null }

/**
 * The store of the editor view. It is separate from the song store, so a change of the
 * view is not an undo step and does not start an autosave.
 */
export const useViewStore = create<ViewState>()((set) => ({
  ...DEFAULT_VIEW,
  setZoom: (pxPerSecond) => set({ pxPerSecond }),
  setScroll: (scrollMs) => set({ scrollMs }),
  setPlayTime: (playTimeMs) => set({ playTimeMs }),
  selectVoice: (selectedVoiceId) => set({ selectedVoiceId }),
  resetView: () => set(DEFAULT_VIEW),
}))

/**
 * Returns the voice that the layers show.
 * @param voices The voices of the open song, in row order.
 * @param selectedVoiceId The `selectedVoiceId` of the view store.
 * Returns the first voice when `selectedVoiceId` is null or names no voice of the song.
 * Returns undefined when the song has no voice.
 */
export function selectedVoice(
  voices: readonly Voice[],
  selectedVoiceId: string | null,
): Voice | undefined {
  return voices.find((voice) => voice.id === selectedVoiceId) ?? voices[0]
}

import { create } from 'zustand'

export type ViewState = {
  /** The zoom of the editor in pixels for each second. Null fits the full song in the width. */
  pxPerSecond: number | null
  /** The time at the left edge of the editor, in milliseconds. */
  scrollMs: number
  /** The play time, in milliseconds. */
  playTimeMs: number
  setZoom: (pxPerSecond: number | null) => void
  setScroll: (scrollMs: number) => void
  setPlayTime: (playTimeMs: number) => void
  /** Sets the default view: the full song in the width, at time 0. */
  resetView: () => void
}

const DEFAULT_VIEW = { pxPerSecond: null, scrollMs: 0, playTimeMs: 0 }

/**
 * The store of the editor view. It is separate from the song store, so a change of the
 * view is not an undo step and does not start an autosave.
 */
export const useViewStore = create<ViewState>()((set) => ({
  ...DEFAULT_VIEW,
  setZoom: (pxPerSecond) => set({ pxPerSecond }),
  setScroll: (scrollMs) => set({ scrollMs }),
  setPlayTime: (playTimeMs) => set({ playTimeMs }),
  resetView: () => set(DEFAULT_VIEW),
}))

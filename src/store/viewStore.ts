import { create } from 'zustand'
import type { TimeRange } from '../lib/time/timeRange.ts'
import type { Voice } from './types.ts'

export type ViewState = {
  /** The zoom of the editor in pixels for each second. Null fits the full song in the width. */
  pxPerSecond: number | null
  /** The time at the left edge of the editor, in milliseconds. */
  scrollMs: number
  /** The play time, in milliseconds. */
  playTimeMs: number
  /** The ids of the selected marks. */
  selectedMarkIds: string[]
  /**
   * The mark where a Shift+click range starts. A plain selection sets it, and a Shift+click keeps it.
   * Null when no mark is selected.
   */
  selectionAnchorId: string | null
  /** The voice that the layers show. Null selects the first voice of the open song. */
  selectedVoiceId: string | null
  /** The time selection that a drag on the waveform makes. Null when no time selection exists. */
  selection: TimeRange | null
  /** The inner width of the stage in pixels. The waveform, the time ruler and the layers have this width. */
  stageWidthPx: number
  setZoom: (pxPerSecond: number | null) => void
  setScroll: (scrollMs: number) => void
  setPlayTime: (playTimeMs: number) => void
  /** Replaces the selection with the marks that have the ids. The last id becomes the anchor of a Shift+click range. */
  selectMarks: (ids: string[]) => void
  /** Replaces the selection with the marks that have the ids, and keeps the anchor. A Shift+click calls it. */
  extendSelection: (ids: string[]) => void
  selectVoice: (voiceId: string | null) => void
  /** Replaces the time selection. Null clears it. */
  setSelection: (selection: TimeRange | null) => void
  setStageWidth: (stageWidthPx: number) => void
  /**
   * Sets the default view: the full song in the width, at time 0, with no selected mark,
   * no time selection and the first voice. The stage width stays, because only a resize changes it.
   */
  resetView: () => void
}

const DEFAULT_VIEW = {
  pxPerSecond: null,
  scrollMs: 0,
  playTimeMs: 0,
  selectedMarkIds: [],
  selectionAnchorId: null,
  selectedVoiceId: null,
  selection: null,
}

/**
 * The store of the editor view. It is separate from the song store, so a change of the
 * view is not an undo step and does not start an autosave.
 */
export const useViewStore = create<ViewState>()((set) => ({
  ...DEFAULT_VIEW,
  stageWidthPx: 0,
  setZoom: (pxPerSecond) => set({ pxPerSecond }),
  setScroll: (scrollMs) => set({ scrollMs }),
  setPlayTime: (playTimeMs) => set({ playTimeMs }),
  selectMarks: (ids) => set({ selectedMarkIds: ids, selectionAnchorId: ids.at(-1) ?? null }),
  extendSelection: (ids) => set({ selectedMarkIds: ids }),
  selectVoice: (selectedVoiceId) => set({ selectedVoiceId }),
  setSelection: (selection) => set({ selection }),
  setStageWidth: (stageWidthPx) => set({ stageWidthPx }),
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

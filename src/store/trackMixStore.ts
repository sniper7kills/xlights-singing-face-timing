import { create } from 'zustand'
import { isMuted, type TrackMix } from '../lib/audio/trackMix.ts'

/** The view state of the track rows of one song: mute, solo and fold. It is not an undo step. */
export type SavedTrackMix = TrackMix & {
  /** True when the person folded the group "Audio tracks". */
  folded: boolean
}

type TrackMixState = SavedTrackMix & {
  /** The song of the state, or null before the editor opens a song. */
  songId: string | null
  /** True when the open song has kept audio tracks, so the editor shows the track rows. */
  hasTracks: boolean
}

const DEFAULT_MIX: SavedTrackMix = { muted: {}, soloed: [], folded: false }

function storageKey(songId: string): string {
  return `sft.tracks.${songId}`
}

function isSavedTrackMix(value: unknown): value is SavedTrackMix {
  if (typeof value !== 'object' || value === null) return false
  const { muted, soloed, folded } = value as Record<string, unknown>
  return (
    typeof muted === 'object' &&
    muted !== null &&
    Object.values(muted).every((entry) => typeof entry === 'boolean') &&
    Array.isArray(soloed) &&
    soloed.every((id) => typeof id === 'string') &&
    typeof folded === 'boolean'
  )
}

/**
 * Returns the mute, solo and fold state that `localStorage` keeps for the song.
 * Returns the default state when the browser keeps no valid state, or when `localStorage` is not available.
 */
export function readTrackMix(songId: string): SavedTrackMix {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(songId)) ?? 'null')
    return isSavedTrackMix(value) ? value : DEFAULT_MIX
  } catch {
    // A private window can refuse `localStorage`, and the rows then open in the default state.
    return DEFAULT_MIX
  }
}

function saveTrackMix(songId: string, mix: SavedTrackMix): void {
  try {
    localStorage.setItem(
      storageKey(songId),
      JSON.stringify({ muted: mix.muted, soloed: mix.soloed, folded: mix.folded }),
    )
  } catch {
    // A private window or a full storage refuses the write, and the rows work without it.
  }
}

/**
 * The store of the mute, solo and fold state of the track rows.
 * It is separate from the song store, so a change is not an undo step and does not start an autosave.
 */
export const useTrackMixStore = create<TrackMixState>()(() => ({
  ...DEFAULT_MIX,
  songId: null,
  hasTracks: false,
}))

/** Loads the saved state of the song into the store. The editor calls it when it opens a song. */
export function openTrackMix(songId: string): void {
  useTrackMixStore.setState({ ...readTrackMix(songId), songId, hasTracks: false })
}

/** Records whether the open song has kept audio tracks. */
export function setHasTracks(hasTracks: boolean): void {
  useTrackMixStore.setState({ hasTracks })
}

function change(next: Partial<SavedTrackMix>): void {
  useTrackMixStore.setState(next)
  const state = useTrackMixStore.getState()
  if (state.songId !== null) saveTrackMix(state.songId, state)
}

/** Mutes the row, or unmutes a muted row, and saves the state for the song. */
export function toggleMute(rowId: string): void {
  const state = useTrackMixStore.getState()
  change({ muted: { ...state.muted, [rowId]: !isMuted(state, rowId) } })
}

/** Soloes the row, or ends the solo of a soloed row, and saves the state for the song. */
export function toggleSolo(rowId: string): void {
  const { soloed } = useTrackMixStore.getState()
  change({
    soloed: soloed.includes(rowId) ? soloed.filter((id) => id !== rowId) : [...soloed, rowId],
  })
}

/** Folds or unfolds the group "Audio tracks", and saves the state for the song. */
export function setFolded(folded: boolean): void {
  change({ folded })
}

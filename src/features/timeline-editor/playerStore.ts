import { create } from 'zustand'
import { loopRange } from '../../lib/marks/loopRange.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import type { WaveformPlayer } from './waveformPlayer.ts'

/** The play speeds of the speed control (FR-editor-22). 1 is the speed of the audio file. */
export const PLAY_RATES = [0.5, 0.75, 1] as const

export type PlayRate = (typeof PLAY_RATES)[number]

type PlayerState = {
  /** The player of the open song, or null while the audio loads or when the audio is missing. */
  player: WaveformPlayer | null
  /** True while the player plays the loop range again and again. */
  looping: boolean
  /** The play speed. It stays when the person opens a different song. */
  playRate: PlayRate
}

/**
 * The store of the audio player of the editor. The waveform player adds itself here when its audio is ready,
 * so the toolbar controls and the shortcuts reach it without a reference to the waveform component.
 */
export const usePlayerStore = create<PlayerState>()(() => ({
  player: null,
  looping: false,
  playRate: 1,
}))

/** Makes `player` the player of the editor, at the play speed of the store. */
export function attachPlayer(player: WaveformPlayer): void {
  player.setPlayRate(usePlayerStore.getState().playRate)
  usePlayerStore.setState({ player, looping: false })
}

/** Removes `player` from the store. A different player in the store stays, because it belongs to a newer load. */
export function detachPlayer(player: WaveformPlayer): void {
  if (usePlayerStore.getState().player === player)
    usePlayerStore.setState({ player: null, looping: false })
}

/** Records whether the player plays a loop. Only the player calls it. */
export function setLooping(looping: boolean): void {
  usePlayerStore.setState({ looping })
}

/** Sets the play speed of the player and keeps the pitch. With no player, the next player gets the speed. */
export function setPlayRate(playRate: PlayRate): void {
  usePlayerStore.getState().player?.setPlayRate(playRate)
  usePlayerStore.setState({ playRate })
}

/** Returns the range that `loopSelection` plays for the selection of the open song, or null when nothing is selected. */
export function currentLoopRange(): TimeRange | null {
  const view = useViewStore.getState()
  return loopRange(
    useSongStore.getState().current?.marks ?? [],
    view.selectedMarkIds,
    view.selection,
  )
}

/**
 * Plays the selection in a loop, from 150 ms before its start to its end, until the person pauses (FR-editor-21).
 * The selection is the selected marks, or the time selection when no mark is selected.
 * A loop that plays already starts again at the new range.
 * Returns false and does nothing when the audio is not ready or nothing is selected, so a shortcut can pass the key on.
 */
export function loopSelection(): boolean {
  const { player } = usePlayerStore.getState()
  const range = currentLoopRange()
  if (player === null || range === null) return false
  pauseOnRefusal(player, player.loop(range))
  return true
}

/**
 * Pauses `player` when the browser refuses the play that `started` waits for, for example under the autoplay policy.
 * The pause ends a loop and sends the pause event, so the controls show that the audio does not play.
 * @param player The player that started the play.
 * @param started The promise of `play` or `loop`.
 */
export function pauseOnRefusal(player: WaveformPlayer, started: Promise<void>): void {
  started.catch(() => player.pause())
}

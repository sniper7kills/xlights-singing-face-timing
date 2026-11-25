import type { TimeRange } from '../time/timeRange.ts'

/** The id of the row of the song audio. The other rows have the id of their audio track or their voice. */
export const SONG_ROW = 'song'

/** The mute state and the solo state of the rows of one song. */
export type TrackMix = {
  /** True for a muted row, false for a row that the person unmuted. A row with no value has the default state. */
  muted: Readonly<Record<string, boolean>>
  /** The ids of the soloed rows. */
  soloed: readonly string[]
}

/** Returns true when the row is muted. With no choice of the person, only the "Song" row sounds. */
export function isMuted(mix: TrackMix, rowId: string): boolean {
  return mix.muted[rowId] ?? rowId !== SONG_ROW
}

/**
 * Returns the ids of the rows that sound.
 * If one row of `rowIds` or more is soloed, only the soloed rows sound. Else each row that is not muted sounds.
 * @param mix The mute state and the solo state.
 * @param rowIds The ids of the rows that the editor shows. A solo of a row that the editor does not show has no effect.
 */
export function audibleRows(mix: TrackMix, rowIds: readonly string[]): Set<string> {
  const soloed = rowIds.filter((id) => mix.soloed.includes(id))
  if (soloed.length > 0) return new Set(soloed)
  return new Set(rowIds.filter((id) => !isMuted(mix, id)))
}

/**
 * The largest difference in milliseconds between the song audio and a track before the app moves the track.
 * 50 ms is one frame of the longer frame size. A move makes a short gap in the sound, so a smaller limit gives more gaps.
 */
export const DRIFT_LIMIT_MS = 50

/** What the app knows about one follower: an audio element that plays one audio track in time with the song audio. */
export type FollowerInput = {
  /** The play time of the song audio, in milliseconds. */
  leaderMs: number
  leaderPlaying: boolean
  /** True when the row of the follower sounds by the mute and solo rules. */
  audible: boolean
  /** The play time of the follower, in milliseconds from the start of its track. */
  followerMs: number
  followerPaused: boolean
  /** True while the follower moves to a new time. A second move then would restart it. */
  followerSeeking: boolean
  /** The song time of the first sample of the track. */
  startMs: number
  durationMs: number
  /** The time ranges in which the follower sounds, or null for all of its track. */
  gate: readonly TimeRange[] | null
}

/** What the app does to one follower. */
export type FollowerAction = {
  /** True when the follower must play, false when it must pause. */
  play: boolean
  /** The time in milliseconds from the start of the track to move the follower to, or null for no move. */
  seekMs: number | null
  /** True when the follower must be silent, because the song time is outside its gate. */
  muted: boolean
}

/**
 * Returns the time of the track at a song time, in milliseconds from the start of the track.
 * Returns null outside the track: a range run keeps the tracks of the range only.
 */
export function followerTime(leaderMs: number, startMs: number, durationMs: number): number | null {
  const ms = leaderMs - startMs
  return ms >= 0 && ms < durationMs ? ms : null
}

/**
 * Returns what the app does to a follower so that it plays in time with the song audio.
 * - A follower plays only while the song audio plays, its row sounds and the song time is inside its track.
 * - A follower that plays moves to the time of the song audio when the difference is more than `DRIFT_LIMIT_MS`.
 * - A follower that starts moves to the time of the song audio first.
 * - A follower is silent outside its gate.
 */
export function followerAction(input: FollowerInput): FollowerAction {
  const wanted = followerTime(input.leaderMs, input.startMs, input.durationMs)
  const muted =
    input.gate !== null &&
    !input.gate.some((range) => input.leaderMs >= range.startMs && input.leaderMs < range.endMs)
  const play = input.leaderPlaying && input.audible && wanted !== null
  if (!play || input.followerSeeking) return { play, seekMs: null, muted }
  const drift = Math.abs(input.followerMs - wanted)
  const seekMs = input.followerPaused || drift > DRIFT_LIMIT_MS ? wanted : null
  return { play, seekMs, muted }
}

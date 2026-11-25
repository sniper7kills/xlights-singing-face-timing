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

/** Returns true when "Mute" of the row shows as pressed. A soloed row never shows "Mute" as pressed, because the solo wins. */
export function isMutePressed(mix: TrackMix, rowId: string): boolean {
  return isMuted(mix, rowId) && !mix.soloed.includes(rowId)
}

/**
 * Returns the state after a click on "Mute" of the row.
 * - On a soloed row, the click ends the solo and mutes the row, so the row is silent after one click.
 * - Else the click mutes the row, or unmutes a muted row.
 */
export function withMuteToggled(mix: TrackMix, rowId: string): TrackMix {
  if (mix.soloed.includes(rowId))
    return {
      muted: { ...mix.muted, [rowId]: true },
      soloed: mix.soloed.filter((id) => id !== rowId),
    }
  return { muted: { ...mix.muted, [rowId]: !isMuted(mix, rowId) }, soloed: mix.soloed }
}

/**
 * Returns the state after a click on "Solo" of the row.
 * - On a soloed row, the click ends the solo.
 * - Else the click soloes the row and unmutes it, so a row never shows "Mute" and "Solo" as pressed together.
 */
export function withSoloToggled(mix: TrackMix, rowId: string): TrackMix {
  if (mix.soloed.includes(rowId))
    return { muted: mix.muted, soloed: mix.soloed.filter((id) => id !== rowId) }
  return { muted: { ...mix.muted, [rowId]: false }, soloed: [...mix.soloed, rowId] }
}

/** A row of the group "Audio tracks", with the name that the editor shows. */
export type NamedRow = { id: string; name: string }

/**
 * The state that tells which rows sound now.
 * - `rows`: the rows that the editor shows, with the "Song" row first. No rows means that the song has no kept tracks.
 * - `blocked`: the ids of the rows whose play the browser refused.
 */
export type MixView = TrackMix & { rows: readonly NamedRow[]; blocked: readonly string[] }

/**
 * Whether a row sounds now, and why a silent row is silent:
 * - `mute`: "Mute" is on for the row.
 * - `solo`: "Solo" is on for other rows. `soloRows` holds their names.
 * - `blocked`: the browser refused the play of the row.
 */
export type RowSound =
  | { plays: true }
  | { plays: false; reason: 'mute' | 'blocked' }
  | { plays: false; reason: 'solo'; soloRows: string[] }

/**
 * Returns whether the row sounds now. The mixer uses the same rule through `audibleRows`.
 * @param view The mix state, the rows and the blocked rows.
 * @param rowId The row.
 */
export function rowSound(view: MixView, rowId: string): RowSound {
  // With no row, the editor shows no "Song" controls, so the song audio sounds.
  if (view.rows.length === 0) return { plays: true }
  const ids = view.rows.map((row) => row.id)
  if (!audibleRows(view, ids).has(rowId)) {
    const soloRows = view.rows.filter((row) => view.soloed.includes(row.id))
    return soloRows.length > 0
      ? { plays: false, reason: 'solo', soloRows: soloRows.map((row) => row.name) }
      : { plays: false, reason: 'mute' }
  }
  return view.blocked.includes(rowId) ? { plays: false, reason: 'blocked' } : { plays: true }
}

/** Returns the names as a list in words: "A", "A and B", "A, B and C". */
function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

/**
 * Returns the tooltip of the sound sign of a row, for example `Silent, because "Solo" is on for Vocals.`
 * @param sound The sound of the row.
 */
export function rowSoundText(sound: RowSound): string {
  if (sound.plays) return 'Plays.'
  switch (sound.reason) {
    case 'mute':
      return 'Silent, because "Mute" is on.'
    case 'blocked':
      return 'Silent, because the browser did not start the sound.'
    case 'solo':
      return `Silent, because "Solo" is on for ${nameList(sound.soloRows)}.`
  }
}

/**
 * Returns the text after the heading "Audio tracks": the rows that sound now, for example `plays: Vocals`.
 * @param view The mix state, the rows and the blocked rows.
 */
export function playsText(view: MixView): string {
  const names = view.rows.filter((row) => rowSound(view, row.id).plays).map((row) => row.name)
  return `plays: ${names.length === 0 ? 'nothing' : names.join(', ')}`
}

/** The tooltip of the play button while a mute or a solo makes the song audio silent. */
export const SONG_MUTED_NOTE = 'The song audio is muted. See "Audio tracks".'

/**
 * Returns the tooltip of the play button: `SONG_MUTED_NOTE` while the "Song" row is silent, else undefined.
 * @param view The mix state, the rows and the blocked rows.
 */
export function playButtonNote(view: MixView): string | undefined {
  return rowSound(view, SONG_ROW).plays ? undefined : SONG_MUTED_NOTE
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

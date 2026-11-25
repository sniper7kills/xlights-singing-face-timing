import { followerAction } from '../../lib/audio/trackMix.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'

/** The part of a media element that the mixer uses. The unit tests give a fake with the same shape. */
export type MixerMedia = Pick<
  HTMLMediaElement,
  | 'currentTime'
  | 'playbackRate'
  | 'preservesPitch'
  | 'muted'
  | 'paused'
  | 'seeking'
  | 'play'
  | 'pause'
  | 'addEventListener'
  | 'removeEventListener'
>

/** The part of the document that the mixer uses. The unit tests give a fake with the same shape. */
export type MixerDocument = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>

/** One audio track that a follower plays. */
export type FollowerTrack = {
  /** The id of the row of the track. */
  rowId: string
  /** The audio element that plays the track. Its source is the WAV file of the track. */
  media: MixerMedia
  /** The song time of the first sample, in milliseconds. */
  startMs: number
  durationMs: number
  /** The time ranges in which the follower sounds, or null for all of its track. */
  gate: readonly TimeRange[] | null
}

/** Keeps the followers in time with the song audio. */
export type TrackMixer = {
  /**
   * Sets the followers and the rows that sound, and applies both in one check.
   * A follower with the same row and the same media element keeps its play, so a new gate does not restart it.
   * A follower that is not in the new list pauses.
   * @param followers The audio tracks.
   * @param audible The ids of the rows that sound.
   */
  update: (followers: readonly FollowerTrack[], audible: ReadonlySet<string>) => void
  /**
   * Starts or primes the follower of a row in the click of the person on "Mute" or "Solo" of that row.
   * The browser accepts the play of an element in the handler of an action of the person.
   * It also clears the "blocked" state of the row, so the mixer tries the row again.
   * @param rowId The row of the click.
   * @param audible The rows that sound after the click.
   */
  activate: (rowId: string, audible: ReadonlySet<string>) => void
  /** Stops the followers, unmutes the song audio and removes each listener and each timer. */
  destroy: () => void
}

/** The options of `createTrackMixer`. */
export type TrackMixerOptions = {
  /** The id of the row of the song audio. */
  songRowId: string
  /** Receives the rows whose play the browser refused with `NotAllowedError`, after each change. */
  onBlockedChange: (rowIds: readonly string[]) => void
  /** The document whose visibility selects the check loop. The default is the page document. */
  document?: MixerDocument
}

/** The media events after which the followers follow the song audio again. */
const SYNC_EVENTS = ['play', 'pause', 'seeking', 'seeked', 'timeupdate'] as const

/**
 * The time between two checks while the page is hidden, in milliseconds.
 * A hidden page gets no animation frame. Some browsers also run a timer of a hidden page one time each second or less.
 */
export const HIDDEN_CHECK_MS = 50

/**
 * Returns a mixer that makes each follower play, pause, move and change speed together with the song audio.
 *
 * The song audio leads. Each follower:
 * - plays and pauses with the song audio, and only while its row sounds;
 * - gets the play speed and the pitch setting of the song audio;
 * - moves to the time of the song audio after a seek, a loop jump, and a difference of more than `DRIFT_LIMIT_MS`.
 *
 * The mixer checks the followers on each media event of the song audio, and during play on each animation frame.
 * While the page is hidden, a timer of `HIDDEN_CHECK_MS` replaces the animation frames.
 * After the browser refuses the play of a follower with `NotAllowedError`, the mixer stops the tries for its row until `activate`.
 * @param leader The media element of the song audio.
 * @param options The song row, the receiver of the blocked rows and the document.
 */
export function createTrackMixer(leader: MixerMedia, options: TrackMixerOptions): TrackMixer {
  const doc = options.document ?? document
  let followers: readonly FollowerTrack[] = []
  let audible: ReadonlySet<string> = new Set([options.songRowId])
  const blocked = new Set<string>()
  let frame: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const setBlocked = (rowId: string, value: boolean) => {
    if (blocked.has(rowId) === value) return
    if (value) blocked.add(rowId)
    else blocked.delete(rowId)
    options.onBlockedChange([...blocked])
  }

  const start = (follower: FollowerTrack) => {
    follower.media.play().catch((error: unknown) => {
      // A pause soon after the play rejects with `AbortError`, and the next check starts the follower again.
      if (error instanceof DOMException && error.name === 'NotAllowedError')
        setBlocked(follower.rowId, true)
    })
  }

  const copyRate = () => {
    for (const { media } of followers) {
      media.preservesPitch = leader.preservesPitch
      media.playbackRate = leader.playbackRate
    }
  }

  const actionOf = (follower: FollowerTrack) =>
    followerAction({
      leaderMs: leader.currentTime * 1000,
      leaderPlaying: !leader.paused,
      audible: audible.has(follower.rowId),
      followerMs: follower.media.currentTime * 1000,
      followerPaused: follower.media.paused,
      followerSeeking: follower.media.seeking,
      startMs: follower.startMs,
      durationMs: follower.durationMs,
      gate: follower.gate,
    })

  const sync = () => {
    for (const follower of followers) {
      const { media } = follower
      const action = actionOf(follower)
      media.muted = action.muted
      if (action.seekMs !== null) media.currentTime = action.seekMs / 1000
      if (!action.play && !media.paused) media.pause()
      if (action.play && media.paused && !blocked.has(follower.rowId)) start(follower)
    }
  }

  const stopLoop = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    if (timer !== null) clearTimeout(timer)
    frame = null
    timer = null
  }
  const tick = () => {
    frame = null
    timer = null
    sync()
    startLoop()
  }
  const startLoop = () => {
    if (leader.paused || frame !== null || timer !== null) return
    if (doc.hidden) timer = setTimeout(tick, HIDDEN_CHECK_MS)
    else frame = requestAnimationFrame(tick)
  }
  const onVisibility = () => {
    stopLoop()
    startLoop()
  }

  const muteLeader = () => {
    leader.muted = !audible.has(options.songRowId)
  }

  for (const type of SYNC_EVENTS) leader.addEventListener(type, sync)
  leader.addEventListener('play', startLoop)
  leader.addEventListener('ratechange', copyRate)
  doc.addEventListener('visibilitychange', onVisibility)

  return {
    update: (next, rows) => {
      for (const old of followers) {
        const kept = next.some((entry) => entry.rowId === old.rowId && entry.media === old.media)
        if (!kept && !old.media.paused) old.media.pause()
      }
      followers = next
      audible = rows
      muteLeader()
      copyRate()
      sync()
      startLoop()
    },
    activate: (rowId, rows) => {
      audible = rows
      muteLeader()
      setBlocked(rowId, false)
      sync()
      const follower = followers.find((entry) => entry.rowId === rowId)
      if (follower === undefined || !follower.media.paused || !audible.has(rowId)) return
      // The row sounds, but the song audio does not play now. A muted play and an instant pause in the click
      // let the browser start this element later with no further action of the person.
      follower.media.muted = true
      start(follower)
      follower.media.pause()
      sync()
    },
    destroy: () => {
      stopLoop()
      for (const type of SYNC_EVENTS) leader.removeEventListener(type, sync)
      leader.removeEventListener('play', startLoop)
      leader.removeEventListener('ratechange', copyRate)
      doc.removeEventListener('visibilitychange', onVisibility)
      leader.muted = false
      for (const { media } of followers) media.pause()
    },
  }
}

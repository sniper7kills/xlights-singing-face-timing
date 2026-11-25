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
  /** Sets the rows that sound. The song audio plays muted when its row does not sound, so it still moves the play time. */
  setAudible: (rowIds: ReadonlySet<string>, songRowId: string) => void
  /** Stops the followers, unmutes the song audio and removes each listener. */
  destroy: () => void
}

/** The media events after which the followers follow the song audio again. */
const SYNC_EVENTS = ['play', 'pause', 'seeking', 'seeked', 'timeupdate'] as const

/**
 * Returns a mixer that makes each follower play, pause, move and change speed together with the song audio.
 *
 * The song audio leads. Each follower:
 * - plays and pauses with the song audio, and only while its row sounds;
 * - gets the play speed and the pitch setting of the song audio;
 * - moves to the time of the song audio after a seek, a loop jump, and a difference of more than `DRIFT_LIMIT_MS`.
 *
 * The mixer checks the followers on each animation frame during play and on each media event of the song audio.
 * @param leader The media element of the song audio.
 * @param followers The audio tracks.
 */
export function createTrackMixer(
  leader: MixerMedia,
  followers: readonly FollowerTrack[],
): TrackMixer {
  let audible: ReadonlySet<string> = new Set()
  let frame: number | null = null

  const copyRate = () => {
    for (const { media } of followers) {
      media.preservesPitch = leader.preservesPitch
      media.playbackRate = leader.playbackRate
    }
  }

  const sync = () => {
    const leaderPlaying = !leader.paused
    for (const follower of followers) {
      const { media } = follower
      const action = followerAction({
        leaderMs: leader.currentTime * 1000,
        leaderPlaying,
        audible: audible.has(follower.rowId),
        followerMs: media.currentTime * 1000,
        followerPaused: media.paused,
        followerSeeking: media.seeking,
        startMs: follower.startMs,
        durationMs: follower.durationMs,
        gate: follower.gate,
      })
      media.muted = action.muted
      if (action.seekMs !== null) media.currentTime = action.seekMs / 1000
      if (!action.play && !media.paused) media.pause()
      // A refused play leaves the follower paused, and the next check tries again.
      if (action.play && media.paused) media.play().catch(() => undefined)
    }
  }

  const tick = () => {
    sync()
    frame = leader.paused ? null : requestAnimationFrame(tick)
  }
  const onPlay = () => {
    if (frame === null) frame = requestAnimationFrame(tick)
  }

  copyRate()
  for (const type of SYNC_EVENTS) leader.addEventListener(type, sync)
  leader.addEventListener('play', onPlay)
  leader.addEventListener('ratechange', copyRate)
  sync()
  onPlay()

  return {
    setAudible: (rowIds, songRowId) => {
      audible = rowIds
      leader.muted = !rowIds.has(songRowId)
      sync()
    },
    destroy: () => {
      if (frame !== null) cancelAnimationFrame(frame)
      for (const type of SYNC_EVENTS) leader.removeEventListener(type, sync)
      leader.removeEventListener('play', onPlay)
      leader.removeEventListener('ratechange', copyRate)
      leader.muted = false
      for (const { media } of followers) media.pause()
    },
  }
}

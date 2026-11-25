import { describe, expect, it } from 'vitest'
import {
  audibleRows,
  DRIFT_LIMIT_MS,
  type FollowerInput,
  followerAction,
  followerTime,
  isMuted,
  SONG_ROW,
  type TrackMix,
} from './trackMix.ts'

const ROWS = [SONG_ROW, 'vocals', 'instruments']

describe('isMuted', () => {
  it('mutes each row except "Song" by default', () => {
    const mix: TrackMix = { muted: {}, soloed: [] }
    expect(ROWS.map((id) => isMuted(mix, id))).toEqual([false, true, true])
  })

  it('keeps the choice of the person', () => {
    const mix: TrackMix = { muted: { [SONG_ROW]: true, vocals: false }, soloed: [] }
    expect(ROWS.map((id) => isMuted(mix, id))).toEqual([true, false, true])
  })
})

describe('audibleRows', () => {
  // Each combination of mute and solo for three rows: 2^3 mute states times 2^3 solo states.
  const cases = Array.from({ length: 64 }, (_, index) => {
    const mutedBits = index & 7
    const soloBits = index >> 3
    const muted = Object.fromEntries(ROWS.map((id, bit) => [id, (mutedBits & (1 << bit)) !== 0]))
    const soloed = ROWS.filter((_, bit) => (soloBits & (1 << bit)) !== 0)
    const expected = soloed.length > 0 ? soloed : ROWS.filter((id) => muted[id] === false)
    return { muted, soloed, expected }
  })

  it.each(cases)(
    'sounds $expected with muted $muted and soloed $soloed',
    ({ muted, soloed, expected }) => {
      expect([...audibleRows({ muted, soloed }, ROWS)]).toEqual(expected)
    },
  )

  it('sounds only "Song" in the default state', () => {
    expect([...audibleRows({ muted: {}, soloed: [] }, ROWS)]).toEqual([SONG_ROW])
  })

  it('ignores the solo of a row that the editor does not show', () => {
    expect([...audibleRows({ muted: {}, soloed: ['singer:gone'] }, ROWS)]).toEqual([SONG_ROW])
  })
})

describe('followerTime', () => {
  it('gives the time from the start of the track', () => {
    expect(followerTime(5000, 2000, 4000)).toBe(3000)
  })

  it('gives null before the start and at the end of a range track', () => {
    expect(followerTime(1999, 2000, 4000)).toBeNull()
    expect(followerTime(6000, 2000, 4000)).toBeNull()
  })
})

describe('followerAction', () => {
  const base: FollowerInput = {
    leaderMs: 5000,
    leaderPlaying: true,
    audible: true,
    followerMs: 5000,
    followerPaused: false,
    followerSeeking: false,
    startMs: 0,
    durationMs: 10_000,
    gate: null,
  }

  it('plays with no move while the difference is inside the drift limit', () => {
    expect(followerAction({ ...base, followerMs: 5000 + DRIFT_LIMIT_MS })).toEqual({
      play: true,
      seekMs: null,
      muted: false,
    })
  })

  it('moves the follower to the song time when the difference is more than the drift limit', () => {
    expect(followerAction({ ...base, followerMs: 5000 - DRIFT_LIMIT_MS - 1 }).seekMs).toBe(5000)
  })

  it('moves a paused follower to the song time before it starts', () => {
    expect(followerAction({ ...base, followerPaused: true, followerMs: 5010 })).toMatchObject({
      play: true,
      seekMs: 5000,
    })
  })

  it('does not move a follower that is still moving', () => {
    expect(followerAction({ ...base, followerMs: 0, followerSeeking: true }).seekMs).toBeNull()
  })

  it('pauses the follower while the song audio pauses', () => {
    expect(followerAction({ ...base, leaderPlaying: false })).toEqual({
      play: false,
      seekMs: null,
      muted: false,
    })
  })

  it('pauses the follower of a row that does not sound', () => {
    expect(followerAction({ ...base, audible: false }).play).toBe(false)
  })

  it('plays a range track at the song time minus its start', () => {
    expect(
      followerAction({ ...base, startMs: 2000, durationMs: 4000, followerPaused: true }),
    ).toMatchObject({ play: true, seekMs: 3000 })
  })

  it('pauses a range track outside its range', () => {
    expect(followerAction({ ...base, startMs: 6000, durationMs: 4000 }).play).toBe(false)
  })

  it('mutes the follower outside its gate and unmutes it inside', () => {
    const gate = [{ startMs: 4000, endMs: 5000 }]
    expect(followerAction({ ...base, gate }).muted).toBe(true)
    expect(followerAction({ ...base, leaderMs: 4000, followerMs: 4000, gate }).muted).toBe(false)
  })
})

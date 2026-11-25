import { describe, expect, it } from 'vitest'
import {
  audibleRows,
  DRIFT_LIMIT_MS,
  type FollowerInput,
  followerAction,
  followerTime,
  isMuted,
  isMutePressed,
  type MixView,
  playButtonNote,
  playsText,
  rowSound,
  rowSoundText,
  SONG_MUTED_NOTE,
  SONG_ROW,
  type TrackMix,
  withMuteToggled,
  withSoloToggled,
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

/** The three states that the buttons of one row can show. */
type Pressed = 'none' | 'mute' | 'solo'

/** Each combination of the pressed buttons for three rows: 3^3 = 27 states. */
const PRESSED_CASES = Array.from({ length: 27 }, (_, index) => {
  const states = ROWS.map(
    (_, row) => (['none', 'mute', 'solo'] as const)[Math.floor(index / 3 ** row) % 3],
  )
  const mix: TrackMix = {
    muted: Object.fromEntries(ROWS.map((id, row) => [id, states[row] === 'mute'])),
    soloed: ROWS.filter((_, row) => states[row] === 'solo'),
  }
  return { states: states as Pressed[], mix }
})

const NAMES: Record<string, string> = {
  [SONG_ROW]: 'Song',
  vocals: 'Vocals',
  instruments: 'Instruments',
}
const VIEW_ROWS = ROWS.map((id) => ({ id, name: NAMES[id] ?? id }))

function view(mix: TrackMix, blocked: string[] = []): MixView {
  return { ...mix, rows: VIEW_ROWS, blocked }
}

function pressed(mix: TrackMix, id: string): Pressed {
  if (mix.soloed.includes(id)) return isMutePressed(mix, id) ? ('both' as Pressed) : 'solo'
  return isMutePressed(mix, id) ? 'mute' : 'none'
}

describe('withSoloToggled and withMuteToggled', () => {
  it.each(PRESSED_CASES)(
    'never shows "Mute" and "Solo" together after a click, from $states',
    ({ mix }) => {
      for (const id of ROWS)
        for (const next of [withMuteToggled(mix, id), withSoloToggled(mix, id)])
          for (const other of ROWS) expect(pressed(next, other)).not.toBe('both')
    },
  )

  it.each(PRESSED_CASES)(
    'makes the row sound with one click on "Solo", from $states',
    ({ mix }) => {
      for (const id of ROWS.filter((row) => !mix.soloed.includes(row))) {
        const next = withSoloToggled(mix, id)
        expect(pressed(next, id)).toBe('solo')
        expect(rowSound(view(next), id)).toEqual({ plays: true })
      }
    },
  )

  it.each(PRESSED_CASES)(
    'makes the row silent with one click on "Mute" of a sounding row, from $states',
    ({ mix }) => {
      for (const id of ROWS.filter((row) => rowSound(view(mix), row).plays)) {
        const next = withMuteToggled(mix, id)
        expect(pressed(next, id)).toBe('mute')
        expect(rowSound(view(next), id).plays).toBe(false)
      }
    },
  )

  it.each(PRESSED_CASES)('changes only the clicked row, from $states', ({ mix }) => {
    for (const id of ROWS)
      for (const next of [withMuteToggled(mix, id), withSoloToggled(mix, id)])
        for (const other of ROWS.filter((row) => row !== id))
          expect(pressed(next, other)).toBe(pressed(mix, other))
  })

  it('ends the solo and mutes the row with "Mute" on a soloed row', () => {
    expect(withMuteToggled({ muted: {}, soloed: ['vocals'] }, 'vocals')).toEqual({
      muted: { vocals: true },
      soloed: [],
    })
  })

  it('ends the solo and keeps the unmute with a second "Solo"', () => {
    const once = withSoloToggled({ muted: {}, soloed: [] }, 'vocals')
    expect(once).toEqual({ muted: { vocals: false }, soloed: ['vocals'] })
    expect(withSoloToggled(once, 'vocals')).toEqual({ muted: { vocals: false }, soloed: [] })
  })

  it('shows only "Solo" as pressed for a row with a saved mute and a saved solo', () => {
    expect(isMutePressed({ muted: { vocals: true }, soloed: ['vocals'] }, 'vocals')).toBe(false)
  })
})

describe('rowSound', () => {
  it.each(PRESSED_CASES)('follows the mute and solo rule for $states', ({ mix }) => {
    const soloRows = VIEW_ROWS.filter((row) => mix.soloed.includes(row.id)).map((row) => row.name)
    for (const id of ROWS) {
      const sound = rowSound(view(mix), id)
      if (soloRows.length > 0)
        expect(sound).toEqual(
          mix.soloed.includes(id) ? { plays: true } : { plays: false, reason: 'solo', soloRows },
        )
      else
        expect(sound).toEqual(
          mix.muted[id] === true ? { plays: false, reason: 'mute' } : { plays: true },
        )
    }
  })

  it('names the soloed row in the tooltip of a row that the solo makes silent', () => {
    const sound = rowSound(view({ muted: {}, soloed: ['vocals'] }), SONG_ROW)
    expect(rowSoundText(sound)).toBe('Silent, because "Solo" is on for Vocals.')
    const two = rowSound(view({ muted: {}, soloed: ['vocals', 'instruments', SONG_ROW] }), 'x')
    expect(rowSoundText(two)).toBe('Silent, because "Solo" is on for Song, Vocals and Instruments.')
  })

  it('gives the tooltip of a muted row, a blocked row and a row that plays', () => {
    const mix: TrackMix = { muted: { vocals: false }, soloed: [] }
    expect(rowSoundText(rowSound(view(mix), 'instruments'))).toBe('Silent, because "Mute" is on.')
    expect(rowSoundText(rowSound(view(mix, ['vocals']), 'vocals'))).toBe(
      'Silent, because the browser did not start the sound.',
    )
    expect(rowSoundText(rowSound(view(mix), 'vocals'))).toBe('Plays.')
  })

  it('sounds "Song" when the editor shows no rows', () => {
    expect(
      rowSound({ muted: { song: true }, soloed: [], rows: [], blocked: [] }, SONG_ROW),
    ).toEqual({
      plays: true,
    })
  })
})

describe('playsText and playButtonNote', () => {
  it('names the rows that sound, in the order of the rows', () => {
    expect(playsText(view({ muted: {}, soloed: [] }))).toBe('plays: Song')
    expect(playsText(view({ muted: { vocals: false }, soloed: [] }))).toBe('plays: Song, Vocals')
    expect(playsText(view({ muted: {}, soloed: ['vocals'] }))).toBe('plays: Vocals')
    expect(playsText(view({ muted: { song: true }, soloed: [] }))).toBe('plays: nothing')
    expect(playsText(view({ muted: { vocals: false }, soloed: [] }, ['vocals']))).toBe(
      'plays: Song',
    )
  })

  it('gives the play button a note only while a mute or a solo makes "Song" silent', () => {
    expect(playButtonNote(view({ muted: {}, soloed: [] }))).toBeUndefined()
    expect(playButtonNote(view({ muted: { song: true }, soloed: [] }))).toBe(SONG_MUTED_NOTE)
    expect(playButtonNote(view({ muted: {}, soloed: ['vocals'] }))).toBe(
      'The song audio is muted. See "Audio tracks".',
    )
    expect(
      playButtonNote({ muted: { song: true }, soloed: [], rows: [], blocked: [] }),
    ).toBeUndefined()
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

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveSong } from '../db.ts'
import { makeSongContent } from '../fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'
import { countMarksInRange, hasMarksInRange, replaceMarksInRange } from './replaceMarksInRange.ts'
import { deleteVoice } from './voices.ts'

const VOICE = 'song-1-voice'
const OTHER_VOICE = 'other-voice'

function mark(
  id: string,
  layer: Mark['layer'],
  startMs: number,
  endMs: number,
  parentId: string | null = null,
  voiceId = VOICE,
): Mark {
  return { id, voiceId, layer, label: id, startMs, endMs, parentId, edited: false }
}

// Two phrases of the voice, one phrase that crosses 10 s, and one phrase of another voice.
const EARLY = [
  mark('early-phrase', 'phrase', 0, 2000),
  mark('early-word', 'word', 0, 1000, 'early-phrase'),
  mark('early-phoneme', 'phoneme', 0, 500, 'early-word'),
]
const LATE = [
  mark('late-phrase', 'phrase', 12_000, 14_000),
  mark('late-word', 'word', 12_000, 13_000, 'late-phrase'),
]
const CROSSING = [mark('crossing-phrase', 'phrase', 9000, 11_000)]
const OTHER = [mark('other-phrase', 'phrase', 0, 2000, null, OTHER_VOICE)]

const NEW_MARKS = [
  mark('new-phrase', 'phrase', 500, 1500),
  mark('new-word', 'word', 500, 1500, 'new-phrase'),
]

function ids(): string[] {
  return (useSongStore.getState().current?.marks ?? []).map((m) => m.id).sort()
}

let content: SongContent

beforeEach(async () => {
  const base = makeSongContent()
  content = {
    ...base,
    song: { ...base.song, durationMs: 20_000 },
    voices: [
      ...base.voices,
      { id: OTHER_VOICE, songId: base.song.id, name: 'Harmony', order: 1, color: '#5d8de0' },
    ],
    marks: [...EARLY, ...LATE, ...CROSSING, ...OTHER],
  }
  await saveSong(content)
  await useSongStore.getState().openSong(content.song.id)
})

afterEach(() => {
  useSongStore.getState().closeSong()
})

describe('replaceMarksInRange', () => {
  it('replaces every mark of the voice for a full-song range and keeps the other voice', () => {
    replaceMarksInRange(VOICE, { startMs: 0, endMs: 20_000 }, NEW_MARKS)

    expect(ids()).toEqual(['new-phrase', 'new-word', 'other-phrase'])
  })

  it('keeps the marks outside the range and removes a crossing phrase with no word', () => {
    replaceMarksInRange(VOICE, { startMs: 0, endMs: 10_000 }, NEW_MARKS)

    expect(ids()).toEqual(['late-phrase', 'late-word', 'new-phrase', 'new-word', 'other-phrase'])
    const late = useSongStore.getState().current?.marks.filter((m) => m.id.startsWith('late'))
    expect(late).toEqual(LATE)
  })

  it('removes the children of a removed mark when a child lies outside the range', () => {
    useSongStore.getState().apply((current) => ({
      ...current,
      marks: [mark('long-word', 'word', 1000, 3000, 'early-phrase'), ...current.marks],
    }))

    replaceMarksInRange(VOICE, { startMs: 0, endMs: 2000 }, [])

    expect(ids()).not.toContain('long-word')
    expect(ids()).not.toContain('early-phoneme')
  })

  it('records the run as one undo step that restores the earlier marks, and redo applies it again', () => {
    const before = useSongStore.getState().current?.marks

    replaceMarksInRange(VOICE, { startMs: 0, endMs: 20_000 }, NEW_MARKS)
    const after = useSongStore.getState().current?.marks
    expect(useSongStore.getState().history.past).toHaveLength(1)

    useSongStore.getState().undo()
    expect(useSongStore.getState().current?.marks).toEqual(before)

    useSongStore.getState().redo()
    expect(useSongStore.getState().current?.marks).toEqual(after)
  })

  it('leaves no overlap on a layer when a phrase, a word and a phoneme cross the start of the range', () => {
    const crossing = [
      mark('cross-phrase', 'phrase', 8000, 12_000),
      mark('cross-word', 'word', 8000, 12_000, 'cross-phrase'),
      mark('cross-phoneme', 'phoneme', 8000, 12_000, 'cross-word'),
    ]
    useSongStore.getState().apply((current) => ({ ...current, marks: [...EARLY, ...crossing] }))
    const before = structuredClone(useSongStore.getState().current)
    const run = [
      mark('run-phrase', 'phrase', 10_000, 11_000),
      mark('run-word', 'word', 10_000, 11_000, 'run-phrase'),
      mark('run-phoneme', 'phoneme', 10_000, 11_000, 'run-word'),
    ]

    replaceMarksInRange(VOICE, { startMs: 10_000, endMs: 20_000 }, run)

    const after = useSongStore.getState().current?.marks ?? []
    for (const layer of ['phrase', 'word', 'phoneme'] as const) {
      const onLayer = after
        .filter((item) => item.voiceId === VOICE && item.layer === layer)
        .toSorted((a, b) => a.startMs - b.startMs)
      for (let index = 1; index < onLayer.length; index += 1)
        expect(onLayer[index - 1]?.endMs).toBeLessThanOrEqual(onLayer[index]?.startMs ?? 0)
    }
    expect(ids()).toEqual([
      'early-phoneme',
      'early-phrase',
      'early-word',
      'run-phoneme',
      'run-phrase',
      'run-word',
    ])

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toStrictEqual(before)
  })

  it('writes no mark and records no step for a voice that the person deleted', () => {
    deleteVoice(OTHER_VOICE)
    const before = useSongStore.getState().current

    const written = replaceMarksInRange(OTHER_VOICE, { startMs: 0, endMs: 20_000 }, NEW_MARKS)

    expect(written).toBe(false)
    expect(useSongStore.getState().current).toBe(before)
    expect(useSongStore.getState().history.past).toHaveLength(1)
  })

  it('returns true for a voice of the song', () => {
    expect(replaceMarksInRange(VOICE, { startMs: 0, endMs: 20_000 }, NEW_MARKS)).toBe(true)
  })

  it('records no undo step when the range has no mark and the run has no mark', () => {
    replaceMarksInRange(VOICE, { startMs: 15_000, endMs: 20_000 }, [])

    expect(useSongStore.getState().history.past).toHaveLength(0)
  })
})

describe('replaceMarksInRange with the singer voices of the last run', () => {
  const current = () => {
    const song = useSongStore.getState().current
    if (song === null) throw new Error('No song is open.')
    return song
  }
  const THIRD_VOICE = 'third-voice'
  const singers = (...voiceIds: string[]) =>
    voiceIds.map((voiceId) => ({ voiceId, removable: true }))
  const addMarksAndVoice = () =>
    useSongStore.getState().apply((song) => ({
      ...song,
      voices: [
        ...song.voices,
        { id: THIRD_VOICE, songId: song.song.id, name: 'Singer 3', order: 2, color: '#7ae582' },
      ],
      marks: [
        ...song.marks,
        mark('third-phrase', 'phrase', 3000, 4000, null, THIRD_VOICE),
        mark('other-late', 'phrase', 15_000, 16_000, null, OTHER_VOICE),
      ],
    }))

  it('clears the range on each singer voice and writes the new marks in one undo step', () => {
    addMarksAndVoice()
    const before = current()

    replaceMarksInRange(
      VOICE,
      { startMs: 0, endMs: 5000 },
      NEW_MARKS,
      singers(OTHER_VOICE, THIRD_VOICE),
    )

    expect(ids()).toEqual(
      [
        'crossing-phrase',
        'late-phrase',
        'late-word',
        'new-phrase',
        'new-word',
        'other-late',
      ].sort(),
    )
    expect(useSongStore.getState().history.past).toHaveLength(2)
    useSongStore.getState().undo()
    expect(current()).toStrictEqual(before)
  })

  it('removes a singer voice with no mark left and numbers the order of the other voices again', () => {
    addMarksAndVoice()

    replaceMarksInRange(
      VOICE,
      { startMs: 0, endMs: 5000 },
      NEW_MARKS,
      singers(OTHER_VOICE, THIRD_VOICE),
    )

    expect(current().voices.map((voice) => [voice.id, voice.order])).toEqual([
      [VOICE, 0],
      [OTHER_VOICE, 1],
    ])
  })

  it('keeps a singer voice that has marks outside the range', () => {
    addMarksAndVoice()

    replaceMarksInRange(VOICE, { startMs: 0, endMs: 5000 }, NEW_MARKS, singers(OTHER_VOICE))

    expect(current().voices.map((voice) => voice.id)).toEqual([VOICE, OTHER_VOICE, THIRD_VOICE])
    expect(ids()).toContain('third-phrase')
  })

  it('cuts a singer phrase that crosses an edge of the range by the range rules', () => {
    useSongStore.getState().apply((song) => ({
      ...song,
      marks: [
        ...song.marks.filter((item) => item.voiceId !== OTHER_VOICE),
        mark('other-phrase', 'phrase', 3000, 7000, null, OTHER_VOICE),
        mark('other-in', 'word', 3000, 4000, 'other-phrase', OTHER_VOICE),
        mark('other-out', 'word', 6000, 7000, 'other-phrase', OTHER_VOICE),
      ],
    }))

    replaceMarksInRange(VOICE, { startMs: 0, endMs: 5000 }, NEW_MARKS, singers(OTHER_VOICE))

    const other = current().marks.filter((item) => item.voiceId === OTHER_VOICE)
    expect(other.map((item) => [item.id, item.startMs, item.endMs])).toEqual([
      ['other-phrase', 6000, 7000],
      ['other-out', 6000, 7000],
    ])
  })

  it('ignores the voice of the run and an unknown id in the singer voices', () => {
    replaceMarksInRange(VOICE, { startMs: 0, endMs: 5000 }, NEW_MARKS, singers(VOICE, 'gone'))

    expect(current().voices.map((voice) => voice.id)).toEqual([VOICE, OTHER_VOICE])
    expect(ids()).toContain('other-phrase')
  })

  it('keeps a singer voice of the last run that had no mark before the step, and records no step', () => {
    useSongStore.getState().apply((song) => ({
      ...song,
      marks: song.marks.filter((item) => item.voiceId !== OTHER_VOICE),
    }))

    replaceMarksInRange(VOICE, { startMs: 15_000, endMs: 20_000 }, [], singers(OTHER_VOICE))

    expect(current().voices.map((voice) => voice.id)).toEqual([VOICE, OTHER_VOICE])
    expect(useSongStore.getState().history.past).toHaveLength(1)
  })

  it('removes a singer voice that the step empties, and the undo brings it back exactly', () => {
    addMarksAndVoice()
    useSongStore.getState().apply((song) => ({
      ...song,
      marks: song.marks.filter((item) => item.id !== 'third-phrase'),
    }))
    const before = current()

    replaceMarksInRange(
      VOICE,
      { startMs: 0, endMs: 5000 },
      NEW_MARKS,
      singers(OTHER_VOICE, THIRD_VOICE),
    )

    // The third voice had no mark before the step, so it stays. The other voice loses its marks in the range and keeps "other-late".
    expect(current().voices.map((voice) => voice.id)).toEqual([VOICE, OTHER_VOICE, THIRD_VOICE])
    replaceMarksInRange(VOICE, { startMs: 0, endMs: 20_000 }, NEW_MARKS, singers(OTHER_VOICE))
    expect(current().voices.map((voice) => voice.id)).toEqual([VOICE, THIRD_VOICE])
    useSongStore.getState().undo()
    useSongStore.getState().undo()
    expect(current()).toStrictEqual(before)
  })

  it('clears the voice of the last run in the range and keeps the voice when it becomes empty', () => {
    replaceMarksInRange(VOICE, { startMs: 0, endMs: 20_000 }, NEW_MARKS, [
      { voiceId: OTHER_VOICE, removable: false },
    ])

    expect(current().voices.map((voice) => voice.id)).toEqual([VOICE, OTHER_VOICE])
    expect(current().marks.filter((item) => item.voiceId === OTHER_VOICE)).toEqual([])
  })
})

describe('hasMarksInRange', () => {
  it('finds a mark of the voice that lies fully inside the range', () => {
    expect(hasMarksInRange(content, VOICE, { startMs: 11_000, endMs: 20_000 })).toBe(true)
  })

  it('finds a mark that only crosses the edge of the range', () => {
    expect(hasMarksInRange(content, VOICE, { startMs: 10_000, endMs: 11_500 })).toBe(true)
  })

  it('ignores a mark that only touches the edge of the range', () => {
    expect(hasMarksInRange(content, VOICE, { startMs: 14_000, endMs: 20_000 })).toBe(false)
  })

  it('ignores the marks of another voice', () => {
    expect(hasMarksInRange(content, 'third-voice', { startMs: 0, endMs: 20_000 })).toBe(false)
  })
})

describe('countMarksInRange', () => {
  it('counts the marks of the voice on each layer that overlap the range', () => {
    expect(countMarksInRange(content.marks, VOICE, { startMs: 0, endMs: 20_000 })).toBe(6)
  })

  it('counts a mark that crosses an edge and no mark that only touches it', () => {
    expect(countMarksInRange(content.marks, VOICE, { startMs: 10_000, endMs: 12_000 })).toBe(1)
  })

  it('counts no mark of another voice', () => {
    expect(countMarksInRange(content.marks, OTHER_VOICE, { startMs: 5000, endMs: 20_000 })).toBe(0)
  })

  it('gives a count above 0 exactly when hasMarksInRange is true', () => {
    for (const range of [
      { startMs: 0, endMs: 20_000 },
      { startMs: 14_000, endMs: 20_000 },
      { startMs: 2000, endMs: 9000 },
    ])
      expect(countMarksInRange(content.marks, VOICE, range) > 0).toBe(
        hasMarksInRange(content, VOICE, range),
      )
  })
})

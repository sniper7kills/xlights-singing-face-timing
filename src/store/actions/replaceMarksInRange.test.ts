import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveSong } from '../db.ts'
import { makeSongContent } from '../fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'
import { hasMarksInRange, replaceMarksInRange } from './replaceMarksInRange.ts'

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

  it('keeps the marks outside the range and the marks that cross its edge', () => {
    replaceMarksInRange(VOICE, { startMs: 0, endMs: 10_000 }, NEW_MARKS)

    expect(ids()).toEqual([
      'crossing-phrase',
      'late-phrase',
      'late-word',
      'new-phrase',
      'new-word',
      'other-phrase',
    ])
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

  it('records no undo step when the range has no mark and the run has no mark', () => {
    replaceMarksInRange(VOICE, { startMs: 15_000, endMs: 20_000 }, [])

    expect(useSongStore.getState().history.past).toHaveLength(0)
  })
})

describe('hasMarksInRange', () => {
  it('finds a mark of the voice that lies fully inside the range', () => {
    expect(hasMarksInRange(content, VOICE, { startMs: 11_000, endMs: 20_000 })).toBe(true)
  })

  it('ignores a mark that crosses the edge of the range', () => {
    expect(hasMarksInRange(content, VOICE, { startMs: 10_000, endMs: 11_500 })).toBe(false)
  })

  it('ignores the marks of another voice', () => {
    expect(hasMarksInRange(content, 'third-voice', { startMs: 0, endMs: 20_000 })).toBe(false)
  })
})

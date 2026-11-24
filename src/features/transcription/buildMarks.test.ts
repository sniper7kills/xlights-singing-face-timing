import { describe, expect, it } from 'vitest'
import type { Mark } from '../../store/types.ts'
import { buildMarks, wordLabel } from './buildMarks.ts'
import type { AlignedPhrase, AlignedWord } from './types.ts'

function word(text: string, startMs: number, endMs: number, estimated = false): AlignedWord {
  return { text, startMs, endMs, estimated }
}

function phrase(...words: AlignedWord[]): AlignedPhrase {
  return {
    text: words.map((w) => w.text).join(' '),
    startMs: words[0]?.startMs ?? 0,
    endMs: words.at(-1)?.endMs ?? 0,
    words,
  }
}

const SONG = { startMs: 0, endMs: 60_000 }

const wordsOf = (marks: Mark[]) => marks.filter((mark) => mark.layer === 'word')
const phrasesOf = (marks: Mark[]) => marks.filter((mark) => mark.layer === 'phrase')
const times = (marks: Mark[]) => marks.map((mark) => [mark.startMs, mark.endMs])

describe('wordLabel', () => {
  it('removes the characters . , ! ? ; : " ( ) [ ]', () => {
    expect(wordLabel('"(night),.!?;:[x]"')).toBe('nightx')
  })

  it('keeps apostrophes and hyphens inside a word', () => {
    expect(wordLabel("don't")).toBe("don't")
    expect(wordLabel('well-known,')).toBe('well-known')
  })

  it('removes an apostrophe or a hyphen at the edge of a word', () => {
    expect(wordLabel("'Round")).toBe('Round')
    expect(wordLabel('night-')).toBe('night')
  })

  it('keeps the letter case of the text', () => {
    expect(wordLabel('Holy')).toBe('Holy')
    expect(wordLabel('SLEEP')).toBe('SLEEP')
  })

  it('returns an empty label for a word with no letter or digit', () => {
    expect(wordLabel('--')).toBe('')
    expect(wordLabel('...')).toBe('')
  })
})

describe('buildMarks', () => {
  it('creates a phrase and one word mark for each word, on the voice', () => {
    const marks = buildMarks(
      [phrase(word('Silent', 100, 600), word('night,', 700, 1200))],
      'voice-1',
      50,
      SONG,
    )

    expect(marks.map((mark) => [mark.layer, mark.label])).toEqual([
      ['phrase', 'Silent night,'],
      ['word', 'Silent'],
      ['word', 'night'],
    ])
    expect(marks.every((mark) => mark.voiceId === 'voice-1' && !mark.edited)).toBe(true)
  })

  it('gives each mark a new UUID and each word its phrase as the parent', () => {
    const marks = buildMarks(
      [phrase(word('Silent', 100, 600)), phrase(word('holy', 1000, 1500))],
      'voice-1',
      50,
      SONG,
    )

    const [first, second] = phrasesOf(marks)
    expect(new Set(marks.map((mark) => mark.id)).size).toBe(4)
    expect(first?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(first?.parentId).toBeNull()
    expect(wordsOf(marks).map((mark) => mark.parentId)).toEqual([first?.id, second?.id])
  })

  it('removes an overlap across two phrases', () => {
    const marks = buildMarks(
      [phrase(word('night', 100, 900)), phrase(word('holy', 800, 1200))],
      'voice-1',
      50,
      SONG,
    )

    expect(times(phrasesOf(marks))).toEqual([
      [100, 800],
      [800, 1200],
    ])
  })

  it('starts a phrase at its first word and ends it at its last word', () => {
    const marks = buildMarks(
      [{ ...phrase(word('Silent', 112, 600), word('night', 700, 1190)), startMs: 0, endMs: 5000 }],
      'voice-1',
      50,
      SONG,
    )

    expect(times(phrasesOf(marks))).toEqual([[100, 1200]])
  })

  it('copies estimated from each aligned word to its word mark', () => {
    const marks = buildMarks(
      [phrase(word('Silent', 100, 600), word('night', 700, 1200, true))],
      'voice-1',
      50,
      SONG,
    )

    expect(wordsOf(marks).map((mark) => mark.estimated)).toEqual([false, true])
    expect(phrasesOf(marks)[0]).not.toHaveProperty('estimated')
  })

  it('drops a word with no letter or digit and a phrase with no word left', () => {
    const marks = buildMarks(
      [phrase(word('Silent', 100, 600), word('--', 600, 700)), phrase(word('...', 800, 900))],
      'voice-1',
      50,
      SONG,
    )

    expect(marks.map((mark) => mark.label)).toEqual(['Silent --', 'Silent'])
  })

  it('keeps every mark inside a range that starts and ends between two frames', () => {
    const marks = buildMarks(
      [phrase(word('Silent', 1010, 1500, true), word('night', 1500, 1990, true))],
      'voice-1',
      50,
      { startMs: 1010, endMs: 1990 },
    )

    expect(times(phrasesOf(marks))).toEqual([[1050, 1950]])
    expect(times(wordsOf(marks))).toEqual([
      [1050, 1500],
      [1500, 1950],
    ])
  })

  it('gives no mark to a phrase whose words do not fit in the range', () => {
    const marks = buildMarks(
      [phrase(word('Silent', 1000, 1050, true)), phrase(word('night', 1050, 1100, true))],
      'voice-1',
      50,
      { startMs: 1000, endMs: 1050 },
    )

    expect(marks.map((mark) => [mark.layer, mark.label])).toEqual([
      ['phrase', 'Silent'],
      ['word', 'Silent'],
    ])
  })

  it('returns no mark for no phrase', () => {
    expect(buildMarks([], 'voice-1', 50, SONG)).toEqual([])
  })
})

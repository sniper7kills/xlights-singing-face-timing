import { describe, expect, it } from 'vitest'
import { fitWords, wordRoom } from './fitWords.ts'

const SONG = { startMs: 0, endMs: 60_000 }

function fit(words: [number, number][], frameMs: number, range = SONG): [number, number][] {
  const fitted = fitWords(
    words.map(([startMs, endMs]) => ({ startMs, endMs })),
    frameMs,
    range,
  )
  return fitted.map((word) => [word.startMs, word.endMs])
}

describe('fitWords', () => {
  it('snaps every time to the nearest multiple of the frame size', () => {
    expect(fit([[112.4, 587.4]], 25)).toEqual([[100, 575]])
  })

  it('keeps the other fields of each word', () => {
    const fitted = fitWords([{ label: 'night', startMs: 100, endMs: 600 }], 50, SONG)

    expect(fitted).toEqual([{ label: 'night', startMs: 100, endMs: 600 }])
  })

  it('extends a word that is shorter than one frame size to one frame size', () => {
    expect(fit([[1000, 1000]], 50)).toEqual([[1000, 1050]])
  })

  it('moves the next word when an extended word reaches it', () => {
    expect(
      fit(
        [
          [1000, 1000],
          [1000, 1000],
          [1000, 1200],
        ],
        50,
      ),
    ).toEqual([
      [1000, 1050],
      [1050, 1100],
      [1100, 1200],
    ])
  })

  it('ends the earlier word where the later word starts when two words overlap', () => {
    expect(
      fit(
        [
          [100, 900],
          [700, 1200],
        ],
        50,
      ),
    ).toEqual([
      [100, 700],
      [700, 1200],
    ])
  })

  it('ends the last word at the last frame multiple at or before the end of the range', () => {
    expect(fit([[1500, 1990]], 50, { startMs: 1000, endMs: 1990 })).toEqual([[1500, 1950]])
  })

  it('starts the first word at the first frame multiple at or after the start of the range', () => {
    expect(fit([[1010, 1500]], 50, { startMs: 1010, endMs: 2000 })).toEqual([[1050, 1500]])
  })

  it('keeps the times of a range whose two ends are frame multiples', () => {
    expect(fit([[1000, 2000]], 50, { startMs: 1000, endMs: 2000 })).toEqual([[1000, 2000]])
  })

  it('moves a word that starts after the range into the last frame of the range', () => {
    expect(fit([[2400, 2600]], 50, { startMs: 1000, endMs: 2000 })).toEqual([[1950, 2000]])
  })

  it('moves a word that ends before the range into the first frame of the range', () => {
    expect(fit([[200, 400]], 50, { startMs: 1000, endMs: 2000 })).toEqual([[1000, 1050]])
  })

  it('moves the words before a word that the end of the range moves back', () => {
    expect(
      fit(
        [
          [1900, 1950],
          [1950, 2000],
          [2000, 2050],
        ],
        50,
        { startMs: 1000, endMs: 2000 },
      ),
    ).toEqual([
      [1850, 1900],
      [1900, 1950],
      [1950, 2000],
    ])
  })

  it('keeps only the earliest words that fit when the range is too short for all words', () => {
    const fitted = fitWords(
      [
        { label: 'a', startMs: 1000, endMs: 1030 },
        { label: 'b', startMs: 1030, endMs: 1060 },
        { label: 'c', startMs: 1060, endMs: 1100 },
      ],
      50,
      { startMs: 1000, endMs: 1100 },
    )

    expect(fitted).toEqual([
      { label: 'a', startMs: 1000, endMs: 1050 },
      { label: 'b', startMs: 1050, endMs: 1100 },
    ])
  })

  it('returns no word for a range that holds no frame', () => {
    expect(fit([[1010, 1040]], 50, { startMs: 1010, endMs: 1040 })).toEqual([])
  })

  it('returns no word for no word', () => {
    expect(fit([], 50)).toEqual([])
  })
})

describe('wordRoom', () => {
  it('gives one word for each frame of the range', () => {
    expect(wordRoom(50, { startMs: 0, endMs: 28_900 })).toBe(578)
  })

  it('counts only the frames inside the range', () => {
    expect(wordRoom(50, { startMs: 1010, endMs: 2040 })).toBe(19)
  })

  it('gives 0 for a range shorter than one frame', () => {
    expect(wordRoom(50, { startMs: 1010, endMs: 1040 })).toBe(0)
  })
})

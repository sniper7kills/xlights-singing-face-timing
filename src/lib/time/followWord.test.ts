import { describe, expect, it } from 'vitest'
import { followWord } from './followWord.ts'

const word = { startMs: 1000, endMs: 1600 }
const phonemes = [
  { label: 'etc', startMs: 1000, endMs: 1100 },
  { label: 'AI', startMs: 1100, endMs: 1400 },
  { label: 'L', startMs: 1400, endMs: 1600 },
]

const times = (list: readonly { startMs: number; endMs: number }[]) =>
  list.map((phoneme) => [phoneme.startMs, phoneme.endMs])

describe('followWord', () => {
  it('moves each phoneme by the same amount as a word that keeps its length', () => {
    const moved = followWord(phonemes, word, { startMs: 2000, endMs: 2600 }, 50)

    expect(times(moved)).toEqual([
      [2000, 2100],
      [2100, 2400],
      [2400, 2600],
    ])
    expect(moved.map((phoneme) => phoneme.label)).toEqual(['etc', 'AI', 'L'])
  })

  it('scales the phonemes in proportion when the word doubles its length', () => {
    const scaled = followWord(phonemes, word, { startMs: 1000, endMs: 2200 }, 50)

    expect(times(scaled)).toEqual([
      [1000, 1200],
      [1200, 1800],
      [1800, 2200],
    ])
  })

  it('snaps each boundary of a scaled word to the frame size', () => {
    const scaled = followWord(phonemes, word, { startMs: 1000, endMs: 1450 }, 50)

    expect(times(scaled)).toEqual([
      [1000, 1100],
      [1100, 1300],
      [1300, 1450],
    ])
    expect(scaled.flatMap(({ startMs, endMs }) => [startMs % 50, endMs % 50])).toEqual(
      Array(6).fill(0),
    )
  })

  it('keeps one frame size for each phoneme of a word that gets short', () => {
    const scaled = followWord(phonemes, word, { startMs: 1000, endMs: 1150 }, 50)

    expect(times(scaled)).toEqual([
      [1000, 1050],
      [1050, 1100],
      [1100, 1150],
    ])
  })

  it('returns the phonemes in time order and keeps their other fields', () => {
    const scaled = followWord([...phonemes].reverse(), word, { startMs: 500, endMs: 1700 }, 50)

    expect(scaled.map((phoneme) => phoneme.label)).toEqual(['etc', 'AI', 'L'])
    expect(times(scaled)).toEqual([
      [500, 700],
      [700, 1300],
      [1300, 1700],
    ])
  })
})

import { describe, expect, it } from 'vitest'
import type { PhonemeLabel } from './cmuSymbols.ts'
import { spread, type SpreadPhoneme } from './spread.ts'

function boundaries(phonemes: SpreadPhoneme[]): number[] {
  return phonemes.flatMap((phoneme) => [phoneme.startMs, phoneme.endMs])
}

describe('spread', () => {
  it("puts the boundaries of ['etc','AI','L','O'] over 0 to 900 at 0, 100, 400, 600, 900", () => {
    expect(spread(['etc', 'AI', 'L', 'O'], 0, 900, 50)).toEqual([
      { label: 'etc', startMs: 0, endMs: 100 },
      { label: 'AI', startMs: 100, endMs: 400 },
      { label: 'L', startMs: 400, endMs: 600 },
      { label: 'O', startMs: 600, endMs: 900 },
    ])
  })

  it('returns only boundaries that are multiples of the frame size', () => {
    const labels: PhonemeLabel[] = ['MBP', 'E', 'etc', 'WQ', 'U', 'FV', 'L']
    const words: [number, number][] = [
      [13, 487],
      [1003, 1777],
      [250, 395],
      [0, 3333],
    ]
    for (const frameMs of [25, 50]) {
      for (const [startMs, endMs] of words) {
        for (const boundary of boundaries(spread(labels, startMs, endMs, frameMs))) {
          expect(boundary % frameMs).toBe(0)
        }
      }
    }
  })

  it('fills the word with no gap from its snapped start to its snapped end', () => {
    const phonemes = spread(['etc', 'AI', 'etc'], 1012, 1488, 25)

    expect(phonemes.at(0)?.startMs).toBe(1000)
    expect(phonemes.at(-1)?.endMs).toBe(1500)
    expect(phonemes.slice(1).map((phoneme) => phoneme.startMs)).toEqual(
      phonemes.slice(0, -1).map((phoneme) => phoneme.endMs),
    )
  })

  it('gives each phoneme one frame size or more', () => {
    const phonemes = spread(['etc', 'O', 'etc', 'E'], 0, 200, 50)

    expect(phonemes).toHaveLength(4)

    for (const phoneme of phonemes)
      expect(phoneme.endMs - phoneme.startMs).toBeGreaterThanOrEqual(50)
  })

  it('keeps the highest weight, earliest on a tie, for a word of one frame size with 4 phonemes', () => {
    expect(spread(['etc', 'AI', 'L', 'O'], 0, 50, 50)).toEqual([
      { label: 'AI', startMs: 0, endMs: 50 },
    ])
  })

  it('drops the phonemes with weight 1 from the end of the word first', () => {
    expect(
      spread(['MBP', 'AI', 'FV', 'L', 'etc'], 0, 150, 50).map((phoneme) => phoneme.label),
    ).toEqual(['MBP', 'AI', 'L'])
  })

  it('drops a phoneme with weight 2 when no phoneme with weight 1 is left', () => {
    expect(spread(['WQ', 'AI', 'L'], 0, 100, 50).map((phoneme) => phoneme.label)).toEqual([
      'WQ',
      'AI',
    ])
  })

  it('merges adjacent equal labels after a drop', () => {
    expect(spread(['AI', 'etc', 'AI', 'O'], 0, 150, 50).map((phoneme) => phoneme.label)).toEqual([
      'AI',
      'O',
    ])
  })

  it('gives a word shorter than one frame size one phoneme of one frame size', () => {
    expect(spread(['etc', 'AI'], 110, 120, 50)).toEqual([{ label: 'AI', startMs: 100, endMs: 150 }])
  })

  it('returns no phonemes for no labels', () => {
    expect(spread([], 0, 500, 50)).toEqual([])
  })
})

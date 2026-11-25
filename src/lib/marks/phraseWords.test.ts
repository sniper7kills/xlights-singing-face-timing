import { describe, expect, it } from 'vitest'
import type { TimeRange } from '../time/timeRange.ts'
import { layoutPhraseWords } from './phraseWords.ts'

const FRAME = 50

function r(startMs: number, endMs: number): TimeRange {
  return { startMs, endMs }
}

function pairs(ranges: TimeRange[]): number[][] {
  return ranges.map((range) => [range.startMs, range.endMs])
}

describe('layoutPhraseWords', () => {
  it('keeps matched words and shares the free time between them evenly', () => {
    const out = layoutPhraseWords(
      [r(0, 500), undefined, undefined, r(1000, 1500)],
      r(0, 1500),
      FRAME,
    )

    expect(pairs(out)).toEqual([
      [0, 500],
      [500, 750],
      [750, 1000],
      [1000, 1500],
    ])
  })

  it('gives each new word of the demo phrase 3 frames from the words before them', () => {
    // "All is calm, all is bright" becomes "All is calm and all is bright tonight".
    const matched = [
      r(9800, 11250),
      r(11250, 11950),
      r(11950, 14250),
      undefined,
      r(14300, 15750),
      r(15750, 16550),
      r(16550, 18700),
      undefined,
    ]

    const out = layoutPhraseWords(matched, r(9800, 18700), FRAME)

    expect(pairs(out)).toEqual([
      [9800, 11250],
      [11250, 11950],
      [11950, 14150],
      [14150, 14300],
      [14300, 15750],
      [15750, 16550],
      [16550, 18550],
      [18550, 18700],
    ])
  })

  it('takes time from the word after the run when the word before keeps only 3 frames', () => {
    const out = layoutPhraseWords([r(0, 150), undefined, r(150, 1000)], r(0, 1000), FRAME)

    expect(pairs(out)).toEqual([
      [0, 150],
      [150, 300],
      [300, 1000],
    ])
  })

  it('takes time from the word after a run at the start of the phrase', () => {
    const out = layoutPhraseWords([undefined, undefined, r(0, 1000)], r(0, 1000), FRAME)

    expect(pairs(out)).toEqual([
      [0, 150],
      [150, 300],
      [300, 1000],
    ])
  })

  it('takes neighbour time down to 1 frame before it shares the phrase', () => {
    // Each run must leave the 3-frame neighbours at 1 frame, because the phrase has room for 3 frames each.
    const matched = [r(0, 150), undefined, r(150, 300), undefined, undefined, r(300, 450)]

    const out = layoutPhraseWords(matched, r(0, 900), FRAME)

    expect(out.every((range) => range.endMs - range.startMs >= FRAME)).toBe(true)
    expect(out.every((range, i) => i === 0 || range.startMs >= (out[i - 1]?.endMs ?? 0))).toBe(true)
  })

  it('gives every word an equal share when the phrase has less than 3 frames for each word', () => {
    const out = layoutPhraseWords([r(0, 200), undefined, r(200, 400)], r(0, 400), FRAME)

    expect(pairs(out)).toEqual([
      [0, 100],
      [100, 250],
      [250, 400],
    ])
  })

  it('gives every word an equal share when a run cannot get 1 frame for each word', () => {
    // The phrase has 3 frames for each word, but the matched words hold the room away from the run.
    const matched = [r(0, 50), undefined, undefined, r(50, 100), r(100, 900)]

    const out = layoutPhraseWords(matched, r(0, 900), FRAME)

    expect(out).toHaveLength(5)
    expect(out.every((range) => range.endMs - range.startMs >= FRAME)).toBe(true)
  })

  it('keeps only the first words when the phrase has fewer frames than words', () => {
    const out = layoutPhraseWords([undefined, undefined, undefined], r(0, 100), FRAME)

    expect(pairs(out)).toEqual([
      [0, 50],
      [50, 100],
    ])
  })
})

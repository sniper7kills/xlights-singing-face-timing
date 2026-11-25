import { describe, expect, it } from 'vitest'
import {
  phraseRangesOf,
  rangesOfSingers,
  singersOfVoices,
  singerVoiceRanges,
} from './singerRanges.ts'

describe('singerVoiceRanges', () => {
  it('gives each singer to the voice whose phrases share the most time with its ranges', () => {
    const ranges = singerVoiceRanges(
      [
        { startMs: 0, endMs: 1000, singer: 3 },
        { startMs: 2000, endMs: 3000, singer: 1 },
        { startMs: 4000, endMs: 5000, singer: 3 },
      ],
      [
        {
          voiceId: 'lead',
          phrases: [
            { startMs: 0, endMs: 1200 },
            { startMs: 4000, endMs: 5000 },
          ],
        },
        { voiceId: 'second', phrases: [{ startMs: 1900, endMs: 3100 }] },
      ],
    )
    expect(Object.fromEntries(ranges)).toEqual({
      lead: [
        { startMs: 0, endMs: 1000 },
        { startMs: 4000, endMs: 5000 },
      ],
      second: [{ startMs: 2000, endMs: 3000 }],
    })
  })

  it('joins the ranges of two singers on one voice', () => {
    const ranges = singerVoiceRanges(
      [
        { startMs: 0, endMs: 1000, singer: 0 },
        { startMs: 800, endMs: 1500, singer: 2 },
      ],
      [{ voiceId: 'lead', phrases: [{ startMs: 0, endMs: 2000 }] }],
    )
    expect(ranges.get('lead')).toEqual([{ startMs: 0, endMs: 1500 }])
  })

  it('gives a singer with no shared time to no voice', () => {
    const ranges = singerVoiceRanges(
      [{ startMs: 5000, endMs: 6000, singer: 0 }],
      [{ voiceId: 'lead', phrases: [{ startMs: 0, endMs: 1000 }] }],
    )
    expect(ranges.size).toBe(0)
  })

  it('gives a tie to the earlier voice', () => {
    const ranges = singerVoiceRanges(
      [{ startMs: 0, endMs: 1000, singer: 0 }],
      [
        { voiceId: 'first', phrases: [{ startMs: 0, endMs: 500 }] },
        { voiceId: 'second', phrases: [{ startMs: 500, endMs: 1000 }] },
      ],
    )
    expect([...ranges.keys()]).toEqual(['first'])
  })

  it('gives each singer the voice of its part after the singer step divides a phrase', () => {
    // The singer step of issue #148 divides the phrase 0 to 4000 ms at 2000 ms and moves the second part.
    const ranges = singerVoiceRanges(
      [
        { startMs: 0, endMs: 2100, singer: 1 },
        { startMs: 1900, endMs: 4000, singer: 0 },
      ],
      [
        { voiceId: 'lead', phrases: [{ startMs: 0, endMs: 2000 }] },
        { voiceId: 'second', phrases: [{ startMs: 2000, endMs: 4000 }] },
      ],
    )
    expect(Object.fromEntries(ranges)).toEqual({
      lead: [{ startMs: 0, endMs: 2100 }],
      second: [{ startMs: 1900, endMs: 4000 }],
    })
  })
})

describe('singersOfVoices', () => {
  it('gives each voice the singer numbers of the search, from the lowest', () => {
    const singers = singersOfVoices(
      [
        { startMs: 4000, endMs: 5000, singer: 3 },
        { startMs: 2000, endMs: 3000, singer: 1 },
        { startMs: 0, endMs: 1000, singer: 0 },
      ],
      [
        {
          voiceId: 'lead',
          phrases: [
            { startMs: 0, endMs: 1000 },
            { startMs: 4000, endMs: 5000 },
          ],
        },
        { voiceId: 'second', phrases: [{ startMs: 2000, endMs: 3000 }] },
      ],
    )
    expect(Object.fromEntries(singers)).toEqual({ lead: [0, 3], second: [1] })
  })
})

describe('rangesOfSingers', () => {
  it('keeps the ranges of the singers only, sorted and joined', () => {
    const segments = [
      { startMs: 3000, endMs: 4000, singer: 2 },
      { startMs: 0, endMs: 1000, singer: 0 },
      { startMs: 900, endMs: 2000, singer: 2 },
      { startMs: 500, endMs: 600, singer: 1 },
    ]
    expect(rangesOfSingers(segments, [0, 2])).toEqual([
      { startMs: 0, endMs: 2000 },
      { startMs: 3000, endMs: 4000 },
    ])
    expect(rangesOfSingers(segments, [])).toEqual([])
  })
})

describe('phraseRangesOf', () => {
  it('gives the phrases of the voice that overlap the range', () => {
    const marks = [
      { voiceId: 'a', layer: 'phrase', startMs: 0, endMs: 1000 },
      { voiceId: 'a', layer: 'word', startMs: 0, endMs: 500 },
      { voiceId: 'b', layer: 'phrase', startMs: 0, endMs: 1000 },
      { voiceId: 'a', layer: 'phrase', startMs: 2000, endMs: 3000 },
    ]
    expect(phraseRangesOf(marks, 'a', { startMs: 500, endMs: 2000 })).toEqual([
      { startMs: 0, endMs: 1000 },
    ])
  })
})

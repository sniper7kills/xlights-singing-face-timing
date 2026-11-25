import { describe, expect, it } from 'vitest'
import { singerVoiceRanges } from './singerRanges.ts'

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
})

import { describe, expect, it } from 'vitest'
import {
  type DiagnosticSettings,
  distanceSummary,
  finalSingers,
  groupFates,
  joinReasonText,
} from './diagnostics.ts'

describe('groupFates', () => {
  // Five raw groups. Group 3 joins group 0 when small groups join. Group 4 joins group 1 at the cap.
  // Group 2 joins group 0 when short singers join.
  const stages = {
    merged: [0, 1, 2, 3, 4],
    joinedSmall: [0, 1, 2, 0, 4],
    capped: [0, 1, 2, 0, 1],
    folded: [0, 1, 0, 0, 1],
  }
  const rawSungMs = [1000, 500.4, 300, 100, 50]
  const singerOf = (folded: number) => (folded === 0 ? 5 : folded === 1 ? 6 : undefined)
  const fates = groupFates(stages, rawSungMs, singerOf, 'share')

  it('keeps the group with the most sung time of each final group', () => {
    expect(fates[0]?.fate).toEqual({ kind: 'kept', singer: 5 })
    expect(fates[1]?.fate).toEqual({ kind: 'kept', singer: 6 })
  })

  it('gives the reason small-group to a group that joined at the small-group stage', () => {
    expect(fates[3]?.fate).toEqual({ kind: 'joined', into: 0, reason: 'small-group' })
  })

  it('gives the reason cap to a group that joined at the cap stage', () => {
    expect(fates[4]?.fate).toEqual({ kind: 'joined', into: 1, reason: 'cap' })
  })

  it('gives the fold reason to a group that joined at the fold stage', () => {
    expect(fates[2]?.fate).toEqual({ kind: 'joined', into: 0, reason: 'share' })
    expect(groupFates(stages, rawSungMs, singerOf, 'time')[2]?.fate).toEqual({
      kind: 'joined',
      into: 0,
      reason: 'time',
    })
  })

  it('gives singer null to a kept group with no singer number', () => {
    const none = groupFates(stages, rawSungMs, () => undefined, 'time')
    expect(none[0]?.fate).toEqual({ kind: 'kept', singer: null })
  })

  it('counts the embeddings of each group', () => {
    const counted = groupFates(
      { merged: [0, 0, 1], joinedSmall: [0, 0, 1], capped: [0, 0, 1], folded: [0, 0, 1] },
      [10, 20],
      (folded) => folded,
      'time',
    )
    expect(counted.map((group) => group.embeddingCount)).toEqual([2, 1])
  })

  it('rounds the sung time to whole milliseconds', () => {
    expect(fates.map((group) => group.sungMs)).toEqual([1000, 500, 300, 100, 50])
  })
})

describe('finalSingers', () => {
  it('sums the sung time and counts the ranges of each singer, sorted by singer', () => {
    expect(
      finalSingers([
        { startMs: 0, endMs: 100, singer: 1 },
        { startMs: 100, endMs: 400, singer: 0 },
        { startMs: 500, endMs: 750, singer: 1 },
      ]),
    ).toEqual([
      { singer: 0, sungMs: 300, rangeCount: 1 },
      { singer: 1, sungMs: 350, rangeCount: 2 },
    ])
  })

  it('gives an empty list for no range', () => {
    expect(finalSingers([])).toEqual([])
  })
})

describe('distanceSummary', () => {
  it('gives null for no distance', () => {
    expect(distanceSummary([])).toBeNull()
  })

  it('gives the middle value as the median of an odd count', () => {
    expect(distanceSummary([0.9, 0.1, 0.5])).toEqual({ min: 0.1, median: 0.5, max: 0.9 })
  })

  it('gives the mean of the two middle values as the median of an even count', () => {
    expect(distanceSummary([0.2, 0.8, 0.4, 0.6])).toEqual({ min: 0.2, median: 0.5, max: 0.8 })
  })

  it('rounds each value to 3 decimals', () => {
    expect(distanceSummary([0.123456, 0.987654])).toEqual({ min: 0.123, median: 0.556, max: 0.988 })
  })
})

describe('joinReasonText', () => {
  const settings: DiagnosticSettings = {
    threshold: 0.7,
    minGroupSize: 12,
    maxSingers: 8,
    minSingerShare: 0.05,
    minSingerMs: 3000,
  }

  it.each([
    ['small-group', 'fewer than 12 embeddings'],
    ['cap', 'over the highest count'],
    ['share', 'under 5% of the sung time'],
    ['time', 'under 3 seconds'],
  ] as const)('gives the text of the reason %s', (reason, text) => {
    expect(joinReasonText(reason, settings)).toBe(text)
  })
})

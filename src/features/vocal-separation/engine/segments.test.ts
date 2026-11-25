import { describe, expect, it } from 'vitest'
import { addSegment, planSegments } from './segments.ts'

describe('planSegments', () => {
  it('gives one short segment for audio shorter than a segment', () => {
    expect(planSegments(7, 10, 4)).toEqual([{ start: 0, length: 7 }])
  })

  it('starts each next segment one overlap before the end of the previous segment', () => {
    expect(planSegments(20, 10, 4)).toEqual([
      { start: 0, length: 10 },
      { start: 6, length: 10 },
      { start: 12, length: 8 },
    ])
  })

  it('gives no segment for empty audio', () => {
    expect(planSegments(0, 10, 4)).toEqual([])
  })

  it('throws a RangeError when the overlap is not less than the segment length', () => {
    expect(() => planSegments(20, 4, 4)).toThrow(RangeError)
  })
})

describe('addSegment', () => {
  it('gives back a constant input after the cross-fade of all segments', () => {
    const total = 23
    const output = new Float32Array(total)
    for (const segment of planSegments(total, 10, 4)) {
      addSegment(output, new Float32Array(10).fill(0.5), segment, 4, total)
    }
    output.forEach((value) => expect(value).toBeCloseTo(0.5, 6))
  })

  it('fades out the end of a segment that has a next segment', () => {
    const output = new Float32Array(20)
    addSegment(output, new Float32Array(10).fill(1), { start: 0, length: 10 }, 4, 20)
    expect(Array.from(output.subarray(0, 10))).toEqual([
      1, 1, 1, 1, 1, 1, 0.875, 0.625, 0.375, 0.125,
    ])
  })

  it('fades in the start of a segment that has a previous segment', () => {
    const output = new Float32Array(16)
    addSegment(output, new Float32Array(10).fill(1), { start: 6, length: 10 }, 4, 16)
    expect(Array.from(output.subarray(6, 10))).toEqual([0.125, 0.375, 0.625, 0.875])
    expect(output[15]).toBe(1)
  })
})

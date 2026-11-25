import { describe, expect, it } from 'vitest'
import { planWindows, windowSamplesAt } from './windows.ts'

describe('planWindows', () => {
  it('starts each window one step after the previous one and ends the last window at the end', () => {
    expect(planWindows(25, 10, 5)).toEqual([0, 5, 10, 15])
  })

  it('moves the last window back so that it ends at the end of the audio', () => {
    expect(planWindows(23, 10, 5)).toEqual([0, 5, 10, 13])
  })

  it('gives one window at 0 for audio shorter than one window', () => {
    expect(planWindows(4, 10, 5)).toEqual([0])
  })

  it('gives one window at 0 for empty audio', () => {
    expect(planWindows(0, 10, 5)).toEqual([0])
  })

  it('throws a RangeError for a step of 0 or a step longer than the window', () => {
    expect(() => planWindows(25, 10, 0)).toThrow(RangeError)
    expect(() => planWindows(25, 10, 11)).toThrow(RangeError)
  })
})

describe('windowSamplesAt', () => {
  it('copies the samples of the window', () => {
    const audio = Float32Array.from([1, 2, 3, 4, 5])
    expect([...windowSamplesAt(audio, 1, 3)]).toEqual([2, 3, 4])
  })

  it('pads the window with zeros past the end of the audio', () => {
    const audio = Float32Array.from([1, 2])
    expect([...windowSamplesAt(audio, 0, 4)]).toEqual([1, 2, 0, 0])
  })
})

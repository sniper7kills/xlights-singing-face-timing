import { describe, expect, it } from 'vitest'
import {
  hasSound,
  LOUDNESS_WINDOW_MS,
  MIN_LOUDNESS,
  soundWords,
  loudnessLimit,
  windowLoudness,
} from './trackLoudness.ts'

const RATE = 16_000
const WINDOW = (RATE * LOUDNESS_WINDOW_MS) / 1000

/** Returns a track of `seconds` with the value `value` from `fromMs` to `toMs` and 0 in all other parts. */
function track(seconds: number, fromMs: number, toMs: number, value = 0.5): Float32Array {
  const samples = new Float32Array(seconds * RATE)
  samples.fill(value, (fromMs / 1000) * RATE, (toMs / 1000) * RATE)
  return samples
}

const word = (startMs: number, endMs: number) => ({ text: 'night', startMs, endMs })

describe('windowLoudness', () => {
  it('gives the root mean square of each 50 ms window, with a shorter last window', () => {
    const samples = new Float32Array(2 * WINDOW + 10)
    samples.fill(0.5, 0, WINDOW)
    samples.fill(-0.25, WINDOW)

    const loudness = windowLoudness(samples, RATE)

    expect(Array.from(loudness)).toEqual([0.5, 0.25, 0.25])
  })

  it('gives no window for a track with no samples', () => {
    expect(windowLoudness(new Float32Array(0), RATE)).toHaveLength(0)
  })
})

describe('loudnessLimit', () => {
  it('gives 1% of the loudest window of all tracks', () => {
    expect(loudnessLimit([Float32Array.of(0.1, 0.2), Float32Array.of(0.5)])).toBeCloseTo(0.005)
  })

  it('gives the lowest limit when all tracks are quiet', () => {
    expect(loudnessLimit([Float32Array.of(0.0002), new Float32Array(3)])).toBe(MIN_LOUDNESS)
  })
})

describe('hasSound', () => {
  it('is false for a track with no window at the limit', () => {
    const loudness = windowLoudness(track(4, 0, 0), RATE)

    expect(hasSound(loudness, loudnessLimit([loudness]))).toBe(false)
  })

  it('is true for a track with one window at the limit', () => {
    const loudness = windowLoudness(track(4, 1000, 1050), RATE)

    expect(hasSound(loudness, loudnessLimit([loudness]))).toBe(true)
  })
})

describe('soundWords', () => {
  it('gives no word in a time range in which the track is silent', () => {
    const loudness = windowLoudness(track(10, 2000, 5000), RATE)
    const limit = loudnessLimit([loudness])
    const words = [word(500, 1500), word(2500, 3000), word(4800, 6000), word(6000, 9000)]

    const { kept, removedCount } = soundWords(words, loudness, limit, 0)

    expect(kept).toEqual([word(2500, 3000), word(4800, 6000)])
    expect(removedCount).toBe(2)
  })

  it('removes a word with sound below the limit, as a model track with a remainder of the other singer has', () => {
    const loud = windowLoudness(track(4, 0, 4000), RATE)
    const quiet = windowLoudness(track(4, 0, 4000, 0.0002), RATE)
    const limit = loudnessLimit([loud, quiet])

    expect(soundWords([word(1000, 2000)], quiet, limit, 0).removedCount).toBe(1)
    expect(soundWords([word(1000, 2000)], loud, limit, 0).removedCount).toBe(0)
  })

  it('reads the track from the start of the range', () => {
    const loudness = windowLoudness(track(4, 1000, 2000), RATE)
    const limit = loudnessLimit([loudness])

    const { kept } = soundWords(
      [word(11_200, 11_500), word(13_000, 13_500)],
      loudness,
      limit,
      10_000,
    )

    expect(kept).toEqual([word(11_200, 11_500)])
  })

  it('removes a word after the end of the track', () => {
    const loudness = windowLoudness(track(4, 0, 4000), RATE)

    expect(soundWords([word(4100, 4300)], loudness, loudnessLimit([loudness]), 0).kept).toEqual([])
  })

  it('reads one window for a word with no length or with an end before its start', () => {
    const loudness = windowLoudness(track(4, 1000, 1050), RATE)
    const limit = loudnessLimit([loudness])

    const { kept } = soundWords(
      [word(1020, 1020), word(1010, 0), word(3000, 0)],
      loudness,
      limit,
      0,
    )

    expect(kept).toEqual([word(1020, 1020), word(1010, 0)])
  })
})

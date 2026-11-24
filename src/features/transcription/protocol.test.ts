import { describe, expect, it } from 'vitest'
import {
  SPEECH_MODELS,
  createRunClock,
  doneMsAfterChunk,
  errorKind,
  wordsFromChunks,
} from './protocol.ts'

describe('wordsFromChunks', () => {
  it('returns each word with song times in milliseconds', () => {
    const words = wordsFromChunks(
      [
        { text: ' Silent', timestamp: [0.1, 2.3] },
        { text: ' night,', timestamp: [2.3, 4.05] },
      ],
      1000,
    )
    expect(words).toEqual([
      { text: 'Silent', startMs: 1100, endMs: 3300 },
      { text: 'night,', startMs: 3300, endMs: 5050 },
    ])
  })

  it('drops a word with no end time', () => {
    const words = wordsFromChunks(
      [
        { text: ' holy', timestamp: [1, 2] },
        { text: ' night', timestamp: [2, null] },
      ],
      0,
    )
    expect(words.map((word) => word.text)).toEqual(['holy'])
  })

  it('drops a word with no start time', () => {
    expect(wordsFromChunks([{ text: ' all', timestamp: [null, 3] }], 0)).toEqual([])
  })

  it('drops a word with no letters after the trim', () => {
    expect(wordsFromChunks([{ text: '  ', timestamp: [1, 2] }], 0)).toEqual([])
  })
})

describe('doneMsAfterChunk', () => {
  it('moves 20 seconds for each chunk after the first 30 seconds', () => {
    const tenMinutes = 600 * 16_000
    expect([0, 1, 2].map((index) => doneMsAfterChunk(index, tenMinutes))).toEqual([
      30_000, 50_000, 70_000,
    ])
  })

  it('stops at the duration of the run', () => {
    expect(doneMsAfterChunk(1, 40 * 16_000)).toBe(40_000)
  })
})

describe('errorKind', () => {
  it('maps a failed fetch to download on either device', () => {
    const error = new TypeError('Failed to fetch')
    expect(errorKind(error, 'wasm')).toBe('download')
    expect(errorKind(error, 'webgpu')).toBe('download')
  })

  it('maps a missing model file to download', () => {
    expect(
      errorKind(new Error('Could not locate file: "x/onnx/encoder_model.onnx".'), 'wasm'),
    ).toBe('download')
  })

  it('maps any other WebGPU failure to device', () => {
    expect(errorKind(new Error('out of memory'), 'webgpu')).toBe('device')
    expect(errorKind('GPU device lost', 'webgpu')).toBe('device')
  })

  it('maps an allocation failure on wasm to memory', () => {
    expect(errorKind(new RangeError('Array buffer allocation failed'), 'wasm')).toBe('memory')
    expect(errorKind(new Error('Aborted(OOM)'), 'wasm')).toBe('memory')
  })

  it('maps any other wasm failure to unknown', () => {
    expect(errorKind(new Error('Unknown speech model: x'), 'wasm')).toBe('unknown')
    expect(errorKind(new Error('No room in the zoom table'), 'wasm')).toBe('unknown')
  })
})

describe('SPEECH_MODELS', () => {
  it('lists tiny, base and small with a size in MB', () => {
    expect(SPEECH_MODELS.map((model) => model.label)).toEqual(['tiny', 'base', 'small'])
    for (const model of SPEECH_MODELS) expect(model.downloadMb).toBeGreaterThan(0)
  })
})

describe('createRunClock', () => {
  // The first timestamp token of Whisper is <|0.00|>. Each next id adds 20 ms.
  const BEGIN = 50_364
  const at = (seconds: number) => [BigInt(BEGIN + Math.round(seconds / 0.02))]
  const text = [123n]
  const minuteOfSamples = 60 * 16_000

  it('gives the audio time of each timestamp token that moves forward', () => {
    const clock = createRunClock(minuteOfSamples, BEGIN)

    expect(clock.token(at(0))).toBeNull()
    expect(clock.token(text)).toBeNull()
    expect(clock.token(at(2.4))).toBe(2400)
    expect(clock.token(at(2.4))).toBeNull()
    expect(clock.token(text)).toBeNull()
    expect(clock.token(at(5))).toBe(5000)
  })

  it('ignores the prompt tokens of a pass', () => {
    const clock = createRunClock(minuteOfSamples, BEGIN)

    expect(clock.token([50_258n, 50_259n, 50_360n])).toBeNull()
  })

  it('starts the next pass of a chunk at the end of the last complete segment', () => {
    const clock = createRunClock(minuteOfSamples, BEGIN)
    for (const tokens of [at(0), text, at(8), at(8), text, at(14), at(14), text])
      clock.token(tokens)
    clock.passEnd()

    expect(clock.token(at(0))).toBeNull()
    expect(clock.token(text)).toBeNull()
    expect(clock.token(at(3))).toBe(17_000)
  })

  it('keeps the seek of a pass with no complete segment', () => {
    const clock = createRunClock(minuteOfSamples, BEGIN)
    clock.token(at(0))
    clock.token(text)
    clock.passEnd()

    expect(clock.token(at(4))).toBe(4000)
  })

  it('adds the start of each chunk, 20 seconds apart, and never goes back', () => {
    const clock = createRunClock(minuteOfSamples, BEGIN)
    clock.token(at(12))

    expect(clock.chunkEnd()).toBe(30_000)
    expect(clock.token(at(6))).toBeNull()
    expect(clock.token(at(12))).toBe(32_000)
    expect(clock.chunkEnd()).toBe(50_000)
  })

  it('stops at the end of the chunk and at the end of the samples', () => {
    const clock = createRunClock(10 * 16_000, BEGIN)

    expect(clock.token(at(29.98))).toBe(10_000)
  })
})

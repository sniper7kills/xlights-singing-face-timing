import { describe, expect, it } from 'vitest'
import { SPEECH_MODELS, doneMsAfterChunk, errorKind, wordsFromChunks } from './protocol.ts'

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

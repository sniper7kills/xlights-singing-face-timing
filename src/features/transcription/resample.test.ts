import { afterEach, describe, expect, it, vi } from 'vitest'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { resampleForSpeech } from './resample.ts'

/** Makes a decode step that returns `channels` channels of `seconds` seconds at the asked sample rate. */
function fakeDecode(seconds: number, channels: number) {
  return vi.fn((_bytes: ArrayBuffer, sampleRate: number) => {
    const length = Math.round(seconds * sampleRate)
    const data = Array.from({ length: channels }, (_, channel) =>
      new Float32Array(length).fill(channel === 0 ? 1 : 0),
    )
    return Promise.resolve({
      numberOfChannels: channels,
      getChannelData: (channel: number) => data[channel],
    } as unknown as AudioBuffer)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resampleForSpeech', () => {
  it('returns one channel whose length is the duration times 16 000, within 1%', async () => {
    const seconds = 28.9
    const decode = fakeDecode(seconds, 2)
    const samples = await resampleForSpeech(new Blob(['x']), undefined, decode)
    expect(Math.abs(samples.length - seconds * 16_000)).toBeLessThanOrEqual(seconds * 16_000 * 0.01)
    expect(samples).toBeInstanceOf(Float32Array)
    expect(decode).toHaveBeenCalledWith(expect.any(ArrayBuffer), SPEECH_SAMPLE_RATE)
  })

  it('mixes all channels into one channel', async () => {
    const samples = await resampleForSpeech(new Blob(['x']), undefined, fakeDecode(1, 2))
    expect(samples[0]).toBe(0.5)
  })

  it('returns only the samples of the range', async () => {
    const samples = await resampleForSpeech(
      new Blob(['x']),
      { startMs: 2000, endMs: 4500 },
      fakeDecode(10, 1),
    )
    expect(samples.length).toBe(2.5 * 16_000)
  })

  it('rejects when the decode fails', async () => {
    const decode = () => Promise.reject(new Error('bad file'))
    await expect(resampleForSpeech(new Blob(['x']), undefined, decode)).rejects.toThrow('bad file')
  })

  it('decodes in a 16 kHz offline context and makes no live audio context by default', async () => {
    const created: unknown[] = []
    const live = vi.fn()
    vi.stubGlobal('AudioContext', live)
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor(...args: unknown[]) {
          created.push(args)
        }
        decodeAudioData = () =>
          Promise.resolve({
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(16_000),
          })
      },
    )

    const samples = await resampleForSpeech(new Blob(['x']))

    expect(created).toEqual([[1, 1, 16_000]])
    expect(live).not.toHaveBeenCalled()
    expect(samples).toHaveLength(16_000)
  })
})

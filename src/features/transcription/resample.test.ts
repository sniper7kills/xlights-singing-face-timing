import { describe, expect, it, vi } from 'vitest'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { resampleForSpeech } from './resample.ts'

/** Makes a decode context that returns `channels` channels of `seconds` seconds at `sampleRate`. */
function fakeContext(seconds: number, channels: number, sampleRate: number) {
  const length = Math.round(seconds * sampleRate)
  const data = Array.from({ length: channels }, (_, channel) =>
    new Float32Array(length).fill(channel === 0 ? 1 : 0),
  )
  const close = vi.fn(() => Promise.resolve())
  const context = {
    decodeAudioData: () =>
      Promise.resolve({
        numberOfChannels: channels,
        getChannelData: (channel: number) => data[channel],
      } as unknown as AudioBuffer),
    close,
  }
  return { context, close }
}

describe('resampleForSpeech', () => {
  it('returns one channel whose length is the duration times 16 000, within 1%', async () => {
    const seconds = 28.9
    const { context } = fakeContext(seconds, 2, SPEECH_SAMPLE_RATE)
    const samples = await resampleForSpeech(new Blob(['x']), undefined, () => context)
    expect(Math.abs(samples.length - seconds * 16_000)).toBeLessThanOrEqual(seconds * 16_000 * 0.01)
    expect(samples).toBeInstanceOf(Float32Array)
  })

  it('mixes all channels into one channel', async () => {
    const { context } = fakeContext(1, 2, SPEECH_SAMPLE_RATE)
    const samples = await resampleForSpeech(new Blob(['x']), undefined, () => context)
    expect(samples[0]).toBe(0.5)
  })

  it('returns only the samples of the range', async () => {
    const { context } = fakeContext(10, 1, SPEECH_SAMPLE_RATE)
    const samples = await resampleForSpeech(
      new Blob(['x']),
      { startMs: 2000, endMs: 4500 },
      () => context,
    )
    expect(samples.length).toBe(2.5 * 16_000)
  })

  it('closes the context when the decode fails', async () => {
    const close = vi.fn(() => Promise.resolve())
    const context = { decodeAudioData: () => Promise.reject(new Error('bad file')), close }
    await expect(resampleForSpeech(new Blob(['x']), undefined, () => context)).rejects.toThrow(
      'bad file',
    )
    expect(close).toHaveBeenCalled()
  })

  it('asks the browser for a 16 kHz context by default', async () => {
    const created: unknown[] = []
    const { context } = fakeContext(1, 1, SPEECH_SAMPLE_RATE)
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor(options: unknown) {
          created.push(options)
          return context
        }
      },
    )
    await resampleForSpeech(new Blob(['x']))
    vi.unstubAllGlobals()
    expect(created).toEqual([{ sampleRate: 16_000 }])
  })
})

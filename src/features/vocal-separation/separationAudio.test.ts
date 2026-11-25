import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeStereo, type ResampleContext, vocalsForSpeech } from './separationAudio.ts'

/** Returns a stub of a decoded `AudioBuffer` with the channels. */
function decoded(...channels: Float32Array[]): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (channel: number) => channels[channel] ?? new Float32Array(0),
  } as unknown as AudioBuffer
}

const audioFile = new Blob([new Uint8Array([1, 2])])

/** Returns samples 0, 1, 2, … for one channel. */
function ramp(length: number): Float32Array {
  return Float32Array.from({ length }, (_, index) => index)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('decodeStereo', () => {
  it('decodes at 44 100 Hz and returns the two channels of a stereo file', async () => {
    const decode = vi.fn(async () =>
      decoded(
        ramp(4),
        ramp(4).map((value) => -value),
      ),
    )

    const audio = await decodeStereo(audioFile, undefined, decode)

    expect(decode).toHaveBeenCalledWith(expect.any(ArrayBuffer), 44_100)
    expect(audio.sampleRate).toBe(44100)
    expect(audio.left).toEqual(ramp(4))
    expect(audio.right).toEqual(ramp(4).map((value) => -value))
  })

  it('returns two equal channels with two buffers for a mono file', async () => {
    const audio = await decodeStereo(audioFile, undefined, async () => decoded(ramp(3)))

    expect(audio.right).toEqual(audio.left)
    expect(audio.right.buffer).not.toBe(audio.left.buffer)
  })

  it('copies each channel, so a transfer does not empty the decoded audio', async () => {
    const left = ramp(3)

    const audio = await decodeStereo(audioFile, undefined, async () => decoded(left, ramp(3)))

    expect(audio.left.buffer).not.toBe(left.buffer)
  })

  it('cuts the range before the separation', async () => {
    const audio = await decodeStereo(audioFile, { startMs: 1000, endMs: 1500 }, async () =>
      decoded(ramp(88_200), ramp(88_200)),
    )

    expect(audio.left).toHaveLength(22_050)
    expect(audio.left[0]).toBe(44_100)
    expect(audio.right[0]).toBe(44_100)
  })
})

/** A stub offline context that records the calls and renders the given samples. */
function stubContext(rendered: Float32Array) {
  const calls: unknown[][] = []
  const channel = new Float32Array(8)
  const source = {
    buffer: null as unknown,
    connect: vi.fn(),
    start: vi.fn(),
  }
  const context = {
    destination: { name: 'destination' },
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => {
      calls.push(['createBuffer', channels, length, sampleRate])
      return { getChannelData: () => channel }
    }),
    createBufferSource: vi.fn(() => source),
    startRendering: vi.fn(async () => ({ getChannelData: () => rendered })),
  } as unknown as ResampleContext
  return { context, calls, channel, source }
}

describe('vocalsForSpeech', () => {
  it('renders the vocals in a 16 kHz offline context with the length at 16 kHz', async () => {
    const rendered = new Float32Array(3)
    const stub = stubContext(rendered)
    const createContext = vi.fn(() => stub.context)
    const vocals = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])

    const result = await vocalsForSpeech(vocals, createContext)

    expect(result).toBe(rendered)
    expect(createContext).toHaveBeenCalledWith(3, 16_000)
    expect(stub.calls).toEqual([['createBuffer', 1, 8, 44_100]])
    expect(stub.channel).toEqual(vocals)
    expect(stub.source.buffer).toBeDefined()
    expect(stub.source.connect).toHaveBeenCalledWith(stub.context.destination)
    expect(stub.source.start).toHaveBeenCalled()
  })

  it('gives the context one frame or more for empty vocals', async () => {
    const stub = stubContext(new Float32Array(1))
    const createContext = vi.fn(() => stub.context)

    await vocalsForSpeech(new Float32Array(0), createContext)

    expect(createContext).toHaveBeenCalledWith(1, 16_000)
    expect(stub.calls).toEqual([['createBuffer', 1, 1, 44_100]])
  })

  it('uses an OfflineAudioContext with one channel by default, and no live AudioContext', async () => {
    const created: unknown[][] = []
    const live = vi.fn()
    const stub = stubContext(new Float32Array(1))
    vi.stubGlobal('AudioContext', live)
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor(...args: unknown[]) {
          created.push(args)
          return stub.context
        }
      },
    )

    await vocalsForSpeech(new Float32Array(8))

    expect(created).toEqual([[1, 3, 16_000]])
    expect(live).not.toHaveBeenCalled()
  })
})

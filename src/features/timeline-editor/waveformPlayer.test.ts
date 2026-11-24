import { beforeEach, describe, expect, it, vi } from 'vitest'
import WaveSurfer from 'wavesurfer.js'
import { createWaveformPlayer } from './waveformPlayer.ts'

vi.mock('wavesurfer.js', () => ({ default: { create: vi.fn() } }))

type Handler = (...args: number[]) => void

let handlers: Map<string, Handler>
let fake: {
  on: ReturnType<typeof vi.fn>
  loadBlob: ReturnType<typeof vi.fn>
  setOptions: ReturnType<typeof vi.fn>
  setScroll: ReturnType<typeof vi.fn>
  setTime: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  // jsdom has no Web Audio.
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      decodeAudioData = () =>
        Promise.resolve({
          duration: 30,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array([0, 0.5]),
        })
    },
  )
  handlers = new Map()
  fake = {
    on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    loadBlob: vi.fn(() => Promise.resolve()),
    setOptions: vi.fn(),
    setScroll: vi.fn(),
    setTime: vi.fn(),
  }
  vi.mocked(WaveSurfer.create).mockReturnValue(fake as unknown as WaveSurfer)
})

async function createPlayer() {
  const audio = new Blob([new Uint8Array([1])])
  // The Blob of jsdom has no arrayBuffer method.
  audio.arrayBuffer = () => Promise.resolve(new ArrayBuffer(1))
  return createWaveformPlayer(
    document.createElement('div'),
    audio,
    { wave: '#111', progress: '#222' },
    { onTime: vi.fn(), onPlayChange: vi.fn() },
  )
}

describe('createWaveformPlayer', () => {
  it('draws no cursor, takes no click and does not scroll by itself', async () => {
    await createPlayer()

    expect(WaveSurfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cursorWidth: 0,
        interact: false,
        autoScroll: false,
        autoCenter: false,
        hideScrollbar: true,
      }),
    )
  })

  it('decodes the peaks in an 8 kHz offline context and makes no live audio context', async () => {
    const created: unknown[][] = []
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
            duration: 30,
            numberOfChannels: 1,
            getChannelData: () => new Float32Array([0, 0.5]),
          })
      },
    )

    await createPlayer()

    expect(created).toEqual([[1, 1, 8000]])
    expect(live).not.toHaveBeenCalled()
    expect(fake.loadBlob).toHaveBeenCalledWith(expect.any(Blob), [new Float32Array([0, 0.5])], 30)
  })

  it('sets the zoom once and the scroll offset in pixels for each view', async () => {
    const player = await createPlayer()

    player.setView(200, 4000)
    player.setView(200, 5000)

    expect(fake.setOptions).toHaveBeenCalledOnce()
    expect(fake.setOptions).toHaveBeenCalledWith({ minPxPerSec: 200, fillParent: false })
    expect(fake.setScroll).toHaveBeenLastCalledWith(1000)
  })

  it('fits the full song in the width at the default zoom', async () => {
    const player = await createPlayer()
    player.setView(200, 4000)

    player.setView(null, 4000)

    expect(fake.setOptions).toHaveBeenLastCalledWith({ minPxPerSec: 0, fillParent: true })
    expect(fake.setScroll).toHaveBeenLastCalledWith(0)
  })

  it('sets the scroll offset again when wavesurfer.js moves it', async () => {
    const player = await createPlayer()
    player.setView(100, 2000)
    fake.setScroll.mockClear()

    handlers.get('scroll')?.(0, 10, 200.4, 1200)
    expect(fake.setScroll).not.toHaveBeenCalled()
    handlers.get('scroll')?.(0, 10, 350, 1350)

    expect(fake.setScroll).toHaveBeenCalledWith(200)
  })

  it('moves the play time in seconds for a seek', async () => {
    const player = await createPlayer()

    player.seek(1500)

    expect(fake.setTime).toHaveBeenCalledWith(1.5)
  })
})

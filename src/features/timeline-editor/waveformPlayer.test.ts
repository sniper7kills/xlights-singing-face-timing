import { beforeEach, describe, expect, it, vi } from 'vitest'
import WaveSurfer from 'wavesurfer.js'
import { setPlayRate, usePlayerStore } from './playerStore.ts'
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
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  setPlaybackRate: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  getMediaElement: ReturnType<typeof vi.fn>
}
let onTime: ReturnType<typeof vi.fn<(ms: number) => void>>

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
    setTime: vi.fn((seconds: number) => handlers.get('timeupdate')?.(seconds)),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    setPlaybackRate: vi.fn(),
    destroy: vi.fn(),
    getMediaElement: vi.fn(() => document.createElement('audio')),
  }
  onTime = vi.fn()
  usePlayerStore.setState({ player: null, looping: false, playRate: 1 })
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
    { onTime, onPlayChange: vi.fn() },
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

  it('adds itself to the player store at the play speed of the store, and leaves on destroy', async () => {
    setPlayRate(0.75)

    const player = await createPlayer()

    expect(usePlayerStore.getState().player).toBe(player)
    expect(fake.setPlaybackRate).toHaveBeenCalledWith(0.75, true)
    player.destroy()
    expect(usePlayerStore.getState().player).toBeNull()
    expect(fake.destroy).toHaveBeenCalled()
  })

  it('keeps a newer player in the store when an older player leaves', async () => {
    const older = await createPlayer()
    const newer = await createPlayer()

    older.destroy()

    expect(usePlayerStore.getState().player).toBe(newer)
  })

  it('sets the play speed and keeps the pitch', async () => {
    const player = await createPlayer()

    player.setPlayRate(0.5)

    expect(fake.setPlaybackRate).toHaveBeenLastCalledWith(0.5, true)
  })

  it('starts a loop at the range start and goes back there at the range end', async () => {
    const player = await createPlayer()

    await player.loop({ startMs: 1350, endMs: 2000 })
    expect(fake.setTime).toHaveBeenLastCalledWith(1.35)
    expect(fake.play).toHaveBeenCalledOnce()
    expect(usePlayerStore.getState().looping).toBe(true)

    handlers.get('timeupdate')?.(1.9)
    expect(onTime).toHaveBeenLastCalledWith(1900)
    handlers.get('timeupdate')?.(2.016)
    expect(fake.setTime).toHaveBeenLastCalledWith(1.35)
    expect(onTime).toHaveBeenLastCalledWith(1350)
  })

  it.each([
    ['pause', (player: Awaited<ReturnType<typeof createPlayer>>) => player.pause()],
    ['play', (player: Awaited<ReturnType<typeof createPlayer>>) => void player.play()],
    ['seek', (player: Awaited<ReturnType<typeof createPlayer>>) => player.seek(500)],
  ])('ends the loop on %s', async (_name, end) => {
    const player = await createPlayer()
    await player.loop({ startMs: 1000, endMs: 2000 })

    end(player)
    fake.setTime.mockClear()
    handlers.get('timeupdate')?.(2.5)

    expect(fake.setTime).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().looping).toBe(false)
  })

  it('plays the loop again from its start when the song ends inside the loop', async () => {
    const player = await createPlayer()
    await player.loop({ startMs: 29_000, endMs: 30_000 })
    fake.play.mockClear()

    handlers.get('finish')?.()

    expect(fake.setTime).toHaveBeenLastCalledWith(29)
    expect(fake.play).toHaveBeenCalledOnce()
  })

  it('does not play again at the song end with no loop', async () => {
    await createPlayer()

    handlers.get('finish')?.()

    expect(fake.play).not.toHaveBeenCalled()
  })

  it('ends the loop and rejects when the browser refuses to play', async () => {
    const player = await createPlayer()
    fake.play.mockRejectedValueOnce(new Error('NotAllowedError'))

    await expect(player.loop({ startMs: 0, endMs: 500 })).rejects.toThrow('NotAllowedError')

    expect(usePlayerStore.getState().looping).toBe(false)
  })
})

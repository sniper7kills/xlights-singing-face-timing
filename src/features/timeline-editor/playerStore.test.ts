import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import {
  attachPlayer,
  detachPlayer,
  loopSelection,
  setPlayRate,
  usePlayerStore,
} from './playerStore.ts'
import type { WaveformPlayer } from './waveformPlayer.ts'

function fakePlayer(): WaveformPlayer {
  return {
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    loop: vi.fn(async () => undefined),
    setPlayRate: vi.fn(),
    isPlaying: () => false,
    media: document.createElement('audio'),
    setColors: vi.fn(),
    setView: vi.fn(),
    seek: vi.fn(),
    destroy: vi.fn(),
  }
}

beforeEach(() => {
  useSongStore.setState({ current: testContent(), history: emptyHistory() })
  useViewStore.getState().resetView()
  usePlayerStore.setState({ player: null, looping: false, playRate: 1 })
})

describe('playerStore', () => {
  it('gives a new player the play speed that the person chose before the audio loaded', () => {
    setPlayRate(0.75)
    const player = fakePlayer()

    attachPlayer(player)

    expect(player.setPlayRate).toHaveBeenCalledWith(0.75)
  })

  it('removes only the player that leaves', () => {
    const older = fakePlayer()
    const newer = fakePlayer()
    attachPlayer(older)
    attachPlayer(newer)

    detachPlayer(older)
    expect(usePlayerStore.getState().player).toBe(newer)
    detachPlayer(newer)
    expect(usePlayerStore.getState().player).toBeNull()
  })

  it('loops the selected marks and returns true', () => {
    const player = fakePlayer()
    attachPlayer(player)
    useViewStore.getState().selectMarks(['w1', 'w2'])

    expect(loopSelection()).toBe(true)
    expect(player.loop).toHaveBeenCalledWith({ startMs: 850, endMs: 2000 })
  })

  it('pauses the player when the browser refuses the loop', async () => {
    const player = fakePlayer()
    vi.mocked(player.loop).mockRejectedValueOnce(new DOMException('refused', 'NotAllowedError'))
    attachPlayer(player)
    useViewStore.getState().selectMarks(['w1'])

    expect(loopSelection()).toBe(true)

    await vi.waitFor(() => expect(player.pause).toHaveBeenCalledOnce())
  })

  it('returns false with no player', () => {
    useViewStore.getState().selectMarks(['w1'])

    expect(loopSelection()).toBe(false)
  })

  it('returns false with no selection', () => {
    const player = fakePlayer()
    attachPlayer(player)

    expect(loopSelection()).toBe(false)
    expect(player.loop).not.toHaveBeenCalled()
  })
})

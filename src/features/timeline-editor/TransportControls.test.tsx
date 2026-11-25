import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { attachPlayer, usePlayerStore } from './playerStore.ts'
import { TransportControls } from './TransportControls.tsx'
import type { WaveformPlayer } from './waveformPlayer.ts'

/** Returns a player that records its calls. Its loop and pause set the loop state like the real player. */
function fakePlayer(): WaveformPlayer {
  return {
    play: vi.fn(async () => undefined),
    pause: vi.fn(() => usePlayerStore.setState({ looping: false })),
    loop: vi.fn(async () => {
      usePlayerStore.setState({ looping: true })
    }),
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

const loopButton = () => screen.getByRole('button', { name: 'Loop' })

describe('TransportControls', () => {
  it('disables the loop and the play speed with no audio, and keeps the frame size usable', () => {
    useViewStore.getState().selectMarks(['w2'])
    render(<TransportControls />)

    expect(loopButton()).toHaveAttribute('aria-disabled', 'true')
    expect(loopButton()).toHaveAccessibleDescription('The audio is not ready.')
    for (const name of ['50%', '75%', '100%'])
      expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(screen.getByRole('button', { name: '25 ms' })).toBeEnabled()
  })

  it('disables the loop when nothing is selected, and states the reason in the tooltip', async () => {
    const player = fakePlayer()
    attachPlayer(player)
    render(<TransportControls />)

    expect(loopButton()).toHaveAttribute('aria-disabled', 'true')
    expect(loopButton()).toHaveAttribute('title', 'Select a mark or a time range first. (L)')
    expect(loopButton()).toHaveAccessibleDescription('Select a mark or a time range first.')
    await userEvent.click(loopButton())
    expect(player.loop).not.toHaveBeenCalled()
  })

  it('loops the selected mark from 150 ms before its start with the Loop button', async () => {
    const player = fakePlayer()
    attachPlayer(player)
    useViewStore.getState().selectMarks(['w2'])
    render(<TransportControls />)

    await userEvent.click(loopButton())

    expect(player.loop).toHaveBeenCalledWith({ startMs: 1350, endMs: 2000 })
    await waitFor(() => expect(loopButton()).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(loopButton())
    expect(player.pause).toHaveBeenCalled()
    await waitFor(() => expect(loopButton()).toHaveAttribute('aria-pressed', 'false'))
  })

  it('loops the time selection with the L key when no mark is selected', async () => {
    const player = fakePlayer()
    attachPlayer(player)
    useViewStore.getState().setSelection({ startMs: 5000, endMs: 5600 })
    render(<TransportControls />)

    await userEvent.keyboard('l')

    expect(player.loop).toHaveBeenCalledWith({ startMs: 4850, endMs: 5600 })
  })

  it('passes the L key on when nothing is selected', async () => {
    attachPlayer(fakePlayer())
    render(<TransportControls />)
    const event = new KeyboardEvent('keydown', { key: 'l', cancelable: true })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('sets the play speed on the player and shows the pressed speed', async () => {
    const player = fakePlayer()
    attachPlayer(player)
    render(<TransportControls />)

    await userEvent.click(screen.getByRole('button', { name: '50%' }))

    expect(player.setPlayRate).toHaveBeenLastCalledWith(0.5)
    expect(screen.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '100%' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('snaps every mark to the new frame size after Continue in the confirm dialog', async () => {
    render(<TransportControls />)
    expect(screen.getByRole('button', { name: '50 ms' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: '25 ms' }))
    const dialog = screen.getByRole('dialog', {
      name: 'The app moves every mark of this song to a multiple of 25 ms.',
    })
    expect(dialog).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(useSongStore.getState().current?.song.frameMs).toBe(25)
    expect(useSongStore.getState().history.past).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '25 ms' })).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(screen.getByRole('button', { name: '25 ms' })).toHaveFocus()
  })

  it.each([['Cancel'], ['Escape']])('keeps the frame size after %s', async (way) => {
    render(<TransportControls />)

    await userEvent.click(screen.getByRole('button', { name: '25 ms' }))
    if (way === 'Escape') await userEvent.keyboard('{Escape}')
    else await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useSongStore.getState().current?.song.frameMs).toBe(50)
    expect(useSongStore.getState().history.past).toHaveLength(0)
  })

  it('sets the frame size of a song with no marks with no confirm dialog', async () => {
    useSongStore.setState({ current: testContent([]) })
    render(<TransportControls />)

    await userEvent.click(screen.getByRole('button', { name: '25 ms' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useSongStore.getState().current?.song.frameMs).toBe(25)
  })

  it('shows no dialog for the frame size that the song has', async () => {
    render(<TransportControls />)

    await userEvent.click(screen.getByRole('button', { name: '50 ms' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

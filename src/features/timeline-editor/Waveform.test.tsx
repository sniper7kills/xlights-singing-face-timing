import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRecord, getAudioFile } from '../../store/db.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { Waveform } from './Waveform.tsx'
import {
  createWaveformPlayer,
  type WaveformListeners,
  type WaveformPlayer,
} from './waveformPlayer.ts'

vi.mock('./waveformPlayer.ts', () => ({ createWaveformPlayer: vi.fn() }))

const audio = {
  data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' }),
  fileName: 'carol.ogg',
  mimeType: 'audio/ogg',
}

type FakePlayer = WaveformPlayer & { listeners: WaveformListeners; playing: boolean }

/** Returns a player that records its calls and reports play changes like wavesurfer.js. */
function fakePlayer(listeners: WaveformListeners): FakePlayer {
  const player: FakePlayer = {
    listeners,
    playing: false,
    play: vi.fn(async () => {
      player.playing = true
      listeners.onPlayChange(true)
    }),
    pause: vi.fn(() => {
      player.playing = false
      listeners.onPlayChange(false)
    }),
    isPlaying: () => player.playing,
    setColors: vi.fn(),
    destroy: vi.fn(),
  }
  return player
}

let players: FakePlayer[]

beforeEach(() => {
  players = []
  vi.mocked(createWaveformPlayer).mockImplementation(
    async (_container, _audio, _colors, listeners) => {
      const player = fakePlayer(listeners)
      players.push(player)
      return player
    },
  )
  useViewStore.getState().resetView()
})

afterEach(() => {
  vi.mocked(createWaveformPlayer).mockReset()
})

async function renderReadyWaveform() {
  const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
  render(<Waveform songId={song.id} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled())
  return song
}

describe('Waveform', () => {
  it('shows "Drawing waveform" and a disabled play button while the waveform loads', async () => {
    vi.mocked(createWaveformPlayer).mockReturnValue(new Promise(() => undefined))
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })

    render(<Waveform songId={song.id} />)

    expect(await screen.findByText('Drawing waveform')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('draws the stored audio file of the song and enables play', async () => {
    const song = await renderReadyWaveform()

    const stored = await getAudioFile(song.id)
    expect(vi.mocked(createWaveformPlayer).mock.calls[0]?.[1]).toEqual(stored?.data)
    expect(screen.queryByText('Drawing waveform')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Waveform' })).toHaveAttribute('data-state', 'ready')
    expect(screen.getByLabelText('Play time')).toHaveTextContent('0:00.000')
  })

  it('does not start play automatically', async () => {
    await renderReadyWaveform()

    expect(players[0]?.play).not.toHaveBeenCalled()
  })

  it('starts play with the play button and pauses with a second click', async () => {
    const user = userEvent.setup()
    await renderReadyWaveform()

    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(players[0]?.play).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(players[0]?.pause).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('starts play with the space bar and pauses with a second press', async () => {
    const user = userEvent.setup()
    await renderReadyWaveform()

    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(players[0]?.play).toHaveBeenCalledOnce()
    expect(players[0]?.pause).toHaveBeenCalledOnce()
  })

  it('leaves the space bar to a text field that has focus', async () => {
    const user = userEvent.setup()
    await renderReadyWaveform()
    const field = document.body.appendChild(document.createElement('input'))
    try {
      await user.click(field)
      await user.keyboard(' ')

      expect(players[0]?.play).not.toHaveBeenCalled()
      expect(field).toHaveValue(' ')
    } finally {
      field.remove()
    }
  })

  it('shows the play time as m:ss.mmm', async () => {
    await renderReadyWaveform()

    act(() => players[0]?.listeners.onTime(1500))

    expect(screen.getByLabelText('Play time')).toHaveTextContent('0:01.500')
  })

  it('shows the decode message when the browser cannot decode the audio', async () => {
    vi.mocked(createWaveformPlayer).mockRejectedValue(new DOMException('bad data', 'EncodingError'))
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })

    render(<Waveform songId={song.id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This browser cannot decode this file. Convert it to MP3 or WAV and try again.',
    )
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('removes the waveform when the editor closes', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    const view = render(<Waveform songId={song.id} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled())

    view.unmount()

    expect(players.at(-1)?.destroy).toHaveBeenCalled()
  })

  describe('with a missing audio file', () => {
    async function renderMissingAudio() {
      const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
      await deleteRecord('audioFiles', song.id)
      render(<Waveform songId={song.id} />)
      await screen.findByRole('alert')
      return song
    }

    it('asks for the file again and disables play', async () => {
      await renderMissingAudio()

      expect(screen.getByRole('alert')).toHaveTextContent(
        'The audio for this song is missing. Load the file again.',
      )
      expect(screen.getByRole('button', { name: 'Load the audio file' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
      expect(createWaveformPlayer).not.toHaveBeenCalled()
    })

    it('ignores the space bar', async () => {
      const user = userEvent.setup()
      await renderMissingAudio()

      await user.keyboard(' ')

      expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    })

    it('stores a selected audio file and draws its waveform', async () => {
      const user = userEvent.setup()
      const song = await renderMissingAudio()
      const file = new File([new Uint8Array([4, 5])], 'carol.ogg', { type: 'audio/ogg' })

      await user.upload(screen.getByLabelText('Audio file'), file)

      await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled())
      expect(await getAudioFile(song.id)).toMatchObject({
        songId: song.id,
        fileName: 'carol.ogg',
        mimeType: 'audio/ogg',
        byteLength: 2,
      })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows the file-type message for a file that is not audio', async () => {
      const user = userEvent.setup({ applyAccept: false })
      const song = await renderMissingAudio()
      const file = new File(['Silent night'], 'lyrics.txt', { type: 'text/plain' })

      await user.upload(screen.getByLabelText('Audio file'), file)

      expect(
        await screen.findByText(
          'This file type is not supported. Use MP3, WAV, OGG, FLAC, M4A or AAC.',
        ),
      ).toBeInTheDocument()
      expect(await getAudioFile(song.id)).toBeUndefined()
    })
  })
})

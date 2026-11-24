import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../../store/db.ts'
import { getAudioFile, saveSong } from '../../store/db.ts'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { ImportError } from '../audio-import/createSongFromFile.ts'
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
let decodeAudioData: () => Promise<{ duration: number }>

beforeEach(() => {
  players = []
  decodeAudioData = () => Promise.resolve({ duration: 3 })
  // jsdom has no Web Audio, and the check of a selected file decodes it.
  vi.stubGlobal(
    'AudioContext',
    class {
      decodeAudioData = () => decodeAudioData()
      close = () => Promise.resolve()
    },
  )
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
  vi.restoreAllMocks()
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

  it('starts no play for the space bar inside a dialog', async () => {
    const user = userEvent.setup()
    await renderReadyWaveform()
    const dialog = document.body.appendChild(document.createElement('div'))
    dialog.setAttribute('role', 'dialog')
    dialog.tabIndex = -1
    try {
      dialog.focus()
      await user.keyboard(' ')

      expect(players[0]?.play).not.toHaveBeenCalled()
    } finally {
      dialog.remove()
    }
  })

  it('shows the play time as m:ss.mmm', async () => {
    await renderReadyWaveform()

    act(() => players[0]?.listeners.onTime(1500))

    expect(screen.getByLabelText('Play time')).toHaveTextContent('0:01.500')
  })

  it('shows the decode message when the browser cannot decode the audio', async () => {
    vi.mocked(createWaveformPlayer).mockRejectedValue(new ImportError({ kind: 'decode' }))
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })

    render(<Waveform songId={song.id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This browser cannot decode this file. Convert it to MP3 or WAV and try again.',
    )
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('shows the storage message when the app cannot read the audio file', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    vi.spyOn(db, 'getAudioFile').mockRejectedValue(new Error('The disk is gone.'))

    render(<Waveform songId={song.id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The app could not read the audio from browser storage. Reload the page.',
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
      const song = await saveSong(makeSongContent())
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

    it('shows the size message for a 201 MB file and stores no file', async () => {
      const user = userEvent.setup()
      const song = await renderMissingAudio()
      const file = new File([new Uint8Array([4, 5])], 'carol.ogg', { type: 'audio/ogg' })
      Object.defineProperty(file, 'size', { value: 201 * 1024 * 1024 })

      await user.upload(screen.getByLabelText('Audio file'), file)

      expect(await screen.findByText('This file is larger than 200 MB.')).toBeInTheDocument()
      expect(await getAudioFile(song.id)).toBeUndefined()
      expect(screen.getByRole('button', { name: 'Load the audio file' })).toBeEnabled()
    })

    it('shows the duration message for a 16-minute file and stores no file', async () => {
      const user = userEvent.setup()
      const song = await renderMissingAudio()
      decodeAudioData = () => Promise.resolve({ duration: 960 })
      const file = new File([new Uint8Array([4, 5])], 'carol.ogg', { type: 'audio/ogg' })

      await user.upload(screen.getByLabelText('Audio file'), file)

      expect(await screen.findByText('This song is longer than 15 minutes.')).toBeInTheDocument()
      expect(await getAudioFile(song.id)).toBeUndefined()
      expect(screen.getByRole('button', { name: 'Load the audio file' })).toBeEnabled()
    })

    it('shows the decode message for a file that the browser cannot decode', async () => {
      const user = userEvent.setup()
      const song = await renderMissingAudio()
      decodeAudioData = () => Promise.reject(new DOMException('bad data', 'EncodingError'))
      const file = new File([new Uint8Array([4, 5])], 'carol.ogg', { type: 'audio/ogg' })

      await user.upload(screen.getByLabelText('Audio file'), file)

      expect(
        await screen.findByText(
          'This browser cannot decode this file. Convert it to MP3 or WAV and try again.',
        ),
      ).toBeInTheDocument()
      expect(await getAudioFile(song.id)).toBeUndefined()
      expect(screen.getByRole('button', { name: 'Load the audio file' })).toBeEnabled()
    })

    it('shows the storage message when the storage fails for a reason other than a full disk', async () => {
      const user = userEvent.setup()
      const song = await renderMissingAudio()
      vi.spyOn(db, 'putRecord').mockRejectedValue(new Error('IndexedDB stopped the transaction.'))
      const file = new File([new Uint8Array([4, 5])], 'carol.ogg', { type: 'audio/ogg' })

      await user.upload(screen.getByLabelText('Audio file'), file)

      expect(
        await screen.findByText(
          'The app could not read the audio from browser storage. Reload the page.',
        ),
      ).toBeInTheDocument()
      expect(await getAudioFile(song.id)).toBeUndefined()
      expect(screen.getByRole('button', { name: 'Load the audio file' })).toBeEnabled()
    })

    it('shows the full-storage message when the disk is full', async () => {
      const user = userEvent.setup()
      await renderMissingAudio()
      vi.spyOn(db, 'putRecord').mockRejectedValue(new db.StorageFullError())
      const file = new File([new Uint8Array([4, 5])], 'carol.ogg', { type: 'audio/ogg' })

      await user.upload(screen.getByLabelText('Audio file'), file)

      expect(
        await screen.findByText('Browser storage is full. Delete a song and try again.'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Load the audio file' })).toBeEnabled()
    })
  })
})

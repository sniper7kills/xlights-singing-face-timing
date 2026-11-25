import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    loop: vi.fn(async () => undefined),
    setPlayRate: vi.fn(),
    isPlaying: () => player.playing,
    setColors: vi.fn(),
    setView: vi.fn(),
    seek: vi.fn(),
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
    'OfflineAudioContext',
    class {
      decodeAudioData = () => decodeAudioData()
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
  render(<Waveform songId={song.id} durationMs={3000} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled())
  return song
}

describe('Waveform', () => {
  it('shows "Drawing waveform" and a disabled play button while the waveform loads', async () => {
    vi.mocked(createWaveformPlayer).mockReturnValue(new Promise(() => undefined))
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })

    render(<Waveform songId={song.id} durationMs={3000} />)

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

  it('shows the play time as m:ss.mmm', async () => {
    await renderReadyWaveform()

    act(() => players[0]?.listeners.onTime(1500))

    expect(screen.getByLabelText('Play time')).toHaveTextContent('0:01.500')
  })

  it('shows the decode message when the browser cannot decode the audio', async () => {
    vi.mocked(createWaveformPlayer).mockRejectedValue(new ImportError({ kind: 'decode' }))
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })

    render(<Waveform songId={song.id} durationMs={3000} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This browser cannot decode this file. Convert it to MP3 or WAV and try again.',
    )
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('shows the storage message when the app cannot read the audio file', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    vi.spyOn(db, 'getAudioFile').mockRejectedValue(new Error('The disk is gone.'))

    render(<Waveform songId={song.id} durationMs={3000} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The app could not read the audio from browser storage. Reload the page.',
    )
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('removes the waveform when the editor closes', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    const view = render(<Waveform songId={song.id} durationMs={3000} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled())

    view.unmount()

    expect(players.at(-1)?.destroy).toHaveBeenCalled()
  })

  describe('with a missing audio file', () => {
    async function renderMissingAudio() {
      const song = await saveSong(makeSongContent())
      render(<Waveform songId={song.id} durationMs={3000} />)
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

  describe('stage', () => {
    // 1000 px for 20 000 ms is 0.05 px for each ms at the default zoom.
    const DURATION_MS = 20_000

    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
      // jsdom has no pointer capture.
      HTMLElement.prototype.setPointerCapture = vi.fn()
    })

    async function renderStage() {
      const song = await storeNewSong({ name: 'carol', durationMs: DURATION_MS, audio })
      const view = render(
        <Waveform songId={song.id} durationMs={DURATION_MS}>
          <section aria-label="Layers" />
        </Waveform>,
      )
      await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled())
      const player = players[0]
      if (player === undefined) throw new Error('No player.')
      return { player, container: view.container }
    }

    function waveformStage() {
      return screen.getByTestId('waveform-stage')
    }

    function pointer(type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientX: number) {
      fireEvent[type](waveformStage(), { clientX, button: 0, pointerId: 1 })
    }

    it('puts the section band above the time ruler, then the waveform and the layers', async () => {
      const { container } = await renderStage()

      const stage = container.querySelector('.stage')
      const order = [...(stage?.children ?? [])].map(
        (child) => child.getAttribute('aria-label') ?? child.className,
      )
      expect(order.slice(0, 4)).toEqual(['Sections', 'time-ruler', 'waveform-stage', 'Layers'])
      expect(useViewStore.getState().stageWidthPx).toBe(1000)
    })

    it('moves the play cursor for a click on the waveform and clears the time selection', async () => {
      const { player } = await renderStage()
      act(() => useViewStore.getState().setSelection({ startMs: 100, endMs: 900 }))

      pointer('pointerDown', 250)
      pointer('pointerUp', 250)

      expect(player.seek).toHaveBeenCalledWith(5000)
      expect(useViewStore.getState()).toMatchObject({ playTimeMs: 5000, selection: null })
      expect(screen.getByTestId('play-cursor')).toHaveStyle({ transform: 'translateX(250px)' })
      expect(screen.queryByTestId('time-selection')).toBeNull()
    })

    it('makes a time selection for a drag on the waveform and shows it as a band', async () => {
      const { player } = await renderStage()

      pointer('pointerDown', 300)
      pointer('pointerMove', 200)
      pointer('pointerMove', 100)
      pointer('pointerUp', 100)

      expect(useViewStore.getState().selection).toEqual({ startMs: 2000, endMs: 6000 })
      expect(screen.getByTestId('time-selection')).toHaveStyle({ left: '100px', width: '200px' })
      expect(player.seek).not.toHaveBeenCalled()
    })

    it('moves the play cursor for a click on the time ruler', async () => {
      const { player, container } = await renderStage()
      const ruler = container.querySelector('.time-ruler')
      if (ruler === null) throw new Error('No ruler.')

      fireEvent.pointerDown(ruler, { clientX: 500, button: 0 })

      expect(player.seek).toHaveBeenCalledWith(10_000)
      expect(useViewStore.getState().playTimeMs).toBe(10_000)
    })

    it('passes the zoom and the scroll offset of the view store to the waveform', async () => {
      const { player } = await renderStage()
      expect(player.setView).toHaveBeenLastCalledWith(null, 0)

      act(() => useViewStore.setState({ pxPerSecond: 200, scrollMs: 4000 }))

      expect(player.setView).toHaveBeenLastCalledWith(200, 4000)
    })

    it('scrolls in time for the wheel and zooms at the pointer for Ctrl with the wheel', async () => {
      const { container } = await renderStage()
      const stage = container.querySelector('.stage')
      if (stage === null) throw new Error('No stage.')
      act(() => useViewStore.setState({ pxPerSecond: 100, scrollMs: 2000 }))

      const scroll = new WheelEvent('wheel', { deltaY: 100, cancelable: true })
      act(() => {
        stage.dispatchEvent(scroll)
      })
      expect(scroll.defaultPrevented).toBe(true)
      expect(useViewStore.getState().scrollMs).toBe(3000)

      // The pointer at 200 px shows 5000 ms, and it shows 5000 ms after the zoom too.
      act(() => {
        stage.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -300, ctrlKey: true, clientX: 200, cancelable: true }),
        )
      })
      expect(useViewStore.getState().pxPerSecond).toBeCloseTo(200)
      expect(useViewStore.getState().scrollMs).toBeCloseTo(4000)
    })

    it('leaves the wheel to the page at the default zoom', async () => {
      const { container } = await renderStage()
      const scroll = new WheelEvent('wheel', { deltaY: 100, cancelable: true })

      container.querySelector('.stage')?.dispatchEvent(scroll)

      expect(scroll.defaultPrevented).toBe(false)
      expect(useViewStore.getState().scrollMs).toBe(0)
    })

    it('follows the play cursor during play so that it stays in view', async () => {
      const { player } = await renderStage()
      act(() => useViewStore.setState({ pxPerSecond: 100, scrollMs: 0 }))
      await userEvent.click(screen.getByRole('button', { name: 'Play' }))

      act(() => player.listeners.onTime(9000))
      expect(useViewStore.getState().scrollMs).toBe(0)
      act(() => player.listeners.onTime(10_000))

      expect(useViewStore.getState().scrollMs).toBe(10_000)
      expect(screen.getByTestId('play-cursor')).toHaveStyle({ transform: 'translateX(0px)' })
    })

    it('does not follow the play cursor while play is paused', async () => {
      const { player } = await renderStage()
      act(() => useViewStore.setState({ pxPerSecond: 100, scrollMs: 0 }))

      act(() => player.listeners.onTime(15_000))

      expect(useViewStore.getState().scrollMs).toBe(0)
      expect(screen.queryByTestId('play-cursor')).toBeNull()
    })
  })
})

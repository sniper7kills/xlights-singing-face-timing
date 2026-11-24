import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIBRARY_HASH } from '../../app/routes.ts'
import { breakDownWords } from '../../store/actions/breakDown.ts'
import { startAutosave, useAutosaveStore } from '../../store/autosave.ts'
import * as db from '../../store/db.ts'
import { loadSong, StorageFullError } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { DictionaryLoadError } from '../phoneme-breakdown/loadDictionary.ts'
import { runTranscription } from '../transcription/runTranscription.ts'
import { EditorPage } from './EditorPage.tsx'
import { createWaveformPlayer } from './waveformPlayer.ts'

vi.mock('./waveformPlayer.ts', () => ({ createWaveformPlayer: vi.fn() }))
vi.mock('../../store/actions/breakDown.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/actions/breakDown.ts')>()),
  breakDownWords: vi.fn(),
}))
vi.mock('../transcription/runTranscription.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../transcription/runTranscription.ts')>()),
  runTranscription: vi.fn(),
}))

const audio = {
  data: new Blob([new Uint8Array([1])], { type: 'audio/ogg' }),
  fileName: 'carol.ogg',
  mimeType: 'audio/ogg',
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(createWaveformPlayer).mockReturnValue(new Promise(() => undefined))
  useAutosaveStore.setState({ saveState: 'saved', error: null })
  useSongStore.getState().closeSong()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.location.hash = ''
})

async function renderEditor() {
  const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
  const view = render(<EditorPage songId={song.id} />)
  await screen.findByRole('heading', { level: 2, name: 'carol' })
  return { song, view }
}

function topBarTranscribe(): HTMLElement {
  const bar = screen.getByRole('heading', { level: 2 }).parentElement
  if (bar === null) throw new Error('The editor has no top bar.')
  return within(bar).getByRole('button', { name: 'Transcribe' })
}

describe('EditorPage', () => {
  it('shows a link back to the song library and the song name in the top bar', async () => {
    await renderEditor()

    expect(screen.getByRole('link', { name: 'Back to song library' })).toHaveAttribute(
      'href',
      LIBRARY_HASH,
    )
    expect(screen.getByRole('region', { name: 'Waveform' })).toBeInTheDocument()
  })

  it('shows the layers of the song under the waveform, also before the audio loads', async () => {
    await renderEditor()

    const layers = screen.getByRole('region', { name: 'Layers' })
    expect(screen.getByRole('region', { name: 'Waveform' })).toContainElement(layers)
    expect(layers).toHaveTextContent('No marks yet. Select Transcribe to find the words.')
  })

  it('opens the transcribe dialog from the top bar and gives the focus back on close', async () => {
    const user = userEvent.setup()
    await renderEditor()
    const action = topBarTranscribe()
    await user.click(action)

    const dialog = screen.getByRole('dialog', { name: 'Transcribe' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(action).toHaveFocus()
  })

  it('closes the dialog after a run and gives the focus back to the action', async () => {
    vi.mocked(runTranscription).mockResolvedValue({
      wordCount: 16,
      estimatedCount: 0,
      breakDownFailure: null,
    })
    const user = userEvent.setup()
    await renderEditor()
    const action = topBarTranscribe()
    await user.click(action)
    const start = within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' })
    await vi.waitFor(() => expect(start).toBeEnabled())

    await user.click(start)

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(action).toHaveFocus()
  })

  it('shows the toast with the word count and the estimated count after a run', async () => {
    vi.mocked(runTranscription).mockResolvedValue({
      wordCount: 214,
      estimatedCount: 9,
      breakDownFailure: null,
    })
    const user = userEvent.setup()
    await renderEditor()
    await user.click(topBarTranscribe())
    const start = within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' })
    await vi.waitFor(() => expect(start).toBeEnabled())

    await user.click(start)

    expect(await screen.findByText('214 words, 9 estimated')).toHaveAttribute('role', 'status')
  })

  it('shows the dictionary failure after a run, and removes it when "Retry" breaks down the words', async () => {
    const message = 'The dictionary did not load. Check the connection and retry.'
    vi.mocked(runTranscription).mockResolvedValue({
      wordCount: 2,
      estimatedCount: 0,
      breakDownFailure: { message, wordIds: ['word-1', 'word-2'] },
    })
    vi.mocked(breakDownWords)
      .mockRejectedValueOnce(new DictionaryLoadError())
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    await renderEditor()
    await user.click(topBarTranscribe())
    const start = within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' })
    await vi.waitFor(() => expect(start).toBeEnabled())
    await user.click(start)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(breakDownWords).toHaveBeenLastCalledWith(['word-1', 'word-2'])
    expect(await screen.findByRole('alert')).toHaveTextContent(message)

    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }))
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(breakDownWords).toHaveBeenCalledTimes(2)
  })

  it('shows the copy of the feature file, not the raw error text, when "Retry" fails for another reason', async () => {
    vi.mocked(runTranscription).mockResolvedValue({
      wordCount: 2,
      estimatedCount: 0,
      breakDownFailure: {
        message: 'The dictionary did not load. Check the connection and retry.',
        wordIds: ['word-1', 'word-2'],
      },
    })
    vi.mocked(breakDownWords).mockRejectedValueOnce(new Error('IndexedDB is locked'))
    const user = userEvent.setup()
    await renderEditor()
    await user.click(topBarTranscribe())
    const start = within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' })
    await vi.waitFor(() => expect(start).toBeEnabled())
    await user.click(start)

    await user.click(
      within(await screen.findByRole('alert')).getByRole('button', { name: 'Retry' }),
    )

    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The app could not break down the words. Select Retry.',
      ),
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('IndexedDB is locked')
  })

  it('shows no "Transcribe" action for a song with no voice', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio, voices: [] })
    render(<EditorPage songId={song.id} />)
    const heading = await screen.findByRole('heading', { level: 2, name: 'carol' })

    const bar = within(heading.parentElement ?? document.body)
    expect(bar.queryByRole('button', { name: 'Transcribe' })).toBeNull()
    expect(bar.getByRole('button', { name: 'Custom dictionary' })).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })

  it('shows the "Transcribe", "Custom dictionary" and "Export" actions in this order in the top bar', async () => {
    await renderEditor()
    const bar = screen.getByRole('heading', { level: 2 }).parentElement ?? document.body

    const names = within(bar)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(names).toEqual(['Transcribe', 'Custom dictionary', 'Export'])
  })

  it('shows no "Transcribe" button in the empty state of the layers for a song with no voice', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio, voices: [] })
    render(<EditorPage songId={song.id} />)
    await screen.findByRole('heading', { level: 2, name: 'carol' })

    const layers = screen.getByRole('region', { name: 'Layers' })
    expect(within(layers).queryByRole('button', { name: 'Transcribe' })).toBeNull()
  })

  it('opens the transcribe dialog from the empty state of the layers', async () => {
    const user = userEvent.setup()
    await renderEditor()

    const layers = screen.getByRole('region', { name: 'Layers' })
    await user.click(within(layers).getByRole('button', { name: 'Transcribe' }))

    expect(screen.getByRole('dialog', { name: 'Transcribe' })).toBeInTheDocument()
  })

  it('disables the "Transcribe" action of the top bar during a run', async () => {
    vi.mocked(runTranscription).mockReturnValue(new Promise(() => undefined))
    const user = userEvent.setup()
    await renderEditor()
    await user.click(topBarTranscribe())
    const dialog = screen.getByRole('dialog', { name: 'Transcribe' })
    const start = within(dialog).getByRole('button', { name: 'Start' })
    await vi.waitFor(() => expect(start).toBeEnabled())

    await user.click(start)

    expect(topBarTranscribe()).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(topBarTranscribe()).toBeEnabled()
  })

  it('shows "Saved" and then "Saving" while a change waits for its save', async () => {
    await renderEditor()
    expect(screen.getByText('Saved')).toBeInTheDocument()

    act(() => useAutosaveStore.setState({ saveState: 'saving' }))

    expect(screen.getByText('Saving')).toBeInTheDocument()
  })

  it('shows the storage-full message when the autosave fails for a full storage', async () => {
    await renderEditor()

    act(() => useAutosaveStore.setState({ saveState: 'saving', error: new StorageFullError() }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Browser storage is full. Delete a song and try again.',
    )
  })

  it('shows the unknown-word counter and "Add to custom dictionary" in the toolbar under the waveform region', async () => {
    const user = userEvent.setup()
    await renderEditor()
    const content = useSongStore.getState().current
    if (content === null) throw new Error('The editor has no open song.')
    const voiceId = content.voices[0]?.id ?? ''
    act(() =>
      useSongStore.setState({
        current: {
          ...content,
          marks: [
            {
              id: 'zxqv',
              voiceId,
              layer: 'word',
              label: 'Zxqv',
              startMs: 500,
              endMs: 1000,
              parentId: null,
              edited: false,
              unknown: true,
            },
          ],
        },
      }),
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Editor tools' })
    expect(toolbar).toHaveClass('editor-toolbar')
    expect(
      screen.getByRole('region', { name: 'Waveform' }).compareDocumentPosition(toolbar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await user.click(within(toolbar).getByRole('button', { name: '1 unknown word' }))
    expect(useViewStore.getState().selectedMarkIds).toEqual(['zxqv'])
    expect(within(toolbar).getByRole('button', { name: 'Add to custom dictionary' })).toBeVisible()
  })

  it('opens the song at the default view and at time 0', async () => {
    useViewStore.setState({ pxPerSecond: 300, scrollMs: 5000, playTimeMs: 7000 })

    await renderEditor()

    expect(useViewStore.getState()).toMatchObject({ pxPerSecond: null, scrollMs: 0, playTimeMs: 0 })
  })

  it('saves a pending change and closes the song when the person leaves the editor', async () => {
    const stopAutosave = startAutosave()
    try {
      const { song, view } = await renderEditor()
      act(() =>
        useSongStore
          .getState()
          .apply((content) => ({ ...content, song: { ...content.song, name: 'noel' } })),
      )

      view.unmount()

      expect(useSongStore.getState().current).toBeNull()
      await vi.waitFor(async () => expect((await loadSong(song.id))?.song.name).toBe('noel'))
    } finally {
      stopAutosave()
    }
  })

  it('goes back to the song library for a song that does not exist', async () => {
    window.location.hash = '#/song/gone'

    render(<EditorPage songId="gone" />)

    await vi.waitFor(() => expect(window.location.hash).toBe(LIBRARY_HASH))
  })

  it('goes back to the song library when the app cannot read the song', async () => {
    vi.spyOn(db, 'loadSong').mockRejectedValue(new Error('The disk is gone.'))
    window.location.hash = '#/song/song-1'

    render(<EditorPage songId="song-1" />)

    await vi.waitFor(() => expect(window.location.hash).toBe(LIBRARY_HASH))
  })

  it('stays on the route when an open ends after the person left the editor', async () => {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const load = vi.spyOn(db, 'loadSong').mockImplementation(async () => {
      await held
      return undefined
    })
    window.location.hash = '#/song/other'
    const view = render(<EditorPage songId="gone" />)
    await vi.waitFor(() => expect(load).toHaveBeenCalled())

    view.unmount()
    release()
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

    expect(window.location.hash).toBe('#/song/other')
  })

  it('shows the zoom slider in the editor tools under the stage', async () => {
    await renderEditor()

    const toolbar = screen.getByRole('toolbar', { name: 'Editor tools' })
    expect(within(toolbar).getByRole('slider', { name: 'Zoom' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Waveform' }).compareDocumentPosition(toolbar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('opens a song at the zoom and the scroll offset that the browser keeps for it', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    localStorage.setItem(`sft.view.${song.id}`, JSON.stringify({ pxPerSecond: 400, scrollMs: 900 }))

    render(<EditorPage songId={song.id} />)
    await screen.findByRole('heading', { level: 2, name: 'carol' })

    expect(useViewStore.getState()).toMatchObject({ pxPerSecond: 400, scrollMs: 900 })
  })

  it('keeps a change of the zoom and the scroll offset for the song', async () => {
    const { song } = await renderEditor()

    act(() => {
      useViewStore.getState().setZoom(250)
      useViewStore.getState().setScroll(1200)
    })

    expect(JSON.parse(localStorage.getItem(`sft.view.${song.id}`) ?? 'null')).toEqual({
      pxPerSecond: 250,
      scrollMs: 1200,
    })
  })

  it('shows the note for a window narrower than 1024 px and hides the editor', async () => {
    const width = window.innerWidth
    try {
      await renderEditor()
      expect(screen.getByText(/needs a window/)).not.toBeVisible()

      act(() => {
        window.innerWidth = 1023
        window.dispatchEvent(new Event('resize'))
      })

      expect(
        screen.getByText('The editor needs a window that is 1024 px wide or more.'),
      ).toBeVisible()
      expect(screen.queryByRole('region', { name: 'Waveform' })).toBeNull()
    } finally {
      window.innerWidth = width
    }
  })

  it('passes the time selection to the transcribe dialog', async () => {
    const user = userEvent.setup()
    await renderEditor()
    act(() => useViewStore.getState().setSelection({ startMs: 500, endMs: 1500 }))

    await user.click(topBarTranscribe())

    expect(
      await screen.findByRole('radio', { name: 'The time selection 0:00.500 to 0:01.500' }),
    ).toBeInTheDocument()
  })
})

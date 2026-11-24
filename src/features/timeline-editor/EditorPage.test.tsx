import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LIBRARY_HASH } from '../../app/routes.ts'
import { useAutosaveStore } from '../../store/autosave.ts'
import { StorageFullError } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { EditorPage } from './EditorPage.tsx'
import { createWaveformPlayer } from './waveformPlayer.ts'

vi.mock('./waveformPlayer.ts', () => ({ createWaveformPlayer: vi.fn() }))

const audio = {
  data: new Blob([new Uint8Array([1])], { type: 'audio/ogg' }),
  fileName: 'carol.ogg',
  mimeType: 'audio/ogg',
}

beforeEach(() => {
  vi.mocked(createWaveformPlayer).mockReturnValue(new Promise(() => undefined))
  useAutosaveStore.setState({ saveState: 'saved', error: null })
  useSongStore.getState().closeSong()
})

async function renderEditor() {
  const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
  render(<EditorPage songId={song.id} />)
  await screen.findByRole('heading', { level: 2, name: 'carol' })
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

  it('opens the song at the default view and at time 0', async () => {
    useViewStore.setState({ pxPerSecond: 300, scrollMs: 5000, playTimeMs: 7000 })

    await renderEditor()

    expect(useViewStore.getState()).toMatchObject({ pxPerSecond: null, scrollMs: 0, playTimeMs: 0 })
  })
})

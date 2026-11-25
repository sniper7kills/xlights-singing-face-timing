import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import marksFile from '../../public/demo/silent-night.marks.json?raw'
import {
  removeStorageStub,
  stubStorage,
} from '../features/audio-import/storageStub.test-helpers.ts'
import { storeNewSong } from '../features/audio-import/storeNewSong.ts'
import { listSongs, loadSong } from '../store/db.ts'
import { useSongStore } from '../store/songStore.ts'
import { setPageNotice } from './pageNotice.ts'
import { SongLibraryPage } from './SongLibraryPage.tsx'

const MB = 1024 * 1024
const audio = {
  data: new Blob([new Uint8Array([1])]),
  fileName: 'carol.mp3',
  mimeType: 'audio/mpeg',
}
const NOTE = 'The browser can remove songs when disk space is low. Export your work.'

afterEach(() => {
  removeStorageStub()
  useSongStore.getState().closeSong()
  vi.unstubAllGlobals()
  window.location.hash = ''
})

describe('SongLibraryPage', () => {
  it('shows the drop zone in the main area and no song list when no songs exist', async () => {
    render(<SongLibraryPage databaseStatus="ready" />)

    expect(await screen.findByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Drop zone' })).not.toHaveClass('compact')
    expect(screen.queryByRole('region', { name: 'Your songs' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'How it works' })).toBeInTheDocument()
  })

  it('shows the build of the app in the footer', async () => {
    render(<SongLibraryPage databaseStatus="ready" />)

    expect(await screen.findByText(`Build ${__APP_BUILD__}`)).toBeInTheDocument()
    expect(__APP_BUILD__).toMatch(/^([0-9a-f]{7}|dev)$/)
  })

  it('shows the saved songs below a compact drop zone', async () => {
    await storeNewSong({ name: 'carol', durationMs: 3000, audio })

    render(<SongLibraryPage databaseStatus="ready" />)

    const list = await screen.findByRole('region', { name: 'Your songs' })
    expect(within(list).getByRole('link', { name: /carol/ })).toHaveTextContent('0:03')
    expect(screen.getByRole('region', { name: 'Drop zone' })).toHaveClass('compact')
    expect(screen.queryByRole('heading', { name: 'No songs yet' })).not.toBeInTheDocument()
  })

  it('saves a new name in the database', async () => {
    const user = userEvent.setup()
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    render(<SongLibraryPage databaseStatus="ready" />)

    await user.click(await screen.findByRole('button', { name: 'Rename carol' }))
    await user.clear(screen.getByLabelText('Song name'))
    await user.type(screen.getByLabelText('Song name'), 'Silent Night{Enter}')

    expect(await screen.findByRole('link', { name: /Silent Night/ })).toBeInTheDocument()
    expect((await loadSong(song.id))?.song.name).toBe('Silent Night')
  })

  it('deletes the song from the database after the confirm and shows the empty library', async () => {
    const user = userEvent.setup()
    await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    render(<SongLibraryPage databaseStatus="ready" />)

    await user.click(await screen.findByRole('button', { name: 'Delete carol' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    expect(await screen.findByRole('heading', { name: 'No songs yet' })).toBeInTheDocument()
    expect(await listSongs()).toEqual([])
  })

  it('closes the open song before the delete', async () => {
    const user = userEvent.setup()
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    await useSongStore.getState().openSong(song.id)
    render(<SongLibraryPage databaseStatus="ready" />)

    await user.click(await screen.findByRole('button', { name: 'Delete carol' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    await screen.findByRole('heading', { name: 'No songs yet' })
    expect(useSongStore.getState().current).toBeNull()
  })

  it('reads the storage again after a delete, so the meter goes down', async () => {
    const user = userEvent.setup()
    await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    const storage = stubStorage({ granted: true, usage: 5 * MB, quota: 512 * MB })
    render(<SongLibraryPage databaseStatus="ready" />)
    expect(await screen.findByText('5.0 MB used of 512 MB allowed')).toBeInTheDocument()

    storage.estimate.mockResolvedValue({ usage: 1 * MB, quota: 512 * MB })
    await user.click(screen.getByRole('button', { name: 'Delete carol' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )

    expect(await screen.findByText('1.0 MB used of 512 MB allowed')).toBeInTheDocument()
  })

  it('shows the note beside the storage meter when the browser refuses persistent storage', async () => {
    await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    stubStorage({ granted: false })

    render(<SongLibraryPage databaseStatus="ready" />)

    const meter = await screen.findByRole('region', { name: 'Browser storage' })
    expect(within(meter).getByRole('note')).toHaveTextContent(NOTE)
  })

  it('shows no note before the first song', async () => {
    stubStorage({ granted: false })

    render(<SongLibraryPage databaseStatus="ready" />)

    await screen.findByRole('region', { name: 'Browser storage' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('creates the demo song and opens the editor when the person selects the demo button', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(new Response(url.endsWith('.json') ? marksFile : new Uint8Array([1]))),
    )
    render(<SongLibraryPage databaseStatus="ready" />)

    await user.click(await screen.findByRole('button', { name: 'Try the demo song' }))

    await vi.waitFor(() => expect(window.location.hash).toMatch(/^#\/song\/[0-9a-f-]+$/))
    const [song] = await listSongs()
    expect(window.location.hash).toBe(`#/song/${song?.id}`)
  })

  it('shows the load message and creates no song when a demo file does not load', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    render(<SongLibraryPage databaseStatus="ready" />)
    const button = await screen.findByRole('button', { name: 'Try the demo song' })

    await user.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The demo song did not load. Check the connection and retry.',
    )
    expect(button).toBeEnabled()
    expect(await listSongs()).toEqual([])
  })

  it('shows the demo button and the file limits beside "Add a song" when songs exist', async () => {
    await storeNewSong({ name: 'carol', durationMs: 3000, audio })

    render(<SongLibraryPage databaseStatus="ready" />)

    await screen.findByRole('region', { name: 'Your songs' })
    const dropZone = screen.getByRole('region', { name: 'Drop zone' })
    expect(within(dropZone).getByRole('button', { name: 'Try the demo song' })).toBeEnabled()
    expect(dropZone).toHaveTextContent('200 MB and 15 minutes at most')
  })

  it.each([
    ['no songs exist', false],
    ['songs exist', true],
  ])('states the purpose of the app above the drop zone when %s', async (_, withSong) => {
    if (withSong) await storeNewSong({ name: 'carol', durationMs: 3000, audio })

    render(<SongLibraryPage databaseStatus="ready" />)

    const intro = await screen.findByText(/^Make the face models of your xLights show sing\./)
    expect(intro).toHaveTextContent(
      'Make the face models of your xLights show sing. Add a song, and the app finds each word and its mouth shapes, then gives you a timing file for the Faces effect.',
    )
    const dropZone = screen.getByRole('region', { name: 'Drop zone' })
    expect(intro.compareDocumentPosition(dropZone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the message for a song that the editor did not find, one time only', async () => {
    setPageNotice('song-not-found')

    const view = render(<SongLibraryPage databaseStatus="ready" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The app did not find this song. It is possible that the song was deleted.',
    )
    view.unmount()
    render(<SongLibraryPage databaseStatus="ready" />)
    await screen.findByRole('heading', { name: 'No songs yet' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

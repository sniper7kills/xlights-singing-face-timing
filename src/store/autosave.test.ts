import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DELAY_MS, startAutosave, useAutosaveStore, useSaveState } from './autosave.ts'
import * as db from './db.ts'
import { closeDatabase, loadSong, saveSong } from './db.ts'
import { makeSongContent } from './fixtures.test-helpers.ts'
import { useSongStore, type Step } from './songStore.ts'

const relabel =
  (label: string): Step =>
  (content) => ({
    ...content,
    marks: content.marks.map((mark, index) => (index === 0 ? { ...mark, label } : mark)),
  })

let stopAutosave: () => void

beforeEach(async () => {
  await saveSong(makeSongContent('song-1'))
  await saveSong(makeSongContent('song-2'))
  await useSongStore.getState().openSong('song-1')
  useAutosaveStore.setState({ saveState: 'saved', error: null })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  stopAutosave = startAutosave()
})

afterEach(() => {
  stopAutosave()
  vi.useRealTimers()
  vi.restoreAllMocks()
  useSongStore.getState().closeSong()
})

async function savedLabel(songId: string) {
  // Each await lets the fake IndexedDB finish its pending transactions.
  await vi.waitFor(() => expect(useAutosaveStore.getState().saveState).toBe('saved'))
  return (await loadSong(songId))?.marks.find((mark) => mark.id === `${songId}-phrase`)?.label
}

describe('autosave', () => {
  it('saves the open song 1 second after the last change, and not before', async () => {
    const save = vi.spyOn(db, 'saveSong')
    useSongStore.getState().apply(relabel('one'))
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100)
    useSongStore.getState().apply(relabel('two'))
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(save).toHaveBeenCalledTimes(1)
    expect(await savedLabel('song-1')).toBe('two')
  })

  it('keeps an edit after a reload 2 seconds later', async () => {
    useSongStore.getState().apply(relabel('holy night'))
    vi.advanceTimersByTime(2000)
    await vi.waitFor(() => expect(useAutosaveStore.getState().saveState).toBe('saved'))

    // A reload drops the connection and the store state.
    await closeDatabase()
    useSongStore.getState().closeSong()
    await useSongStore.getState().openSong('song-1')

    expect(useSongStore.getState().current?.marks[0]?.label).toBe('holy night')
  })

  it('saves an undo like any other change', async () => {
    useSongStore.getState().apply(relabel('holy night'))
    useSongStore.getState().undo()
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)

    expect(await savedLabel('song-1')).toBe('silent night')
  })

  it('shows saving from the change until the save ends, then saved', async () => {
    const { result } = renderHook(() => useSaveState())
    expect(result.current).toBe('saved')

    useSongStore.getState().apply(relabel('holy night'))
    expect(useAutosaveStore.getState().saveState).toBe('saving')

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    await vi.waitFor(() => expect(useAutosaveStore.getState().saveState).toBe('saved'))
  })

  it('saves a pending change at once when the person opens another song', async () => {
    useSongStore.getState().apply(relabel('holy night'))

    await useSongStore.getState().openSong('song-2')

    expect(await savedLabel('song-1')).toBe('holy night')
  })

  it('saves nothing when the person opens a song with no change', async () => {
    const save = vi.spyOn(db, 'saveSong')

    await useSongStore.getState().openSong('song-2')
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)

    expect(save).not.toHaveBeenCalled()
  })

  it('keeps the save state at saving and records the error when the save fails', async () => {
    vi.spyOn(db, 'saveSong').mockRejectedValue(new db.StorageFullError())
    useSongStore.getState().apply(relabel('holy night'))
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)

    await vi.waitFor(() =>
      expect(useAutosaveStore.getState().error).toBeInstanceOf(db.StorageFullError),
    )
    expect(useAutosaveStore.getState().saveState).toBe('saving')
  })

  it('stops the saves after the stop function runs', () => {
    const save = vi.spyOn(db, 'saveSong')
    stopAutosave()

    useSongStore.getState().apply(relabel('holy night'))
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)

    expect(save).not.toHaveBeenCalled()
  })
})

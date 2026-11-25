import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOSAVE_DELAY_MS,
  AUTOSAVE_MAX_WAIT_MS,
  dropPendingChange,
  flushAutosave,
  flushBeforeLeave,
  LEAVE_WAIT_MS,
  SAVE_LIMIT_MS,
  SaveTimeoutError,
  startAutosave,
  useAutosaveStore,
  useSaveState,
} from './autosave.ts'
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
  // The save transaction ends after the timer fires, so the test waits for the save state.
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

    // The save starts after the saves before it end, so the test waits for the save state.
    expect(await savedLabel('song-1')).toBe('two')
    expect(save).toHaveBeenCalledTimes(1)
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

  it('keeps an edit when the person opens the same song again before the save', async () => {
    useSongStore.getState().apply(relabel('holy night'))

    await useSongStore.getState().openSong('song-1')

    expect(useSongStore.getState().current?.marks[0]?.label).toBe('holy night')
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    // A reload drops the connection and the store state.
    await closeDatabase()
    useSongStore.getState().closeSong()
    await useSongStore.getState().openSong('song-1')
    expect(useSongStore.getState().current?.marks[0]?.label).toBe('holy night')
  })

  it('saves nothing when the person opens the same song again with no change', async () => {
    const save = vi.spyOn(db, 'saveSong')

    await useSongStore.getState().openSong('song-1')
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)

    expect(save).not.toHaveBeenCalled()
    expect(useAutosaveStore.getState().saveState).toBe('saved')
  })

  it('saves the change of a failed save when the song closes', async () => {
    vi.spyOn(db, 'saveSong').mockRejectedValueOnce(new db.StorageFullError())
    useSongStore.getState().apply(relabel('holy night'))
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    await vi.waitFor(() =>
      expect(useAutosaveStore.getState().error).toBeInstanceOf(db.StorageFullError),
    )

    useSongStore.getState().closeSong()

    expect(await savedLabel('song-1')).toBe('holy night')
    expect(useAutosaveStore.getState().error).toBeNull()
  })

  it('keeps the change of a failed save when the person opens the song again', async () => {
    vi.spyOn(db, 'saveSong').mockRejectedValue(new db.StorageFullError())
    useSongStore.getState().apply(relabel('holy night'))
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
    await vi.waitFor(() =>
      expect(useAutosaveStore.getState().error).toBeInstanceOf(db.StorageFullError),
    )

    useSongStore.getState().closeSong()
    await useSongStore.getState().openSong('song-1')

    expect(useSongStore.getState().current?.marks[0]?.label).toBe('holy night')
    expect(useAutosaveStore.getState().saveState).toBe('saving')
  })

  it('saves 4 times or more during changes each 200 ms for 10 seconds', async () => {
    const save = vi.spyOn(db, 'saveSong').mockResolvedValue(makeSongContent().song)

    for (let change = 1; change <= 50; change += 1) {
      useSongStore.getState().apply(relabel(`change ${change}`))
      await vi.advanceTimersByTimeAsync(200)
    }

    // A save starts at the maximum wait, 2, 4, 6, 8 and 10 seconds after the first change.
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(save).toHaveBeenCalledTimes(10_000 / AUTOSAVE_MAX_WAIT_MS)
  })

  it('starts a save at the maximum wait after the first change, also while changes continue', async () => {
    const save = vi.spyOn(db, 'saveSong').mockResolvedValue(makeSongContent().song)
    useSongStore.getState().apply(relabel('one'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    useSongStore.getState().apply(relabel('two'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    useSongStore.getState().apply(relabel('three'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MAX_WAIT_MS - 2 * (AUTOSAVE_DELAY_MS - 100) - 1)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0].marks[0]?.label).toBe('three')
  })

  it('runs one save at a time, and the queued save writes the newest change', async () => {
    let running = 0
    let mostRunning = 0
    const ends: (() => void)[] = []
    const save = vi.spyOn(db, 'saveSong').mockImplementation(
      (content) =>
        new Promise((resolve) => {
          running += 1
          mostRunning = Math.max(mostRunning, running)
          ends.push(() => {
            running -= 1
            resolve(content.song)
          })
        }),
    )
    useSongStore.getState().apply(relabel('one'))
    void flushAutosave()
    useSongStore.getState().apply(relabel('two'))
    void flushAutosave()
    useSongStore.getState().apply(relabel('three'))
    const done = flushAutosave()
    expect(save).toHaveBeenCalledTimes(1)
    expect(useAutosaveStore.getState().saveState).toBe('saving')

    ends.shift()?.()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(useAutosaveStore.getState().saveState).toBe('saving')
    ends.shift()?.()

    expect(await done).toBeNull()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]?.[0].marks[0]?.label).toBe('three')
    expect(mostRunning).toBe(1)
    expect(useAutosaveStore.getState().saveState).toBe('saved')
  })

  it('saves again with the next change after a failed save', async () => {
    const save = vi.spyOn(db, 'saveSong').mockRejectedValueOnce(new db.StorageFullError())
    useSongStore.getState().apply(relabel('holy night'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    await vi.waitFor(() =>
      expect(useAutosaveStore.getState().error).toBeInstanceOf(db.StorageFullError),
    )
    expect(useAutosaveStore.getState().saveState).toBe('saving')

    useSongStore.getState().apply(relabel('holy night 2'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    expect(await savedLabel('song-1')).toBe('holy night 2')
    expect(save).toHaveBeenCalledTimes(2)
    expect(useAutosaveStore.getState().error).toBeNull()
  })

  it('saves a song with 3 000 marks in less than 2 seconds in fake-indexeddb', async () => {
    const content = makeSongContent('song-big')
    const phrase = content.marks[0]
    if (!phrase) throw new Error('The fixture has no phrase.')
    const marks = Array.from({ length: 3000 }, (_, index) => ({
      ...phrase,
      id: `song-big-mark-${index}`,
      startMs: index * 50,
      endMs: index * 50 + 50,
    }))
    await saveSong({ ...content, marks })

    const start = performance.now()
    await saveSong({ ...content, marks: marks.map((mark) => ({ ...mark, edited: true })) })
    const elapsed = performance.now() - start

    // fake-indexeddb runs in Node, so the time is a rough check only, not a browser time.
    expect(elapsed).toBeLessThan(2000)
  })

  it('counts a save that does not end in 10 seconds as failed, and the next change saves again', async () => {
    const save = vi.spyOn(db, 'saveSong').mockImplementationOnce(() => new Promise(() => undefined))
    useSongStore.getState().apply(relabel('holy night'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + SAVE_LIMIT_MS - 1)
    expect(useAutosaveStore.getState().error).toBeNull()

    await vi.advanceTimersByTimeAsync(1)
    expect(useAutosaveStore.getState().error).toBeInstanceOf(SaveTimeoutError)
    expect(useAutosaveStore.getState().error?.message).toBe(
      'The app could not save the song. Try again.',
    )

    useSongStore.getState().apply(relabel('holy night 2'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(await savedLabel('song-1')).toBe('holy night 2')
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('passes the unloading option to the first save of the flush only', async () => {
    const ends: (() => void)[] = []
    const save = vi.spyOn(db, 'saveSong').mockImplementation(
      (content) =>
        new Promise((resolve) => {
          ends.push(() => resolve(content.song))
        }),
    )
    useSongStore.getState().apply(relabel('one'))
    void flushAutosave({ unloading: true })
    useSongStore.getState().apply(relabel('two'))
    const done = flushAutosave()
    ends.shift()?.()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    ends.shift()?.()
    await done

    expect(save.mock.calls[0]?.[2]).toEqual({ unloading: true })
    expect(save.mock.calls[1]?.[2]).toEqual({})
  })

  it('resolves the leave wait with true when the save ends in time', async () => {
    useSongStore.getState().apply(relabel('holy night'))

    expect(await flushBeforeLeave()).toBe(true)
    expect(await savedLabel('song-1')).toBe('holy night')
  })

  it('resolves the leave wait with false and records the error when the save does not end in 3 seconds', async () => {
    vi.spyOn(db, 'saveSong').mockImplementation(() => new Promise(() => undefined))
    useSongStore.getState().apply(relabel('holy night'))
    const leave = flushBeforeLeave()

    await vi.advanceTimersByTimeAsync(LEAVE_WAIT_MS)

    expect(await leave).toBe(false)
    expect(useAutosaveStore.getState().error).toBeInstanceOf(SaveTimeoutError)
    // The write ends at its own limit, so the next test finds no running write.
    await vi.advanceTimersByTimeAsync(SAVE_LIMIT_MS)
  })

  it('drops the change of a song that failed to save when a different song opens, and keeps the error', async () => {
    vi.spyOn(db, 'saveSong').mockRejectedValueOnce(new db.StorageFullError())
    useSongStore.getState().apply(relabel('holy night'))

    await useSongStore.getState().openSong('song-2')
    expect(useAutosaveStore.getState().error).toBeInstanceOf(db.StorageFullError)
    useSongStore.getState().apply(relabel('o come'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    expect(await savedLabel('song-2')).toBe('o come')
    expect(await savedLabel('song-1')).toBe('silent night')
  })

  it('keeps the change in the autosave when a different change is pending at the drop', () => {
    useSongStore.getState().apply(relabel('holy night'))

    dropPendingChange(makeSongContent('song-1'))

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

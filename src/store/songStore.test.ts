import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveSong } from './db.ts'
import { makeSongContent } from './fixtures.test-helpers.ts'
import { useSongStore, type Step } from './songStore.ts'

const renameFirstMark =
  (label: string): Step =>
  (content) => ({
    ...content,
    marks: content.marks.map((mark, index) =>
      index === 0 ? { ...mark, label, edited: true } : mark,
    ),
  })

const firstLabel = () => useSongStore.getState().current?.marks[0]?.label

beforeEach(async () => {
  const content = makeSongContent()
  await saveSong(content)
  await useSongStore.getState().openSong(content.song.id)
})

afterEach(() => {
  useSongStore.getState().closeSong()
})

describe('useSongStore', () => {
  it('opens the saved song with its voices, sections and marks and an empty history', async () => {
    const { current, history } = useSongStore.getState()

    expect(current?.song.name).toBe('Silent Night')
    expect(current?.voices).toHaveLength(1)
    expect(current?.sections).toHaveLength(1)
    expect(current?.marks).toHaveLength(2)
    expect(history).toEqual({ past: [], future: [] })
  })

  it('returns false and has no open song for an id that no song has', async () => {
    expect(await useSongStore.getState().openSong('missing')).toBe(false)
    expect(useSongStore.getState().current).toBeNull()
  })

  it('applies a step and records it as one undo step', () => {
    useSongStore.getState().apply(renameFirstMark('holy night'))

    expect(firstLabel()).toBe('holy night')
    expect(useSongStore.getState().history.past).toHaveLength(1)
  })

  it('restores the state before the step on undo, and the step again on redo', () => {
    const before = useSongStore.getState().current
    useSongStore.getState().apply(renameFirstMark('holy night'))
    const after = useSongStore.getState().current

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toBe(before)

    useSongStore.getState().redo()
    expect(useSongStore.getState().current).toBe(after)
  })

  it('records nothing for a step that returns its input', () => {
    useSongStore.getState().apply((content) => content)

    expect(useSongStore.getState().history.past).toHaveLength(0)
  })

  it('ignores apply, undo and redo when no song is open', () => {
    useSongStore.getState().closeSong()

    useSongStore.getState().apply(renameFirstMark('holy night'))
    useSongStore.getState().undo()
    useSongStore.getState().redo()

    expect(useSongStore.getState().current).toBeNull()
    expect(useSongStore.getState().history).toEqual({ past: [], future: [] })
  })

  it('clears the history on close', () => {
    useSongStore.getState().apply(renameFirstMark('holy night'))

    useSongStore.getState().closeSong()

    expect(useSongStore.getState().history.past).toHaveLength(0)
  })
})

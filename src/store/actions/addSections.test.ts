import { beforeEach, describe, expect, it } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../history.ts'
import { useSongStore } from '../songStore.ts'
import type { Section, SongContent } from '../types.ts'
import { steps } from './actions.test-helpers.ts'
import { addSections } from './addSections.ts'

const sections = () =>
  (useSongStore.getState().current?.sections ?? []).map(({ name, startMs, endMs }) => ({
    name,
    startMs,
    endMs,
  }))

/** The test song with a 30-second duration and the sections. */
function songWith(list: Section[]): SongContent {
  const base = testContent()
  return { ...base, song: { ...base.song, durationMs: 30_000 }, sections: list }
}

beforeEach(() => {
  useSongStore.setState({ current: songWith([]), history: emptyHistory() })
})

describe('addSections', () => {
  it('adds three sections as one undo step', () => {
    const added = addSections('song-1', [
      { name: 'Verse 1', startMs: 0, endMs: 10_000 },
      { name: 'Chorus', startMs: 10_000, endMs: 20_000 },
      { name: 'Verse 2', startMs: 20_000, endMs: 30_000 },
    ])

    expect(added.map((section) => section.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2'])
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(sections()).toEqual([])
  })

  it('numbers a duplicate name', () => {
    addSections('song-1', [
      { name: 'Chorus', startMs: 0, endMs: 5000 },
      { name: 'Chorus', startMs: 5000, endMs: 10_000 },
    ])

    expect(sections().map((section) => section.name)).toEqual(['Chorus', 'Chorus 2'])
  })

  it('adds the items in time order, whatever the order of the list', () => {
    addSections('song-1', [
      { name: 'Late', startMs: 10_000, endMs: 20_000 },
      { name: 'Late', startMs: 0, endMs: 5000 },
    ])

    expect(sections()).toEqual([
      { name: 'Late', startMs: 0, endMs: 5000 },
      { name: 'Late 2', startMs: 10_000, endMs: 20_000 },
    ])
  })

  it('gives an item over a section that exists the free range, or no section', () => {
    const existing: Section = {
      id: 'a',
      songId: 'song-1',
      name: 'Bridge',
      startMs: 5000,
      endMs: 10_000,
    }
    useSongStore.setState({ current: songWith([existing]) })

    const added = addSections('song-1', [
      { name: 'Verse', startMs: 6000, endMs: 9000 },
      { name: 'Chorus', startMs: 8000, endMs: 15_000 },
    ])

    expect(added.map((section) => section.name)).toEqual(['Chorus'])
    expect(sections()).toEqual([
      { name: 'Bridge', startMs: 5000, endMs: 10_000 },
      { name: 'Chorus', startMs: 10_000, endMs: 15_000 },
    ])
  })

  it('records no step when it adds no section, or for another song', () => {
    expect(addSections('song-1', [])).toEqual([])
    expect(addSections('song-2', [{ name: 'Verse', startMs: 0, endMs: 5000 }])).toEqual([])
    expect(steps()).toBe(0)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../history.ts'
import { useSongStore } from '../songStore.ts'
import type { Section, SongContent } from '../types.ts'
import { steps } from './actions.test-helpers.ts'
import {
  addSection,
  addSectionStep,
  deleteSection,
  phrasesInSection,
  stepSectionEdge,
  updateSection,
} from './sections.ts'

const content = () => useSongStore.getState().current
const sections = () => content()?.sections ?? []

function section(id: string, startMs: number, endMs: number, name = id): Section {
  return { id, songId: 'song-1', name, startMs, endMs }
}

/** The test song with a 30-second duration and the sections. */
function songWith(list: Section[]): SongContent {
  const base = testContent()
  return { ...base, song: { ...base.song, durationMs: 30_000 }, sections: list }
}

beforeEach(() => {
  useSongStore.setState({ current: songWith([]), history: emptyHistory() })
})

describe('addSection', () => {
  it('makes a section from 0:10 to 0:25 as one undo step', () => {
    const added = addSection('song-1', 'Verse 1', 10_000, 25_000)

    expect(sections()).toEqual([
      { id: added?.id, songId: 'song-1', name: 'Verse 1', startMs: 10_000, endMs: 25_000 },
    ])
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(sections()).toEqual([])
  })

  it('returns null and records no step when no free range of 1 second exists', () => {
    useSongStore.setState({ current: songWith([section('a', 5000, 10_000)]) })

    expect(addSection('song-1', 'Chorus', 5500, 10_500)).toBeNull()
    expect(steps()).toBe(0)
  })

  it('trims an overlap and numbers a duplicate name', () => {
    useSongStore.setState({ current: songWith([section('a', 5000, 10_000, 'Chorus')]) })

    const added = addSection('song-1', 'chorus', 8000, 14_000)

    expect(added).toMatchObject({ name: 'chorus 2', startMs: 10_000, endMs: 14_000 })
  })

  it('keeps the sections in the order of start time', () => {
    addSection('song-1', 'Late', 20_000, 25_000)
    addSection('song-1', 'Early', 1000, 5000)

    expect(sections().map((s) => s.name)).toEqual(['Early', 'Late'])
  })

  it('adds nothing for another song or a name with only spaces', () => {
    expect(addSection('song-2', 'Verse', 1000, 5000)).toBeNull()
    expect(addSection('song-1', '  ', 1000, 5000)).toBeNull()
    expect(steps()).toBe(0)
  })
})

describe('addSectionStep', () => {
  it('does not change its input', () => {
    const before = songWith([])

    const result = addSectionStep(before, 'Verse', 1000, 5000)

    expect(before.sections).toEqual([])
    expect(result?.content.sections).toEqual([result?.section])
  })
})

describe('updateSection', () => {
  beforeEach(() => {
    useSongStore.setState({
      current: songWith([section('a', 5000, 10_000, 'Verse'), section('b', 13_000, 20_000)]),
    })
  })

  it('renames a section as one undo step', () => {
    updateSection('a', { name: ' Bridge ' })

    expect(sections()[0]?.name).toBe('Bridge')
    expect(steps()).toBe(1)
  })

  it('numbers a duplicate name and keeps the name for only spaces', () => {
    updateSection('a', { name: 'B' })
    expect(sections()[0]?.name).toBe('B 2')

    updateSection('a', { name: '   ' })
    expect(sections()[0]?.name).toBe('B 2')
    expect(steps()).toBe(1)
  })

  it('stops a dragged end at the next section', () => {
    updateSection('a', { endMs: 16_010 })

    expect(sections()[0]).toMatchObject({ startMs: 5000, endMs: 13_000 })
  })

  it('moves both edges in one undo step', () => {
    updateSection('a', { startMs: 2000, endMs: 12_000 })

    expect(sections()[0]).toMatchObject({ startMs: 2000, endMs: 12_000 })
    expect(steps()).toBe(1)
  })

  it('records no step for no change or an unknown id', () => {
    updateSection('a', { name: 'Verse', startMs: 5000 })
    updateSection('x', { name: 'Other' })

    expect(steps()).toBe(0)
  })
})

describe('stepSectionEdge', () => {
  it('moves an edge by one frame size as one undo step for each call', () => {
    useSongStore.setState({ current: songWith([section('a', 5000, 10_000)]) })

    stepSectionEdge('a', 'end', 1)
    stepSectionEdge('a', 'start', -1)

    expect(sections()[0]).toMatchObject({ startMs: 4950, endMs: 10_050 })
    expect(steps()).toBe(2)
  })

  it('changes nothing for an unknown id', () => {
    stepSectionEdge('x', 'end', 1)

    expect(steps()).toBe(0)
  })
})

describe('deleteSection', () => {
  it('deletes the section, leaves the marks the same array, and undo restores it', () => {
    useSongStore.setState({ current: songWith([section('a', 0, 4000)]) })
    const marks = content()?.marks

    deleteSection('a')

    expect(sections()).toEqual([])
    expect(content()?.marks).toBe(marks)
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(sections()).toHaveLength(1)
  })

  it('records no step for an unknown id', () => {
    deleteSection('x')

    expect(steps()).toBe(0)
  })
})

describe('phrasesInSection', () => {
  it('returns the phrases of one voice in the section, in time order', () => {
    useSongStore.setState({ current: songWith([section('a', 0, 5000)]) })

    expect(phrasesInSection(VOICE, 'a').map((m) => m.id)).toEqual(['p1', 'p2'])
    expect(phrasesInSection(OTHER_VOICE, 'a').map((m) => m.id)).toEqual(['q1'])
  })

  it('returns an empty list for an unknown section or with no song', () => {
    expect(phrasesInSection(VOICE, 'x')).toEqual([])
    useSongStore.setState({ current: null })
    expect(phrasesInSection(VOICE, 'x')).toEqual([])
  })
})

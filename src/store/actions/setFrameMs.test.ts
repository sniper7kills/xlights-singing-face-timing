import { beforeEach, describe, expect, it } from 'vitest'
import { mark, testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../history.ts'
import { useSongStore } from '../songStore.ts'
import { find, steps, withDictionary } from './actions.test-helpers.ts'
import { setFrameMs } from './setFrameMs.ts'

const content = () => useSongStore.getState().current

beforeEach(() => {
  useSongStore.setState({ current: testContent(), history: emptyHistory() })
})

describe('setFrameMs', () => {
  it('sets the frame size of the song as one undo step', () => {
    setFrameMs('song-1', 25)

    expect(content()?.song.frameMs).toBe(25)
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(content()).toEqual(testContent())
  })

  it('snaps the marks and the frame size in one undo step', () => {
    useSongStore.setState({
      current: {
        ...testContent([mark('w', { startMs: 1025, endMs: 1075, edited: true })]),
        song: { ...testContent().song, frameMs: 25 },
      },
    })

    setFrameMs('song-1', 50)

    expect(content()?.song.frameMs).toBe(50)
    expect([find('w')?.startMs, find('w')?.endMs]).toEqual([1050, 1100])
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(content()?.song.frameMs).toBe(25)
    expect(find('w')?.startMs).toBe(1025)
  })

  it('snaps the sections and the frame size in one undo step', () => {
    const section = { id: 's', songId: 'song-1', name: 'Verse', startMs: 1025, endMs: 2025 }
    useSongStore.setState({
      current: {
        ...testContent(),
        song: { ...testContent().song, frameMs: 25 },
        sections: [section],
      },
    })

    setFrameMs('song-1', 50)

    expect(content()?.sections).toEqual([{ ...section, startMs: 1050, endMs: 2050 }])
    expect(steps()).toBe(1)
    useSongStore.getState().undo()
    expect(content()?.sections).toEqual([section])
  })

  it('keeps the sections inside a song of 10040 ms from 25 to 50 to 25 ms, and undo restores them', () => {
    const first = {
      ...testContent(),
      song: { ...testContent().song, frameMs: 25 as const, durationMs: 10_040 },
      sections: [
        { id: 'a', songId: 'song-1', name: 'Verse', startMs: 8000, endMs: 9025 },
        { id: 'b', songId: 'song-1', name: 'Chorus', startMs: 9025, endMs: 10_025 },
      ],
    }
    useSongStore.setState({ current: first })
    const ranges = () => content()?.sections.map((s) => [s.id, s.startMs, s.endMs])

    setFrameMs('song-1', 50)
    expect(ranges()).toEqual([
      ['a', 8000, 9000],
      ['b', 9000, 10_000],
    ])
    setFrameMs('song-1', 25)
    expect(ranges()).toEqual([
      ['a', 8000, 9000],
      ['b', 9000, 10_000],
    ])

    expect(steps()).toBe(2)
    useSongStore.getState().undo()
    useSongStore.getState().undo()
    expect(content()).toEqual(first)
  })

  it('records no step for the frame size that the song has', () => {
    setFrameMs('song-1', 50)

    expect(steps()).toBe(0)
  })

  it('changes nothing for a song that is not open', () => {
    setFrameMs('song-2', 25)

    expect(content()).toEqual(testContent())
    expect(steps()).toBe(0)
  })

  it('breaks down an unedited word that changes length at the new frame size', async () => {
    const { store, actions } = await withDictionary(() => import('./setFrameMs.ts'))
    const song = { ...testContent().song, frameMs: 25 as const }
    store.setState({
      current: {
        ...testContent([
          mark('p', { layer: 'phrase', label: 'night', startMs: 1000, endMs: 1075 }),
          mark('w', { label: 'night', startMs: 1000, endMs: 1075, parentId: 'p' }),
          mark('w1', { layer: 'phoneme', label: 'etc', startMs: 1000, endMs: 1075, parentId: 'w' }),
        ]),
        song,
      },
    })

    actions.setFrameMs('song-1', 50)

    const phonemes = (store.getState().current?.marks ?? []).filter((item) => item.parentId === 'w')
    // The word is 100 ms long, so the break down fits two of the three phonemes of "night".
    expect(phonemes.map((item) => item.label)).toEqual(['etc', 'AI'])
    for (const item of phonemes) expect([item.startMs % 50, item.endMs % 50]).toEqual([0, 0])
    expect(phonemes.at(-1)?.endMs).toBe(1100)
  })
})

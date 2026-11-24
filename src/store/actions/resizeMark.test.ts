import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../history.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark } from '../types.ts'
import { canResizeMark, resizeMark } from './resizeMark.ts'

const DICTIONARY = { SILENT: 'S AY1 L AH0 N T', NIGHT: 'N AY1 T', HOLY: 'HH OW1 L IY0' }

type Store = typeof useSongStore

const marksOf = (store: Store) => store.getState().current?.marks ?? []
const find = (id: string, store: Store = useSongStore) =>
  marksOf(store).find((item) => item.id === id)
const range = (id: string, store: Store = useSongStore) => {
  const item = find(id, store)
  return item && [item.startMs, item.endMs]
}
const phonemesOf = (wordId: string, store: Store = useSongStore): Mark[] =>
  marksOf(store)
    .filter((item) => item.parentId === wordId)
    .sort((a, b) => a.startMs - b.startMs)
const steps = (store: Store = useSongStore) => store.getState().history.past.length

function expectFill(phonemes: readonly Mark[], startMs: number, endMs: number) {
  expect(phonemes[0]?.startMs).toBe(startMs)
  expect(phonemes.at(-1)?.endMs).toBe(endMs)
  for (const [index, phoneme] of phonemes.entries())
    if (index > 0) expect(phoneme.startMs).toBe(phonemes[index - 1]?.endMs)
}

// The loader keeps the dictionary for the whole visit, so a test with a loaded dictionary imports fresh modules.
async function withDictionary() {
  vi.resetModules()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(DICTIONARY)),
  )
  const store = (await import('../songStore.ts')).useSongStore
  const { loadDictionaries } = await import('./breakDown.ts')
  const actions = await import('./resizeMark.ts')
  await loadDictionaries()
  store.setState({ current: testContent(), history: emptyHistory() })
  return { store, resize: actions.resizeMark }
}

beforeEach(() => {
  useSongStore.setState({ current: testContent(), history: emptyHistory() })
})

describe('resizeMark', () => {
  it('moves a shared edge of two words as one undo step and leaves no gap', () => {
    resizeMark('w1', 'end', 1712)

    expect(range('w1')).toEqual([1000, 1700])
    expect(range('w2')).toEqual([1700, 2000])
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('stops an edge at the parent edge for a time past it and does not throw', () => {
    resizeMark('w3', 'end', 99_999)

    expect(range('w3')).toEqual([2200, 3000])
  })

  it('records no step for a time that changes nothing or an unknown id', () => {
    resizeMark('w3', 'end', 2810)
    resizeMark('nothing', 'start', 0)

    expect(steps()).toBe(0)
  })

  it('removes the "estimated" state of the resized word', () => {
    resizeMark('w3', 'start', 2100)

    expect(find('w3')?.estimated).toBe(false)
  })

  it('spreads the phonemes of an unedited word again when the dictionary is not loaded', () => {
    resizeMark('w3', 'end', 3000)

    const phonemes = phonemesOf('w3')
    expect(phonemes.map((item) => item.label)).toEqual(['etc', 'O', 'L'])
    expectFill(phonemes, 2200, 3000)
  })

  it('gives an unedited word that gets longer a new break down that fills the new length, in the same undo step', async () => {
    const { store, resize } = await withDictionary()
    const before = phonemesOf('w3', store).map((item) => item.id)

    resize('w3', 'end', 3000)

    const phonemes = phonemesOf('w3', store)
    expectFill(phonemes, 2200, 3000)
    expect(phonemes.some((item) => before.includes(item.id))).toBe(false)
    expect(find('w3', store)?.unknown).toBe(false)
    expect(steps(store)).toBe(1)
  })

  it('breaks down both unedited words of a dragged shared edge', async () => {
    const { store, resize } = await withDictionary()

    resize('w1', 'end', 1300)

    expectFill(phonemesOf('w1', store), 1000, 1300)
    expectFill(phonemesOf('w2', store), 1300, 2000)
    expect(find('w2', store)?.unknown).toBe(false)
  })

  it('scales the phonemes of an edited word with followWord and keeps them', async () => {
    const { store, resize } = await withDictionary()

    resize('w4', 'end', 4800)

    expect(phonemesOf('w4', store).map((item) => [item.id, item.startMs, item.endMs])).toEqual([
      ['w4a', 3200, 3600],
      ['w4b', 3600, 4000],
      ['w4c', 4000, 4800],
    ])
  })

  it('keeps the phonemes of a word whose length stays the same', async () => {
    const { store, resize } = await withDictionary()

    resize('p2', 'start', 3100)

    expect(phonemesOf('w4', store).map((item) => item.id)).toEqual(['w4a', 'w4b', 'w4c'])
  })
})

describe('canResizeMark', () => {
  it('returns true for an edge with room to move', () => {
    expect(canResizeMark('w3', 'end')).toBe(true)
    expect(canResizeMark('p2', 'start')).toBe(true)
  })

  it('returns false for a phrase edge that touches its word and the song start', () => {
    useSongStore.setState({
      current: testContent(
        testContent().marks.map((item) =>
          item.id === 'p1'
            ? { ...item, startMs: 0 }
            : item.id === 'w1'
              ? { ...item, startMs: 0 }
              : item,
        ),
      ),
    })

    expect(canResizeMark('p1', 'start')).toBe(false)
  })

  it('returns false for an unknown id or when no song is open', () => {
    expect(canResizeMark('nothing', 'end')).toBe(false)

    useSongStore.setState({ current: null })
    expect(canResizeMark('w3', 'end')).toBe(false)
  })
})

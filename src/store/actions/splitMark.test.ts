import { beforeEach, describe, expect, it } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark } from '../types.ts'
import {
  childrenIn,
  find,
  marksOf,
  openTestSong,
  steps,
  withDictionary,
  type Store,
} from './actions.test-helpers.ts'
import { canSplitMark, splitMark } from './splitMark.ts'

beforeEach(() => openTestSong())

function wordsOf(phraseId: string, store?: Store): Mark[] {
  return childrenIn(phraseId, store).filter((item) => item.layer === 'word')
}

function expectFilled(word: Mark | undefined, store?: Store) {
  const phonemes = childrenIn(word?.id ?? '', store)
  expect(phonemes.length).toBeGreaterThan(0)
  expect(phonemes[0]?.startMs).toBe(word?.startMs)
  expect(phonemes.at(-1)?.endMs).toBe(word?.endMs)
}

describe('splitMark', () => {
  it('splits a word into two words, each with phonemes, as one undo step', () => {
    splitMark('w3', 2500)

    const [, , first, second] = wordsOf('p1')
    expect([first?.label, second?.label]).toEqual(['ho', 'ly'])
    expect([first?.endMs, second?.startMs]).toEqual([2500, 2500])
    expect(childrenIn('w3').length).toBeGreaterThan(0)
    expect(childrenIn(second?.id ?? '').length).toBeGreaterThan(0)
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('breaks down both words when the dictionary is in memory', async () => {
    const { store, actions } = await withDictionary(() => import('./splitMark.ts'))

    actions.splitMark('w1', 1250)

    const [first, second] = wordsOf('p1', store)
    expect([first?.label, second?.label]).toEqual(['sil', 'ent'])
    expectFilled(first, store)
    expectFilled(second, store)
    expect(first?.unknown).toBe(true)
    expect(steps(store)).toBe(1)
  })

  it('records no step for a split time outside the mark', () => {
    splitMark('w1', 1700)
    splitMark('nothing', 1200)

    expect(steps()).toBe(0)
    expect(marksOf()).toEqual(testContent().marks)
  })
})

describe('canSplitMark', () => {
  it('gives true for a time inside the mark that leaves both parts one frame size or longer', () => {
    expect(canSplitMark('w1', 1200)).toBe(true)
    expect(canSplitMark('p1', 2100)).toBe(true)
  })

  it('gives false for a play cursor outside the mark', () => {
    expect(canSplitMark('w1', 900)).toBe(false)
    expect(canSplitMark('w1', 1600)).toBe(false)
  })

  it('gives false for a part shorter than one frame size, an unknown id and no open song', () => {
    expect(canSplitMark('w1', 1010)).toBe(false)
    expect(canSplitMark('nothing', 1200)).toBe(false)
    useSongStore.setState({ current: null })
    expect(canSplitMark('w1', 1200)).toBe(false)
  })

  it('records no step', () => {
    canSplitMark('w1', 1200)

    expect(steps()).toBe(0)
    expect(find('w1')?.endMs).toBe(1500)
  })
})

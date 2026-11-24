import { beforeEach, describe, expect, it } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import { childrenIn, find, openTestSong, steps, withDictionary } from './actions.test-helpers.ts'
import { canMergeWithNext, mergeWithNext } from './mergeWithNext.ts'

beforeEach(() => openTestSong())

describe('mergeWithNext', () => {
  it('merges a word into one word that spans both, as one undo step', () => {
    mergeWithNext('w1')

    expect(find('w1')).toMatchObject({ label: 'silentnight', startMs: 1000, endMs: 2000 })
    expect(find('w2')).toBeUndefined()
    expect(childrenIn('w1').map((item) => item.id)).toEqual(['w1a', 'w1b', 'w2a', 'w2b'])
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('breaks down the merged word when the dictionary is in memory', async () => {
    const { store, actions } = await withDictionary(() => import('./mergeWithNext.ts'))

    actions.mergeWithNext('w1')

    const phonemes = childrenIn('w1', store)
    expect(phonemes.map((item) => item.id)).not.toContain('w1a')
    expect(phonemes[0]?.startMs).toBe(1000)
    expect(phonemes.at(-1)?.endMs).toBe(2000)
    expect(steps(store)).toBe(1)
  })

  it('records no step on the last mark of a layer', () => {
    mergeWithNext('p3')

    expect(steps()).toBe(0)
  })
})

describe('canMergeWithNext', () => {
  it('gives true for a mark with a next mark of the same parent', () => {
    expect(canMergeWithNext('w1')).toBe(true)
    expect(canMergeWithNext('p1')).toBe(true)
  })

  it('gives false on the last mark of a layer and across a parent edge', () => {
    expect(canMergeWithNext('p3')).toBe(false)
    expect(canMergeWithNext('w3')).toBe(false)
  })

  it('gives false for an unknown id and for no open song', () => {
    expect(canMergeWithNext('nothing')).toBe(false)
    useSongStore.setState({ current: null })
    expect(canMergeWithNext('w1')).toBe(false)
  })
})

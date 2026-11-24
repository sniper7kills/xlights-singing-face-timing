import { beforeEach, describe, expect, it } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import { childrenIn, find, openTestSong, steps, withDictionary } from './actions.test-helpers.ts'
import { setMarkLabel, wordsWouldChange } from './setMarkLabel.ts'

beforeEach(() => openTestSong())

describe('setMarkLabel', () => {
  it('keeps the old label for an empty label on a phrase or a word and records no step', () => {
    setMarkLabel('p1', '')
    setMarkLabel('w1', '   ')

    expect(find('p1')?.label).toBe('silent night holy')
    expect(find('w1')?.label).toBe('silent')
    expect(steps()).toBe(0)
  })

  it('changes only the label of a phrase with the same words', () => {
    setMarkLabel('p1', 'Silent night, holy!')

    expect(find('p1')?.label).toBe('Silent night, holy!')
    expect(childrenIn('p1')).toEqual(testContent().marks.filter((item) => item.parentId === 'p1'))
    expect(steps()).toBe(1)
  })

  it('rebuilds the words of a phrase with changed words and keeps the times of words that match', async () => {
    const { store, actions } = await withDictionary(() => import('./setMarkLabel.ts'))

    actions.setMarkLabel('p1', 'silent day holy')

    const words = childrenIn('p1', store)
    expect(words.map((item) => [item.label, item.startMs, item.endMs])).toEqual([
      ['silent', 1000, 1500],
      ['day', 1500, 2200],
      ['holy', 2200, 2800],
    ])
    expect([words[0]?.id, words[2]?.id]).toEqual(['w1', 'w3'])
    expect(childrenIn(words[1]?.id ?? '', store).map((item) => item.label)).toEqual(['etc', 'E'])
    expect(find('w2', store)).toBeUndefined()
    expect(find('w2a', store)).toBeUndefined()
    expect(steps(store)).toBe(1)

    store.getState().undo()
    expect(store.getState().current).toEqual(testContent())
  })

  it('breaks down a word with a new label and clears edited', async () => {
    const { store, actions } = await withDictionary(() => import('./setMarkLabel.ts'))

    actions.setMarkLabel('w4', 'holy')

    expect(find('w4', store)).toMatchObject({ label: 'holy', edited: false, unknown: false })
    expect(childrenIn('w4', store).map((item) => item.label)).toEqual(['etc', 'O', 'L', 'E'])
    expect(steps(store)).toBe(1)
  })

  it('gives a word with a new label the phonemes of the guess when the dictionary is not in memory', () => {
    setMarkLabel('w1', 'day')

    const phonemes = childrenIn('w1')
    expect(phonemes.map((item) => item.id)).not.toContain('w1a')
    expect(phonemes[0]?.startMs).toBe(1000)
    expect(phonemes.at(-1)?.endMs).toBe(1500)
  })
})

describe('wordsWouldChange', () => {
  it('gives true only when the words of the phrase change', () => {
    expect(wordsWouldChange('p1', 'silent day holy')).toBe(true)
    expect(wordsWouldChange('p1', 'SILENT night, holy')).toBe(false)
  })

  it('gives false for no open song', () => {
    useSongStore.setState({ current: null })

    expect(wordsWouldChange('p1', 'silent day holy')).toBe(false)
  })
})

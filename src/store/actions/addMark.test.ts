import { beforeEach, describe, expect, it } from 'vitest'
import { testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import { childrenIn, marksOf, openTestSong, steps, withDictionary } from './actions.test-helpers.ts'
import { addMark, canAddMark } from './addMark.ts'

beforeEach(() => openTestSong())

const added = () => marksOf().slice(testContent().marks.length)

describe('addMark', () => {
  it('returns the id of the new mark on the asked layer', () => {
    const id = addMark(VOICE, 'word', 5200, 5800, 'calm')

    expect(marksOf().find((item) => item.id === id)).toMatchObject({ layer: 'word', label: 'calm' })
  })

  it('returns null when the add is not possible', () => {
    expect(addMark(VOICE, 'word', 1200, 1300, 'and')).toBeNull()
  })

  it('adds a word in an empty range of a phrase, with phonemes, as one undo step', () => {
    addMark(VOICE, 'word', 2000, 2200, 'and')

    const [word] = added()
    expect(word).toMatchObject({ layer: 'word', label: 'and', parentId: 'p1' })
    expect(childrenIn(word?.id ?? '').length).toBeGreaterThan(0)
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('creates a phrase of the same range with the same label for a word outside any phrase', () => {
    addMark(VOICE, 'word', 5200, 5800, 'calm')

    const phrase = added().find((item) => item.layer === 'phrase')
    const word = added().find((item) => item.layer === 'word')
    expect(phrase).toMatchObject({ label: 'calm', startMs: 5200, endMs: 5800 })
    expect(word).toMatchObject({ label: 'calm', startMs: 5200, endMs: 5800, parentId: phrase?.id })
    expect(steps()).toBe(1)
  })

  it('breaks down a new word when the dictionary is in memory', async () => {
    const { store, actions } = await withDictionary(() => import('./addMark.ts'))

    actions.addMark(VOICE, 'word', 2000, 2200, 'day')

    const word = (store.getState().current?.marks ?? []).find((item) => item.label === 'day')
    expect(word?.unknown).toBe(false)
    expect(childrenIn(word?.id ?? '', store).map((item) => item.label)).toEqual(['etc', 'E'])
  })

  it('records no step in a gap shorter than one frame size', () => {
    addMark(VOICE, 'word', 1500, 1600, 'and')

    expect(steps()).toBe(0)
  })
})

describe('canAddMark', () => {
  it('gives true for an empty range of one frame size or longer', () => {
    expect(canAddMark(VOICE, 'word', 2000, 2200)).toBe(true)
    expect(canAddMark(VOICE, 'word', 5200, 5800)).toBe(true)
  })

  it('gives false for a gap shorter than one frame size', () => {
    expect(canAddMark(VOICE, 'word', 1500, 1600)).toBe(false)
    expect(canAddMark(VOICE, 'word', 2000, 2010)).toBe(false)
  })

  it('gives false for a phoneme outside any word and for no open song', () => {
    expect(canAddMark(VOICE, 'phoneme', 2050, 2150)).toBe(false)
    useSongStore.setState({ current: null })
    expect(canAddMark(VOICE, 'phrase', 7500, 8000)).toBe(false)
  })
})

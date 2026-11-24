import { beforeEach, describe, expect, it } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { useSongStore } from '../songStore.ts'
import { find, marksOf, openTestSong, steps } from './actions.test-helpers.ts'
import { canDeleteMarks, deleteMarks } from './deleteMarks.ts'

beforeEach(() => openTestSong())

describe('deleteMarks', () => {
  it('removes a phrase with its words and their phonemes, as one undo step', () => {
    deleteMarks(['p1'])

    expect(marksOf().map((item) => item.id)).toEqual(['p2', 'w4', 'w4a', 'w4b', 'w4c', 'p3', 'q1'])
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('removes several marks as one undo step', () => {
    deleteMarks(['w1', 'w3b', 'p3'])

    expect(find('w1')).toBeUndefined()
    expect(find('w3b')).toBeUndefined()
    expect(find('p3')).toBeUndefined()
    expect(find('w3')?.edited).toBe(true)
    expect(steps()).toBe(1)
  })

  it('records no step for the last phoneme of a word and for unknown ids', () => {
    deleteMarks(['w1a'])
    deleteMarks(['w1b'])
    deleteMarks(['nothing'])

    expect(find('w1b')).toBeDefined()
    expect(steps()).toBe(1)
  })
})

describe('canDeleteMarks', () => {
  it('gives true when one mark or more goes', () => {
    expect(canDeleteMarks(['w1a'])).toBe(true)
    expect(canDeleteMarks(['nothing', 'p3'])).toBe(true)
  })

  it('gives false for the last phoneme of a word, unknown ids and no open song', () => {
    deleteMarks(['w1a'])
    expect(canDeleteMarks(['w1b'])).toBe(false)
    expect(canDeleteMarks(['nothing'])).toBe(false)
    useSongStore.setState({ current: null })
    expect(canDeleteMarks(['p1'])).toBe(false)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { mark, testContent, testMarks } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../history.ts'
import { useSongStore } from '../songStore.ts'
import { canMoveMark, moveMark } from './moveMark.ts'

const marks = () => useSongStore.getState().current?.marks ?? []
const find = (id: string) => marks().find((item) => item.id === id)
const range = (id: string) => {
  const item = find(id)
  return item && [item.startMs, item.endMs]
}
const steps = () => useSongStore.getState().history.past.length

beforeEach(() => {
  useSongStore.setState({ current: testContent(), history: emptyHistory() })
})

describe('moveMark', () => {
  it('moves a phrase with its words and phonemes as one undo step', () => {
    moveMark('p2', 500)

    expect(range('p2')).toEqual([3500, 5500])
    expect(range('w4')).toEqual([3700, 4500])
    expect(range('w4c')).toEqual([4100, 4500])
    expect(steps()).toBe(1)

    useSongStore.getState().undo()
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('moves a word to the adjacent word for an amount past it and does not throw', () => {
    moveMark('w3', -5000)

    expect(range('w3')).toEqual([2000, 2600])
    expect(steps()).toBe(1)
  })

  it('removes the "estimated" state of the moved word', () => {
    moveMark('w3', 100)

    expect(find('w3')?.estimated).toBe(false)
  })

  it('records no step for an unknown id or a mark with no room in that direction', () => {
    moveMark('nothing', 100)
    moveMark('w1', -100)

    expect(steps()).toBe(0)
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('changes nothing when no song is open', () => {
    useSongStore.setState({ current: null })

    moveMark('w3', 100)

    expect(useSongStore.getState().current).toBeNull()
  })
})

describe('canMoveMark', () => {
  it('returns true for a mark with room to move', () => {
    expect(canMoveMark('w3')).toBe(true)
    expect(canMoveMark('p2')).toBe(true)
  })

  it('returns false for a word between its phrase start and the adjacent word', () => {
    expect(canMoveMark('w1')).toBe(false)
  })

  it('returns false for a word that fills its phrase', () => {
    useSongStore.setState({
      current: testContent([
        ...testMarks(),
        mark('w5', { label: 'calm', startMs: 6000, endMs: 7000, parentId: 'p3' }),
      ]),
    })

    expect(canMoveMark('w5')).toBe(false)
  })

  it('returns false for an unknown id or when no song is open', () => {
    expect(canMoveMark('nothing')).toBe(false)

    useSongStore.setState({ current: null })
    expect(canMoveMark('w3')).toBe(false)
  })
})

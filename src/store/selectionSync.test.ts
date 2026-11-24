import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteMarks } from './actions/deleteMarks.ts'
import { mergeWithNext } from './actions/mergeWithNext.ts'
import { splitMark } from './actions/splitMark.ts'
import { openTestSong } from './actions/actions.test-helpers.ts'
import { keepSelectionInSong } from './selectionSync.ts'
import { useSongStore } from './songStore.ts'
import { useViewStore } from './viewStore.ts'

const selected = () => useViewStore.getState().selectedMarkIds
const anchor = () => useViewStore.getState().selectionAnchorId

let stop: () => void

beforeEach(() => {
  useViewStore.getState().resetView()
  openTestSong()
  stop = keepSelectionInSong()
})

afterEach(() => stop())

describe('keepSelectionInSong', () => {
  it('empties the selection after Delete removes the selected marks', () => {
    useViewStore.getState().selectMarks(['w1', 'w2'])

    deleteMarks(['w1', 'w2'])

    expect(selected()).toEqual([])
    expect(anchor()).toBeNull()
  })

  it('keeps the last phoneme of a word selected, because Delete keeps that phoneme', () => {
    useViewStore.getState().selectMarks(['w1a', 'w1b'])

    deleteMarks(['w1a', 'w1b'])

    expect(selected()).toEqual(['w1b'])
    expect(anchor()).toBe('w1b')
  })

  it('keeps the first part selected after a split', () => {
    useViewStore.getState().selectMarks(['w3'])

    splitMark('w3', 2500)

    expect(selected()).toEqual(['w3'])
  })

  it('keeps the merged mark selected after a merge', () => {
    useViewStore.getState().selectMarks(['w1'])

    mergeWithNext('w1')

    expect(selected()).toEqual(['w1'])
  })

  it('keeps the selected ids that exist after an undo and a redo', () => {
    useViewStore.getState().selectMarks(['w3'])
    splitMark('w3', 2500)
    const second = useSongStore
      .getState()
      .current?.marks.find((mark) => mark.layer === 'word' && mark.startMs === 2500)
    useViewStore.getState().extendSelection(['w3', second?.id ?? ''])

    useSongStore.getState().undo()
    expect(selected()).toEqual(['w3'])
    expect(anchor()).toBe('w3')

    useSongStore.getState().redo()
    expect(selected()).toEqual(['w3'])
  })

  it('moves the anchor to the last kept id when the anchor mark goes', () => {
    useViewStore.getState().selectMarks(['w2', 'w1'])

    deleteMarks(['w1'])

    expect(selected()).toEqual(['w2'])
    expect(anchor()).toBe('w2')
  })

  it('changes nothing after a change that keeps every selected mark', () => {
    useViewStore.getState().selectMarks(['w1'])
    const before = useViewStore.getState()

    deleteMarks(['w3'])

    expect(useViewStore.getState()).toBe(before)
  })

  it('stops after the returned function runs', () => {
    useViewStore.getState().selectMarks(['w1'])
    stop()

    deleteMarks(['w1'])

    expect(selected()).toEqual(['w1'])
  })
})

import { describe, expect, it } from 'vitest'
import { findMark } from './family.ts'
import { DURATION_MS, FRAME_MS, testMarks } from './fixtures.test-helpers.ts'
import { isShortMark, resizeCause } from './limits.ts'

const MARKS = testMarks()

function cause(id: string, edge: 'start' | 'end', toMs: number) {
  const mark = findMark(MARKS, id)
  if (!mark) throw new Error(`No mark ${id}.`)
  return resizeCause(MARKS, mark, edge, toMs, FRAME_MS, DURATION_MS)
}

describe('resizeCause', () => {
  it('gives null for a time that the resize uses as typed', () => {
    expect(cause('w3', 'end', 2900)).toBeNull()
  })

  it('names the snap to the frame size', () => {
    expect(cause('w3', 'end', 2912)).toBe('snap')
  })

  it('names the parent edge', () => {
    expect(cause('w3', 'end', 3500)).toBe('parent')
    expect(cause('w1', 'start', 500)).toBe('parent')
  })

  it('names the end of the song for a phrase', () => {
    expect(cause('p3', 'end', DURATION_MS + 100)).toBe('song')
  })

  it('names the adjacent mark that keeps its shortest length', () => {
    expect(cause('w2', 'start', 1000)).toBe('adjacent')
    expect(cause('w1', 'end', 2000)).toBe('adjacent')
  })

  it('names the shortest length of the mark', () => {
    expect(cause('w3', 'start', 2800)).toBe('shortest')
    expect(cause('w3', 'end', 2200)).toBe('shortest')
  })

  it('names the first or the last word of a phrase', () => {
    expect(cause('p1', 'start', 1200)).toBe('words')
    expect(cause('p1', 'end', 2000)).toBe('words')
  })
})

describe('isShortMark', () => {
  it('gives true for a mark of 2 frames and false for a mark of 3 frames', () => {
    expect(isShortMark({ startMs: 0, endMs: 2 * FRAME_MS }, FRAME_MS)).toBe(true)
    expect(isShortMark({ startMs: 0, endMs: 3 * FRAME_MS }, FRAME_MS)).toBe(false)
  })
})

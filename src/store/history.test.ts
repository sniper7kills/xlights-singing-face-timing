import { describe, expect, it } from 'vitest'
import {
  emptyHistory,
  HISTORY_DEPTH,
  recordStep,
  redoStep,
  undoStep,
  type History,
} from './history.ts'

function recordValues(count: number): History<number> {
  let history = emptyHistory<number>()
  for (let value = 0; value < count; value += 1) history = recordStep(history, value)
  return history
}

describe('history', () => {
  it('keeps 100 steps and removes the oldest step first', () => {
    const history = recordValues(HISTORY_DEPTH + 5)

    expect(HISTORY_DEPTH).toBe(100)
    expect(history.past).toHaveLength(100)
    expect(history.past[0]).toBe(5)
  })

  it('undoes 100 steps and then has no step to undo', () => {
    let history = recordValues(HISTORY_DEPTH + 5)
    let present = HISTORY_DEPTH + 5
    for (let count = 0; count < HISTORY_DEPTH; count += 1) {
      const result = undoStep(history, present)
      if (!result) throw new Error(`Undo ${count + 1} found no step.`)
      history = result.history
      present = result.present
    }

    expect(present).toBe(5)
    expect(undoStep(history, present)).toBeUndefined()
  })

  it('returns the value before the last step on undo', () => {
    const history = recordStep(emptyHistory<string>(), 'a')

    expect(undoStep(history, 'b')).toEqual({ history: { past: [], future: ['b'] }, present: 'a' })
  })

  it('returns the value that the undo removed on redo', () => {
    const undone = undoStep(recordStep(emptyHistory<string>(), 'a'), 'b')
    if (!undone) throw new Error('Undo found no step.')

    expect(redoStep(undone.history, undone.present)).toEqual({
      history: { past: ['a'], future: [] },
      present: 'b',
    })
  })

  it('has no step to redo before an undo', () => {
    expect(redoStep(recordStep(emptyHistory<string>(), 'a'), 'b')).toBeUndefined()
  })

  it('clears the redo steps when a new step follows an undo', () => {
    const undone = undoStep(recordStep(emptyHistory<string>(), 'a'), 'b')
    if (!undone) throw new Error('Undo found no step.')

    const history = recordStep(undone.history, undone.present)

    expect(history.future).toEqual([])
    expect(redoStep(history, 'c')).toBeUndefined()
  })
})

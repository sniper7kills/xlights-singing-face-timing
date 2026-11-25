import { describe, expect, it } from 'vitest'
import { decodePowerset, LOCAL_SPEAKERS } from './powerset.ts'

/** Returns the logits of frames in which the given class has the highest score. */
function logitsOf(classes: number[]): Float32Array {
  const logits = new Float32Array(classes.length * 7).fill(-5)
  classes.forEach((winner, frame) => {
    logits[frame * 7 + winner] = 3
  })
  return logits
}

describe('decodePowerset', () => {
  it('gives one array of frames for each of the 3 local speakers', () => {
    const activity = decodePowerset(logitsOf([0, 1]))
    expect(activity).toHaveLength(LOCAL_SPEAKERS)
    expect(activity.map((speaker) => speaker.length)).toEqual([2, 2, 2])
  })

  it('marks the single speaker of classes 1 to 3', () => {
    const activity = decodePowerset(logitsOf([1, 2, 3, 0]))
    expect(activity.map((speaker) => [...speaker])).toEqual([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ])
  })

  it('marks both speakers of the pair classes 4 to 6', () => {
    const activity = decodePowerset(logitsOf([4, 5, 6]))
    expect(activity.map((speaker) => [...speaker])).toEqual([
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
    ])
  })

  it('marks no speaker for class 0', () => {
    const activity = decodePowerset(logitsOf([0, 0]))
    expect(activity.every((speaker) => speaker.every((on) => on === 0))).toBe(true)
  })
})

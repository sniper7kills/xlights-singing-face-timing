import { describe, expect, it } from 'vitest'
import type { FrameMs, Mark } from '../../store/types.ts'
import { mark, OTHER_VOICE, testMarks } from './fixtures.test-helpers.ts'
import { previewFrameSize } from './frameRules.ts'
import { applyEdit, isEmptyEdit } from './markEdit.ts'

/** A phrase of 25 ms marks: two words, each with phonemes of one 25 ms frame. */
function fineMarks(): Mark[] {
  return [
    mark('p', { layer: 'phrase', startMs: 1000, endMs: 1150 }),
    mark('a', { startMs: 1000, endMs: 1075, parentId: 'p' }),
    mark('a1', { layer: 'phoneme', startMs: 1000, endMs: 1025, parentId: 'a' }),
    mark('a2', { layer: 'phoneme', startMs: 1025, endMs: 1050, parentId: 'a' }),
    mark('a3', { layer: 'phoneme', startMs: 1050, endMs: 1075, parentId: 'a' }),
    mark('b', { startMs: 1075, endMs: 1150, parentId: 'p' }),
    mark('b1', { layer: 'phoneme', startMs: 1075, endMs: 1150, parentId: 'b' }),
    mark('q', { layer: 'phrase', startMs: 1175, endMs: 1225 }),
  ]
}

function snapAll(marks: Mark[], frameMs: FrameMs, durationMs = 10_000): Mark[] {
  return applyEdit(marks, previewFrameSize(marks, frameMs, durationMs))
}

function expectLegal(marks: readonly Mark[], frameMs: FrameMs) {
  const byId = new Map(marks.map((item) => [item.id, item]))
  for (const item of marks) {
    expect(item.startMs % frameMs, item.id).toBe(0)
    expect(item.endMs % frameMs, item.id).toBe(0)
    expect(item.endMs - item.startMs, item.id).toBeGreaterThanOrEqual(frameMs)
    const parent = item.parentId === null ? undefined : byId.get(item.parentId)
    if (parent) {
      expect(item.startMs, item.id).toBeGreaterThanOrEqual(parent.startMs)
      expect(item.endMs, item.id).toBeLessThanOrEqual(parent.endMs)
    }
    for (const other of marks)
      if (other !== item && other.voiceId === item.voiceId && other.layer === item.layer)
        expect(
          other.endMs <= item.startMs || other.startMs >= item.endMs,
          `${item.id} ${other.id}`,
        ).toBe(true)
  }
}

describe('previewFrameSize', () => {
  it('changes no mark from 50 ms to 25 ms, because each multiple of 50 is a multiple of 25', () => {
    expect(isEmptyEdit(previewFrameSize(testMarks(), 25, 10_000))).toBe(true)
  })

  it('puts every time on a multiple of 50 ms from 25 ms marks', () => {
    expectLegal(snapAll(fineMarks(), 50), 50)
  })

  it('makes a word long enough for one frame size for each phoneme', () => {
    const byId = Object.fromEntries(snapAll(fineMarks(), 50).map((item) => [item.id, item]))

    expect([byId.a?.startMs, byId.a?.endMs]).toEqual([1000, 1150])
    expect(byId.a3?.endMs).toBe(1150)
    expect([byId.b?.startMs, byId.b?.endMs]).toEqual([1150, 1200])
    expect([byId.p?.startMs, byId.p?.endMs]).toEqual([1000, 1200])
  })

  it('pushes the next phrase later when the phrase before it gets longer', () => {
    const byId = Object.fromEntries(snapAll(fineMarks(), 50).map((item) => [item.id, item]))

    expect([byId.q?.startMs, byId.q?.endMs]).toEqual([1200, 1250])
  })

  it('gives no mark a length of zero when both edges snap to one time', () => {
    const marks = [mark('w', { startMs: 1010, endMs: 1020 })]

    expect(snapAll(marks, 50)).toEqual([{ ...marks[0], startMs: 1000, endMs: 1050 }])
  })

  it('keeps each word inside its phrase when the phrase edge snaps inward', () => {
    const marks = [
      mark('p', { layer: 'phrase', startMs: 1000, endMs: 1225 }),
      mark('w', { startMs: 1100, endMs: 1225, parentId: 'p' }),
    ]

    const result = snapAll(marks, 50)

    expectLegal(result, 50)
    expect(result.map((item) => item.endMs)).toEqual([1250, 1250])
  })

  it('stops a phrase at the last multiple of the frame size in the song', () => {
    const marks = [mark('p', { layer: 'phrase', startMs: 9900, endMs: 9990 })]

    expect(snapAll(marks, 50, 9990)).toEqual([{ ...marks[0], startMs: 9900, endMs: 9950 }])
  })

  it('snaps the marks of each voice on their own', () => {
    const marks = [
      mark('p', { layer: 'phrase', startMs: 1000, endMs: 1075 }),
      mark('q', { voiceId: OTHER_VOICE, layer: 'phrase', startMs: 1025, endMs: 1100 }),
    ]

    expect(snapAll(marks, 50).map((item) => [item.startMs, item.endMs])).toEqual([
      [1000, 1100],
      [1050, 1100],
    ])
  })

  it('treats a word with no phrase as a top mark of the word layer', () => {
    const marks = [
      mark('w1', { startMs: 1000, endMs: 1025 }),
      mark('w2', { startMs: 1025, endMs: 1075, parentId: 'gone' }),
    ]

    const result = snapAll(marks, 50)

    expectLegal(result, 50)
    expect(result.map((item) => [item.startMs, item.endMs])).toEqual([
      [1000, 1050],
      [1050, 1100],
    ])
  })

  it('keeps the flags of each mark', () => {
    const marks = [mark('w', { startMs: 1010, endMs: 1090, edited: true, estimated: true })]

    expect(snapAll(marks, 50)[0]).toMatchObject({ edited: true, estimated: true })
  })
})

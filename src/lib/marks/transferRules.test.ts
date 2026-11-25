import { describe, expect, it } from 'vitest'
import { violations } from '../../store/actions/invariant.test-helpers.ts'
import type { Mark } from '../../store/types.ts'
import { counterIds } from './editRules.test-helpers.ts'
import { mark, OTHER_VOICE, testContent, testMarks, VOICE } from './fixtures.test-helpers.ts'
import { applyEdit, isEmptyEdit, type MarkEdit } from './markEdit.ts'
import { previewTransfer, transferConflicts } from './transferRules.ts'

const P1_FAMILY = ['p1', 'w1', 'w1a', 'w1b', 'w2', 'w2a', 'w2b', 'w3', 'w3a', 'w3b', 'w3c']
const P2_FAMILY = ['p2', 'w4', 'w4a', 'w4b', 'w4c']

/** Returns the test marks without the backing phrase `q1`, so the backing voice has no conflict. */
function withoutBacking(): Mark[] {
  return testMarks().filter((item) => item.id !== 'q1')
}

function ofVoice(marks: readonly Mark[], voiceId: string): Mark[] {
  return marks.filter((item) => item.voiceId === voiceId)
}

/** Returns the marks after the edit, and asserts that the result keeps every rule of the song. */
function checked(marks: Mark[], edit: MarkEdit): Mark[] {
  const result = applyEdit(marks, edit)
  // The invariant helpers use a song of 30 000 ms with the same 50 ms frame size.
  expect(violations(testContent(result))).toEqual([])
  return result
}

describe('transferConflicts', () => {
  it('gives each target phrase that shares time with a transferred phrase', () => {
    expect(transferConflicts(testMarks(), ['p1'], OTHER_VOICE).map((item) => item.id)).toEqual([
      'q1',
    ])
  })

  it('gives no conflict for a target phrase that only touches an edge', () => {
    const marks = [
      ...withoutBacking(),
      mark('q2', { voiceId: OTHER_VOICE, layer: 'phrase', startMs: 5000, endMs: 6000 }),
    ]

    expect(transferConflicts(marks, ['p2', 'p3'], OTHER_VOICE)).toEqual([])
  })

  it('ignores ids of words and of phrases on the target voice', () => {
    expect(transferConflicts(testMarks(), ['w1', 'q1'], OTHER_VOICE)).toEqual([])
  })
})

describe('previewTransfer', () => {
  it('moves a phrase with its words and phonemes, with the same ids, times and flags', () => {
    const marks = withoutBacking()
    const result = checked(
      marks,
      previewTransfer(marks, ['p1'], OTHER_VOICE, 'move', false, counterIds()),
    )

    const moved = ofVoice(result, OTHER_VOICE)
    expect(moved.map((item) => item.id).toSorted()).toEqual(P1_FAMILY.toSorted())
    expect(moved).toEqual(
      marks
        .filter((item) => P1_FAMILY.includes(item.id))
        .map((item) => ({ ...item, voiceId: OTHER_VOICE })),
    )
    expect(ofVoice(result, VOICE).map((item) => item.id)).not.toContain('p1')
  })

  it('copies a phrase with new ids and parent ids, and keeps the source marks', () => {
    const marks = withoutBacking()
    const edit = previewTransfer(marks, ['p2'], OTHER_VOICE, 'copy', false, counterIds())
    const result = checked(marks, edit)

    expect(edit.changed).toEqual([])
    expect(ofVoice(result, VOICE)).toEqual(ofVoice(marks, VOICE))
    const added = edit.added ?? []
    expect(added.map((item) => [item.id, item.layer, item.parentId])).toEqual([
      ['new1', 'phrase', null],
      ['new2', 'word', 'new1'],
      ['new3', 'phoneme', 'new2'],
      ['new4', 'phoneme', 'new2'],
      ['new5', 'phoneme', 'new2'],
    ])
    expect(added.every((item) => item.voiceId === OTHER_VOICE)).toBe(true)
    expect(added[1]).toMatchObject({ label: 'night', startMs: 3200, endMs: 4000, edited: true })
  })

  it('keeps the estimated and unknown flags on a copy', () => {
    const marks = withoutBacking().map((item) =>
      item.id === 'w2' ? { ...item, unknown: true } : item,
    )
    const added = previewTransfer(marks, ['p1'], OTHER_VOICE, 'copy', false, counterIds()).added

    expect(added?.filter((item) => item.estimated).map((item) => item.label)).toEqual(['holy'])
    expect(added?.filter((item) => item.unknown).map((item) => item.label)).toEqual(['night'])
  })

  it('gives an empty edit for a conflict without replace', () => {
    expect(
      isEmptyEdit(previewTransfer(testMarks(), ['p1'], OTHER_VOICE, 'move', false, counterIds())),
    ).toBe(true)
  })

  it('removes each full conflict phrase with its words and phonemes for replace', () => {
    const marks = [
      ...testMarks(),
      mark('qw', { voiceId: OTHER_VOICE, startMs: 0, endMs: 500, parentId: 'q1' }),
      mark('qwa', {
        voiceId: OTHER_VOICE,
        layer: 'phoneme',
        startMs: 0,
        endMs: 500,
        parentId: 'qw',
      }),
    ]
    const edit = previewTransfer(marks, ['p1'], OTHER_VOICE, 'copy', true, counterIds())
    const result = checked(marks, edit)

    expect(edit.removedIds).toEqual(['q1', 'qw', 'qwa'])
    expect(ofVoice(result, OTHER_VOICE)).toHaveLength(P1_FAMILY.length)
  })

  it('moves the phrases on a voice with no marks left, and the voice stays', () => {
    const marks = withoutBacking()
    const result = checked(
      marks,
      previewTransfer(marks, ['p1', 'p2', 'p3'], OTHER_VOICE, 'move', false, counterIds()),
    )

    expect(ofVoice(result, VOICE)).toEqual([])
  })

  it('gives an empty edit for phrases of two voices that share time', () => {
    const marks = [
      ...withoutBacking(),
      mark('t1', { voiceId: 'voice-third', layer: 'phrase', startMs: 0, endMs: 1500 }),
    ]

    expect(
      isEmptyEdit(previewTransfer(marks, ['p1', 't1'], OTHER_VOICE, 'move', false, counterIds())),
    ).toBe(true)
  })

  it('gives an empty edit when no id names a phrase off the target voice', () => {
    expect(
      isEmptyEdit(
        previewTransfer(testMarks(), ['w1', 'q1'], OTHER_VOICE, 'copy', true, counterIds()),
      ),
    ).toBe(true)
  })
})

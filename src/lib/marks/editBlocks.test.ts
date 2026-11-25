import { describe, expect, it } from 'vitest'
import {
  blockText,
  deleteBlock,
  labelBlock,
  mergeBlock,
  moveBlock,
  resizeBlock,
  splitBlock,
  usedTimeText,
} from './editBlocks.ts'
import { DURATION_MS, FRAME_MS, mark, testMarks } from './fixtures.test-helpers.ts'

const MARKS = testMarks()

describe('moveBlock', () => {
  it('names a mark with no room to move', () => {
    // w1 touches the phrase start and w2, so it cannot move.
    expect(moveBlock(MARKS, 'w1', FRAME_MS, FRAME_MS, DURATION_MS)).toBe('no-room')
    expect(moveBlock(MARKS, 'w1', -FRAME_MS, FRAME_MS, DURATION_MS)).toBe('no-room')
  })

  it('gives null for a move that acts, and for a move of less than half a frame size', () => {
    expect(moveBlock(MARKS, 'w2', FRAME_MS, FRAME_MS, DURATION_MS)).toBeNull()
    expect(moveBlock(MARKS, 'w1', 10, FRAME_MS, DURATION_MS)).toBeNull()
  })
})

describe('resizeBlock', () => {
  it('names an edge with no room to move', () => {
    expect(resizeBlock(MARKS, 'w1', 'start', 950, FRAME_MS, DURATION_MS)).toBe('edge-no-room')
  })

  it('gives null for a resize that acts, for no change and for an unknown mark', () => {
    expect(resizeBlock(MARKS, 'w1', 'end', 1450, FRAME_MS, DURATION_MS)).toBeNull()
    expect(resizeBlock(MARKS, 'w1', 'end', 1510, FRAME_MS, DURATION_MS)).toBeNull()
    expect(resizeBlock(MARKS, 'nope', 'end', 1000, FRAME_MS, DURATION_MS)).toBeNull()
  })
})

describe('usedTimeText', () => {
  it('states the time and the rule', () => {
    expect(usedTimeText(3500, 'snap')).toBe('The app used 0:03.500, a multiple of the frame size.')
    expect(usedTimeText(1000, 'adjacent')).toBe(
      'The app used 0:01.000, the shortest length of the adjacent mark.',
    )
  })
})

describe('splitBlock', () => {
  it('asks for one mark when no mark or more than one mark is selected', () => {
    expect(splitBlock(MARKS, [], 1200, FRAME_MS)).toBe('select-one')
    expect(splitBlock(MARKS, ['w1', 'w2'], 1200, FRAME_MS)).toBe('select-one')
    expect(splitBlock(MARKS, ['nope'], 1200, FRAME_MS)).toBe('select-one')
  })

  it('names the play cursor outside the mark', () => {
    expect(splitBlock(MARKS, ['w1'], 0, FRAME_MS)).toBe('cursor-outside')
    expect(splitBlock(MARKS, ['w1'], 1500, FRAME_MS)).toBe('cursor-outside')
  })

  it('names a play cursor that leaves a part shorter than one frame size', () => {
    expect(splitBlock(MARKS, ['w1'], 1010, FRAME_MS)).toBe('cursor-at-edge')
  })

  it('gives null for a split that acts', () => {
    expect(splitBlock(MARKS, ['w1'], 1200, FRAME_MS)).toBeNull()
  })
})

describe('mergeBlock', () => {
  it('asks for one mark with no selection', () => {
    expect(mergeBlock(MARKS, [])).toBe('select-one')
  })

  it('names the last mark of the layer', () => {
    expect(mergeBlock(MARKS, ['p3'])).toBe('last-on-layer')
  })

  it('names a next word in another phrase and a next phoneme in another word', () => {
    expect(mergeBlock(MARKS, ['w3'])).toBe('next-in-other-phrase')
    expect(mergeBlock(MARKS, ['w1b'])).toBe('next-in-other-word')
  })

  it('gives null for a merge that acts', () => {
    expect(mergeBlock(MARKS, ['w1'])).toBeNull()
  })
})

describe('deleteBlock', () => {
  it('asks for a mark with no selection or only unknown ids', () => {
    expect(deleteBlock(MARKS, [])).toBe('select-mark')
    expect(deleteBlock(MARKS, ['nope'])).toBe('select-mark')
  })

  it('names the last phoneme of a word', () => {
    const marks = [
      mark('w', { startMs: 0, endMs: 500 }),
      mark('f', { layer: 'phoneme', parentId: 'w', startMs: 0, endMs: 500 }),
    ]
    expect(deleteBlock(marks, ['f'])).toBe('last-phoneme')
  })

  it('gives null for a delete that acts', () => {
    expect(deleteBlock(MARKS, ['w1a'])).toBeNull()
  })
})

describe('labelBlock', () => {
  it('asks for one mark unless exactly one mark is selected', () => {
    expect(labelBlock(MARKS, ['w1', 'w2'])).toBe('select-one')
    expect(labelBlock(MARKS, ['w1'])).toBeNull()
  })
})

describe('blockText', () => {
  it('gives the copy of the feature file', () => {
    expect(blockText('cursor-outside')).toBe('Move the play cursor into the mark. Then press S.')
    expect(blockText('last-on-layer')).toBe('This is the last mark of the layer.')
    expect(blockText('last-phoneme')).toBe('A word needs one phoneme or more. Delete the word.')
  })
})

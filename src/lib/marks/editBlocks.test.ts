import { describe, expect, it } from 'vitest'
import { blockText, deleteBlock, labelBlock, mergeBlock, splitBlock } from './editBlocks.ts'
import { FRAME_MS, mark, testMarks } from './fixtures.test-helpers.ts'

const MARKS = testMarks()

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

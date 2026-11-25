import { describe, expect, it } from 'vitest'
import type { Layer, Mark } from '../../store/types.ts'
import { addPlace, previewAdd } from './addRules.ts'
import { after, childrenAfter, counterIds, range } from './editRules.test-helpers.ts'
import { DURATION_MS, FRAME_MS, OTHER_VOICE, testMarks, VOICE } from './fixtures.test-helpers.ts'
import { isEmptyEdit } from './markEdit.ts'

function add(
  layer: Layer,
  startMs: number,
  endMs: number,
  label: string,
  marks: Mark[] = testMarks(),
  voiceId = VOICE,
) {
  return previewAdd(
    marks,
    { voiceId, layer, startMs, endMs, label },
    FRAME_MS,
    DURATION_MS,
    counterIds(),
  )
}

function place(layer: Layer, startMs: number, endMs: number) {
  return addPlace(
    testMarks(),
    { voiceId: VOICE, layer, startMs, endMs, label: '' },
    FRAME_MS,
    DURATION_MS,
  )
}

describe('addPlace', () => {
  it('snaps the times and fills an empty range that is shorter than the mark', () => {
    expect(place('word', 2040, 2690)?.range).toEqual({ startMs: 2000, endMs: 2200 })
  })

  it('moves a mark that ends past the empty range earlier, so it keeps its length', () => {
    // A double-click 50 ms before the end of the 1 s gap from 5000 to 6000 asks for 10 frames.
    expect(place('word', 5950, 6450)?.range).toEqual({ startMs: 5500, endMs: 6000 })
  })

  it('accepts the times in either order', () => {
    expect(place('word', 2150, 2050)?.range).toEqual({ startMs: 2050, endMs: 2150 })
  })

  it('gives undefined when a mark of the layer holds the start', () => {
    expect(place('word', 1200, 1400)).toBeUndefined()
  })

  it('gives undefined for a gap shorter than one frame size', () => {
    expect(place('word', 2000, 2010)).toBeUndefined()
  })

  it('gives undefined for a phoneme with no word at the start', () => {
    expect(place('phoneme', 2050, 2150)).toBeUndefined()
  })

  it('keeps a word outside any phrase in the empty range between phrases', () => {
    expect(place('word', 5200, 5900)).toEqual({
      range: { startMs: 5200, endMs: 5900 },
      parent: undefined,
    })
  })

  it('keeps a phrase inside the song', () => {
    expect(place('phrase', 9800, 10_300)?.range).toEqual({ startMs: 9500, endMs: DURATION_MS })
    expect(place('phrase', -500, 400)?.range).toEqual({ startMs: 0, endMs: 900 })
  })
})

describe('previewAdd', () => {
  it('adds a word inside a phrase as its child, with phonemes and a break down', () => {
    const edit = add('word', 2000, 2200, ' and ')

    expect(after(edit).new1).toMatchObject({
      layer: 'word',
      label: 'and',
      startMs: 2000,
      endMs: 2200,
      parentId: 'p1',
      edited: false,
    })
    expect(childrenAfter(edit, 'new1').length).toBeGreaterThan(0)
    expect(edit.breakDownIds).toEqual(['new1'])
  })

  it('creates a phrase of the same range with the same label for a word outside any phrase', () => {
    const edit = add('word', 5200, 5800, 'calm')

    expect(after(edit).new2).toMatchObject({
      layer: 'phrase',
      label: 'calm',
      startMs: 5200,
      endMs: 5800,
      parentId: null,
    })
    expect(after(edit).new1?.parentId).toBe('new2')
  })

  it('adds a phrase with no words', () => {
    const edit = add('phrase', 7500, 8000, 'sleep in peace')

    expect(edit.added).toEqual([
      expect.objectContaining({ layer: 'phrase', label: 'sleep in peace', parentId: null }),
    ])
  })

  it('adds a phoneme inside a word and sets edited on the phoneme and on the word', () => {
    const marks = testMarks().filter((item) => item.id !== 'w3b')

    const edit = add('phoneme', 2400, 2600, 'O', marks)

    expect(after(edit, marks).new1).toMatchObject({ label: 'O', parentId: 'w3', edited: true })
    expect(after(edit, marks).w3?.edited).toBe(true)
  })

  it('gives an empty edit for a phoneme label that is not one of the ten labels', () => {
    const marks = testMarks().filter((item) => item.id !== 'w3b')

    expect(isEmptyEdit(add('phoneme', 2400, 2600, 'o', marks))).toBe(true)
  })

  it('gives an empty edit for an empty label', () => {
    expect(isEmptyEdit(add('word', 2000, 2200, '  '))).toBe(true)
  })

  it('gives an empty edit in a gap shorter than one frame size', () => {
    expect(isEmptyEdit(add('word', 1500, 1600, 'and'))).toBe(true)
  })

  it('reads only the marks of the voice', () => {
    const edit = add('word', 1000, 1500, 'alto', testMarks(), OTHER_VOICE)

    expect(range(after(edit).new1)).toEqual([1000, 1500])
    expect(after(edit).new1?.parentId).toBe('q1')
  })
})

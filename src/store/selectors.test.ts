import { describe, expect, it } from 'vitest'
import { nextUnknownWord, selectedUnknownWord, unknownWords } from './selectors.ts'
import { makeSongContent } from './fixtures.test-helpers.ts'
import { type SongStoreState, useSongStore } from './songStore.ts'
import type { Mark } from './types.ts'

function word(id: string, startMs: number, unknown?: boolean, voiceId = 'v1'): Mark {
  return {
    id,
    voiceId,
    layer: 'word',
    label: id,
    startMs,
    endMs: startMs + 500,
    parentId: null,
    edited: false,
    ...(unknown === undefined ? {} : { unknown }),
  }
}

function state(marks: Mark[]): SongStoreState {
  useSongStore.setState({ current: { ...makeSongContent(), marks } })
  return useSongStore.getState()
}

const W1 = word('w1', 1000, true)
const W2 = word('w2', 2000, true)
const W3 = word('w3', 3000, true)

describe('unknownWords', () => {
  it('gives the unknown words of the voice in time order', () => {
    const marks = [
      W3,
      word('known', 500, false),
      word('none', 600),
      W1,
      word('other-voice', 700, true, 'v2'),
      { ...word('phoneme', 800, true), layer: 'phoneme' as const },
      W2,
    ]

    expect(unknownWords('v1')(state(marks))).toEqual([W1, W2, W3])
  })

  it('gives an empty list when no song is open', () => {
    useSongStore.getState().closeSong()
    expect(unknownWords('v1')(useSongStore.getState())).toEqual([])
  })

  it('gives an empty list for a song with no voice', () => {
    expect(unknownWords(undefined)(state([W1]))).toEqual([])
  })
})

describe('nextUnknownWord', () => {
  const words = [W1, W2, W3]

  it('gives the first word that starts at or after the play time', () => {
    expect(nextUnknownWord(words, [], 1500)).toBe(W2)
    expect(nextUnknownWord(words, [], 2000)).toBe(W2)
  })

  it('gives the first word of the voice when no word starts after the play time', () => {
    expect(nextUnknownWord(words, [], 3500)).toBe(W1)
  })

  it('gives the word after the selected unknown word', () => {
    expect(nextUnknownWord(words, ['w1'], 0)).toBe(W2)
  })

  it('gives the first word after the selected last word', () => {
    expect(nextUnknownWord(words, ['w3'], 0)).toBe(W1)
  })

  it('uses the play time when the selection is not one unknown word', () => {
    expect(nextUnknownWord(words, ['w1', 'w2'], 2500)).toBe(W3)
    expect(nextUnknownWord(words, ['known'], 2500)).toBe(W3)
  })

  it('gives undefined for no unknown words', () => {
    expect(nextUnknownWord([], [], 0)).toBeUndefined()
  })
})

describe('selectedUnknownWord', () => {
  const marks = [
    W1,
    word('known', 500, false),
    { ...word('f1', 800, true), layer: 'phoneme' as const },
  ]

  it('gives the only selected mark when it is an unknown word', () => {
    expect(selectedUnknownWord(marks, ['w1'])).toBe(W1)
  })

  it('gives undefined for a known word, a phoneme, no selection and two selected marks', () => {
    expect(selectedUnknownWord(marks, ['known'])).toBeUndefined()
    expect(selectedUnknownWord(marks, ['f1'])).toBeUndefined()
    expect(selectedUnknownWord(marks, [])).toBeUndefined()
    expect(selectedUnknownWord(marks, ['w1', 'known'])).toBeUndefined()
    expect(selectedUnknownWord(marks, ['missing'])).toBeUndefined()
  })
})

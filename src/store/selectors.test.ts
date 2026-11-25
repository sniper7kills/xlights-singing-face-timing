import { describe, expect, it } from 'vitest'
import {
  ghostBars,
  nextUnknownWord,
  phonemeLabelAt,
  previewVoices,
  selectedUnknownWord,
  unknownWords,
} from './selectors.ts'
import { makeSongContent } from './fixtures.test-helpers.ts'
import { type SongStoreState, useSongStore } from './songStore.ts'
import type { Mark, Voice } from './types.ts'

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

describe('phonemeLabelAt', () => {
  const phoneme = (
    id: string,
    label: string,
    startMs: number,
    endMs: number,
    voiceId = 'v1',
  ): Mark => ({
    ...word(id, startMs, undefined, voiceId),
    layer: 'phoneme',
    label,
    endMs,
  })
  const marks = [
    word('w1', 1000),
    phoneme('f1', 'etc', 1000, 1200),
    phoneme('f2', 'O', 1200, 1500),
    phoneme('f3', 'AI', 2000, 2500),
    phoneme('other', 'E', 1500, 2000, 'v2'),
    phoneme('bad', 'XX', 3000, 3500),
  ]

  it('gives the label of the phoneme at a time inside it', () => {
    expect(phonemeLabelAt(marks, 'v1', 1300)).toBe('O')
  })

  it('gives the later phoneme at a shared boundary', () => {
    expect(phonemeLabelAt(marks, 'v1', 1200)).toBe('O')
    expect(phonemeLabelAt(marks, 'v1', 1000)).toBe('etc')
  })

  it('gives null between two phonemes and for a phoneme of another voice', () => {
    expect(phonemeLabelAt(marks, 'v1', 1500)).toBeNull()
    expect(phonemeLabelAt(marks, 'v1', 1700)).toBeNull()
    expect(phonemeLabelAt(marks, 'v2', 1700)).toBe('E')
  })

  it('gives null for a song with no voice and for a label that is not a phoneme label', () => {
    expect(phonemeLabelAt(marks, undefined, 1300)).toBeNull()
    expect(phonemeLabelAt(marks, 'v1', 3200)).toBeNull()
  })
})

function voice(id: string, order: number, previewMuted?: boolean): Voice {
  return {
    id,
    songId: 'song-1',
    name: `Name ${id}`,
    order,
    color: `#00000${order}`,
    ...(previewMuted === undefined ? {} : { previewMuted }),
  }
}

function phrase(id: string, voiceId: string, startMs: number): Mark {
  return { ...word(id, startMs, undefined, voiceId), layer: 'phrase' }
}

describe('ghostBars', () => {
  const VOICES = [voice('v1', 0), voice('v2', 1), voice('v3', 2), voice('v4', 3)]

  it('gives one bar for each phrase of each other voice, in time order', () => {
    const marks = [
      phrase('b', 'v2', 3000),
      phrase('a', 'v1', 0),
      word('w', 100, undefined, 'v2'),
      { ...word('f', 200, undefined, 'v3'), layer: 'phoneme' as const },
      phrase('c', 'v4', 1000),
      phrase('d', 'v2', 500),
    ]

    expect(ghostBars(VOICES, marks, 'v1')).toEqual([
      {
        id: 'd',
        voiceId: 'v2',
        voiceName: 'Name v2',
        color: '#000001',
        label: 'd',
        startMs: 500,
        endMs: 1000,
        lane: 0,
      },
      {
        id: 'c',
        voiceId: 'v4',
        voiceName: 'Name v4',
        color: '#000003',
        label: 'c',
        startMs: 1000,
        endMs: 1500,
        lane: 1,
      },
      {
        id: 'b',
        voiceId: 'v2',
        voiceName: 'Name v2',
        color: '#000001',
        label: 'b',
        startMs: 3000,
        endMs: 3500,
        lane: 0,
      },
    ])
  })

  it('gives the lanes in voice order and skips a voice with no phrase', () => {
    const voices = [voice('v4', 0), voice('v1', 1), voice('v3', 2), voice('v2', 3)]
    const marks = [phrase('a', 'v2', 0), phrase('b', 'v4', 0), phrase('c', 'v1', 0)]

    const lanes = ghostBars(voices, marks, 'v3').map((bar) => [bar.voiceId, bar.lane])

    expect(lanes).toEqual([
      ['v4', 0],
      ['v1', 1],
      ['v2', 2],
    ])
  })

  it('gives no bar for a song with one voice', () => {
    expect(ghostBars([voice('v1', 0)], [phrase('a', 'v1', 0)], 'v1')).toEqual([])
  })
})

describe('previewVoices', () => {
  it('gives the first 4 of 6 unmuted voices and a count of 2 more', () => {
    const voices = [0, 1, 2, 3, 4, 5].map((order) => voice(`v${order}`, order))

    const { shown, moreCount } = previewVoices(voices)

    expect(shown.map((item) => item.id)).toEqual(['v0', 'v1', 'v2', 'v3'])
    expect(moreCount).toBe(2)
  })

  it('leaves out a muted voice and counts only unmuted voices', () => {
    const voices = [voice('v0', 0, true), voice('v1', 1, false), voice('v2', 2)]

    expect(previewVoices(voices)).toEqual({ shown: [voices[1], voices[2]], moreCount: 0 })
  })

  it('gives no voice when every voice is muted', () => {
    expect(previewVoices([voice('v0', 0, true)])).toEqual({ shown: [], moreCount: 0 })
  })
})

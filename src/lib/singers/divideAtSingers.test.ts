import { describe, expect, it } from 'vitest'
import { mark } from '../marks/fixtures.test-helpers.ts'
import type { Mark } from '../../store/types.ts'
import type { SingerRange } from './assignSingers.ts'
import { divideAtSingers, PHRASE_RULE, singerChangeTimes } from './divideAtSingers.ts'

const sings = (singer: number, startMs: number, endMs: number): SingerRange => ({
  singer,
  startMs,
  endMs,
})

/** Returns words of 1 s each from `startMs`, with the labels in order, in the phrase `p`. */
function words(labels: readonly string[], startMs = 0, parentId = 'p'): Mark[] {
  return labels.map((label, index) =>
    mark(label, {
      label,
      startMs: startMs + index * 1000,
      endMs: startMs + index * 1000 + 1000,
      parentId,
    }),
  )
}

/** Returns a phrase over the words, with a label of its own, and one phoneme for each word. */
function phraseWith(children: readonly Mark[], id = 'p'): Mark[] {
  const startMs = children[0]?.startMs ?? 0
  const endMs = children.at(-1)?.endMs ?? 0
  return [
    mark(id, { layer: 'phrase', label: 'the label of the run', startMs, endMs }),
    ...children,
    ...children.map((word) =>
      mark(`${word.id}-ph`, {
        layer: 'phoneme',
        label: 'etc',
        startMs: word.startMs,
        endMs: word.endMs,
        parentId: word.id,
      }),
    ),
  ]
}

function counter() {
  let next = 0
  return () => `new-${next++}`
}

describe('singerChangeTimes', () => {
  it('returns no time for the words of one singer', () => {
    expect(singerChangeTimes(words(['a', 'b', 'c']), [sings(0, 0, 3000)])).toEqual([])
  })

  it('returns the start of the first word of the second singer', () => {
    const segments = [sings(0, 0, 2000), sings(1, 2000, 4000)]

    expect(singerChangeTimes(words(['a', 'b', 'c', 'd']), segments)).toEqual([2000])
  })

  it('returns two times for an answer of a second singer inside the phrase of the first', () => {
    // The shape of phrase 24 of the song of issue #148: the chorus answers for about 2 s inside a phrase of the man.
    const segments = [sings(1, 0, 2000), sings(0, 2000, 3400), sings(1, 3400, 5000)]

    expect(singerChangeTimes(words(['a', 'b', 'c', 'd', 'e']), segments)).toEqual([2000, 3000])
  })

  it('joins a part shorter than 1 s to its neighbour', () => {
    const short = [...words(['a', 'b']), mark('c', { startMs: 2000, endMs: 2950, parentId: 'p' })]
    const segments = [sings(0, 0, 2000), sings(1, 2000, 2950)]

    expect(singerChangeTimes(short, segments)).toEqual([])
  })

  it('divides at a part of one word that is 1 s long', () => {
    const segments = [sings(0, 0, 2000), sings(1, 2000, 3000)]

    expect(singerChangeTimes(words(['a', 'b', 'c']), segments)).toEqual([2000])
  })

  it('joins a short part to the longer neighbour when it lies between two parts', () => {
    const list = [
      ...words(['a', 'b', 'c']),
      mark('d', { startMs: 3000, endMs: 3500, parentId: 'p' }),
      mark('e', { startMs: 3500, endMs: 4500, parentId: 'p' }),
    ]
    const segments = [sings(0, 0, 3000), sings(1, 3000, 3500), sings(2, 3500, 4500)]

    expect(singerChangeTimes(list, segments)).toEqual([3500])
  })

  it('gives a word with no singer to the part before it', () => {
    const segments = [sings(0, 0, 2000), sings(1, 3000, 5000)]

    expect(singerChangeTimes(words(['a', 'b', 'c', 'd', 'e']), segments)).toEqual([3000])
  })

  it('gives a first word with no singer to the part after it', () => {
    const segments = [sings(0, 1000, 3000), sings(1, 3000, 5000)]

    expect(singerChangeTimes(words(['a', 'b', 'c', 'd', 'e']), segments)).toEqual([3000])
  })

  it('returns no time when no singer range touches the words', () => {
    expect(singerChangeTimes(words(['a', 'b']), [])).toEqual([])
  })

  it('keeps a word whole when the singer changes inside it', () => {
    // The change at 2300 ms is inside the word "c"; singer 1 holds most of "c", so "c" goes to singer 1.
    const segments = [sings(0, 0, 2300), sings(1, 2300, 4000)]

    expect(singerChangeTimes(words(['a', 'b', 'c', 'd']), segments)).toEqual([2000])
  })
})

describe('divideAtSingers', () => {
  it('divides a phrase where the singer changes, and keeps each word and phoneme as it was', () => {
    const marks = phraseWith(words(['silent', 'night', 'holy', 'night2']))
    const segments = [sings(0, 0, 2000), sings(1, 2000, 4000)]

    const result = divideAtSingers(marks, ['p'], segments, 50, counter())

    expect(result.dividedCount).toBe(1)
    expect(result.phraseIds).toEqual(['p', 'new-0'])
    const byId = new Map(result.marks.map((item) => [item.id, item]))
    expect(byId.get('p')).toMatchObject({ startMs: 0, endMs: 2000, label: 'silent night' })
    expect(byId.get('new-0')).toMatchObject({
      layer: 'phrase',
      startMs: 2000,
      endMs: 4000,
      label: 'holy night2',
    })
    expect(byId.get('holy')).toMatchObject({ parentId: 'new-0', startMs: 2000, endMs: 3000 })
    expect(byId.get('night')).toMatchObject({ parentId: 'p', startMs: 1000, endMs: 2000 })
    for (const before of marks.filter((item) => item.layer !== 'phrase'))
      expect(byId.get(before.id)).toMatchObject({ startMs: before.startMs, endMs: before.endMs })
  })

  it('divides an answer inside a phrase into three phrases in time order', () => {
    const marks = phraseWith(words(['a', 'b', 'c', 'd', 'e']))
    const segments = [sings(1, 0, 2000), sings(0, 2000, 3400), sings(1, 3400, 5000)]

    const result = divideAtSingers(marks, ['p'], segments, 50, counter())

    const phrases = result.phraseIds.map((id) => result.marks.find((item) => item.id === id))
    expect(phrases.map((item) => [item?.startMs, item?.endMs, item?.label])).toEqual([
      [0, 2000, 'a b'],
      [2000, 3000, 'c'],
      [3000, 5000, 'd e'],
    ])
  })

  it('keeps a phrase of one singer with its label and its id', () => {
    const marks = phraseWith(words(['a', 'b']))

    const result = divideAtSingers(marks, ['p'], [sings(0, 0, 2000)], 50, counter())

    expect(result).toEqual({ marks, phraseIds: ['p'], dividedCount: 0 })
  })

  it('changes only the phrases in the list', () => {
    const marks = [
      ...phraseWith(words(['a', 'b'], 0, 'p'), 'p'),
      ...phraseWith(words(['c', 'd'], 2000, 'q'), 'q'),
    ]
    const segments = [sings(0, 0, 1000), sings(1, 1000, 3000), sings(0, 3000, 4000)]

    const result = divideAtSingers(marks, ['q'], segments, 50, counter())

    expect(result.phraseIds).toEqual(['q', 'new-0'])
    expect(result.marks.find((item) => item.id === 'p')).toEqual(marks[0])
  })
})

describe('PHRASE_RULE', () => {
  it('holds the constants of the rule in force', () => {
    expect(PHRASE_RULE).toEqual({
      secondSingerRatio: 0.8,
      secondSingerMs: 1000,
      partMinWords: 1,
      partMinMs: 1000,
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  assignmentStats,
  assignSingers,
  type PhraseRange,
  type SingerRange,
} from './assignSingers.ts'

const phrase = (id: string, startMs: number, endMs: number): PhraseRange => ({ id, startMs, endMs })
const sings = (singer: number, startMs: number, endMs: number): SingerRange => ({
  singer,
  startMs,
  endMs,
})

function asObject(result: Map<string, number[]>): Record<string, number[]> {
  return Object.fromEntries(result)
}

describe('assignSingers', () => {
  it('gives each phrase to the singer who sings it when the singers take turns', () => {
    const phrases = [phrase('a', 0, 1000), phrase('b', 1000, 2000), phrase('c', 2000, 3000)]
    const segments = [sings(0, 0, 1000), sings(1, 1000, 2000), sings(0, 2000, 3000)]

    expect(asObject(assignSingers(phrases, segments))).toEqual({ a: [0], b: [1], c: [0] })
  })

  it('gives a phrase to both singers when they have the same time in it', () => {
    const segments = [sings(0, 0, 600), sings(1, 400, 1000)]

    expect(asObject(assignSingers([phrase('a', 0, 1000)], segments))).toEqual({ a: [0, 1] })
  })

  it('gives a phrase to one singer when the second singer has less than 80% of the top time', () => {
    const segments = [sings(0, 0, 5000), sings(1, 1050, 5000)]

    expect(asObject(assignSingers([phrase('a', 0, 5000)], segments))).toEqual({ a: [0] })
  })

  it('gives a phrase to a second singer with exactly 80% of the top time and 1 s or more', () => {
    const segments = [sings(0, 0, 5000), sings(1, 1000, 5000)]

    expect(asObject(assignSingers([phrase('a', 0, 5000)], segments))).toEqual({ a: [0, 1] })
  })

  it('gives no copy to a second singer with 80% of the top time but less than 1 s', () => {
    const segments = [sings(0, 0, 1000), sings(1, 0, 900)]

    expect(asObject(assignSingers([phrase('a', 0, 1000)], segments))).toEqual({ a: [0] })
  })

  it('gives no copy for a short answer of the chorus inside a phrase of the lead singer', () => {
    // The shape of phrase 15 of the song of issue #148: the chorus holds 40% of the phrase, the man 100%.
    const segments = [sings(0, 54_500, 56_550), sings(1, 54_500, 55_320)]

    expect(asObject(assignSingers([phrase('a', 54_500, 56_550)], segments))).toEqual({ a: [0] })
  })

  it('gives a phrase that no singer covers well to the singer with the most time in it', () => {
    const phrases = [phrase('first', 0, 1000), phrase('a', 1000, 2000)]
    const segments = [sings(0, 0, 1000), sings(0, 1000, 1100), sings(1, 1800, 2000)]

    expect(asObject(assignSingers(phrases, segments))).toEqual({ first: [0], a: [1] })
  })

  it('gives a phrase with no singer range to singer 0', () => {
    const phrases = [phrase('a', 0, 1000), phrase('b', 5000, 6000)]

    expect(asObject(assignSingers(phrases, [sings(3, 0, 1000)]))).toEqual({ a: [0], b: [0] })
  })

  it('gives every phrase to singer 0 with no singer range at all', () => {
    expect(asObject(assignSingers([phrase('a', 0, 1000)], []))).toEqual({ a: [0] })
  })

  it('counts the time of two ranges of one singer that overlap one time only', () => {
    const segments = [sings(1, 0, 250), sings(1, 0, 250), sings(0, 250, 1000)]

    expect(asObject(assignSingers([phrase('a', 0, 1000)], segments))).toEqual({ a: [0] })
  })

  it('numbers the singers in the order of their first phrase', () => {
    const phrases = [phrase('b', 1000, 2000), phrase('a', 0, 1000)]
    const segments = [sings(4, 0, 1000), sings(2, 1000, 2000)]

    expect(asObject(assignSingers(phrases, segments))).toEqual({ a: [0], b: [1] })
  })

  it('keeps 12 singers at most by default', () => {
    const phrases = Array.from({ length: 14 }, (_, index) =>
      phrase(`p${index}`, index * 1000, index * 1000 + 1000),
    )
    const segments = phrases.map((item, index) => sings(index, item.startMs, item.endMs))

    const singers = new Set([...assignSingers(phrases, segments).values()].flat())

    expect(singers.size).toBe(12)
  })

  it('moves the singers with the least phrase time to the nearest earlier singer', () => {
    // Singer 2 has the least time, so its phrase goes to singer 1, the nearest earlier singer.
    const phrases = [phrase('a', 0, 3000), phrase('b', 3000, 5000), phrase('c', 5000, 6000)]
    const segments = [sings(0, 0, 3000), sings(1, 3000, 5000), sings(2, 5000, 6000)]

    expect(asObject(assignSingers(phrases, segments, 2))).toEqual({ a: [0], b: [1], c: [1] })
  })

  it('keeps singer 0 when the cap removes singers, and numbers the rest again', () => {
    const phrases = [phrase('a', 0, 100), phrase('b', 100, 2000), phrase('c', 2000, 5000)]
    const segments = [sings(0, 0, 100), sings(1, 100, 2000), sings(2, 2000, 5000)]

    expect(asObject(assignSingers(phrases, segments, 2))).toEqual({ a: [0], b: [0], c: [1] })
  })

  it('removes a repeat when a phrase of two singers goes to one singer after the cap', () => {
    const segments = [sings(0, 0, 1000), sings(1, 0, 1000)]

    expect(asObject(assignSingers([phrase('a', 0, 1000)], segments, 1))).toEqual({ a: [0] })
  })

  it('counts a cap below 1 as 1', () => {
    const segments = [sings(0, 0, 1000), sings(1, 1000, 2000)]
    const phrases = [phrase('a', 0, 1000), phrase('b', 1000, 2000)]

    expect(asObject(assignSingers(phrases, segments, 0))).toEqual({ a: [0], b: [0] })
  })
})

describe('assignmentStats', () => {
  it('counts the singers with phrases with no limit of singers', () => {
    const phrases = [phrase('a', 0, 1000), phrase('b', 1000, 2000)]
    const segments = [sings(0, 0, 1000), sings(1, 1000, 2000)]

    expect(assignmentStats(phrases, segments).singersWithPhrases).toBe(2)
  })

  it('counts the phrases that no singer range touches', () => {
    const phrases = [phrase('a', 0, 1000), phrase('b', 2000, 3000)]

    expect(assignmentStats(phrases, [sings(0, 0, 1000)]).phrasesWithNoSinger).toBe(1)
  })

  it('counts the phrases that two singers got', () => {
    const phrases = [phrase('a', 0, 1000), phrase('b', 1000, 2000)]
    const segments = [sings(0, 0, 2000), sings(1, 0, 1000)]

    expect(assignmentStats(phrases, segments).phrasesWithMoreSingers).toBe(1)
  })

  it('gives zeros for no phrase and no range', () => {
    expect(assignmentStats([], [])).toEqual({
      singersWithPhrases: 0,
      phrasesWithNoSinger: 0,
      phrasesWithMoreSingers: 0,
    })
  })
})

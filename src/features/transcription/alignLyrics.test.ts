import { describe, expect, it } from 'vitest'
import { alignLyrics } from './alignLyrics.ts'
import type { AlignedWord, TimedWord } from './types.ts'

function word(text: string, startMs: number, endMs: number): TimedWord {
  return { text, startMs, endMs }
}

function words(phrases: { words: AlignedWord[] }[]): AlignedWord[] {
  return phrases.flatMap((phrase) => phrase.words)
}

describe('alignLyrics', () => {
  it('returns the lyrics spelling for each matched word', () => {
    const { phrases } = alignLyrics(
      [word(' hello', 0, 400), word(' WORLD.', 500, 900)],
      'Hello, world!',
    )

    expect(words(phrases)).toEqual([
      { text: 'Hello,', startMs: 0, endMs: 400, estimated: false },
      { text: 'world!', startMs: 500, endMs: 900, estimated: false },
    ])
  })

  it('matches words without apostrophes and hyphens', () => {
    const { matchRatio } = alignLyrics(
      [word('dont', 0, 100), word('well-known', 200, 300)],
      "don't wellknown",
    )

    expect(matchRatio).toBe(1)
  })

  it('makes one phrase for each line of 4 lines of lyrics', () => {
    const transcribed = ['a', 'b', 'c', 'd', 'e', 'f'].map((text, i) =>
      word(text, i * 500, i * 500 + 400),
    )

    const { phrases } = alignLyrics(transcribed, 'a b\n[Chorus]\nc\n\nd e\nf')

    expect(phrases.map((phrase) => phrase.text)).toEqual(['a b', 'c', 'd e', 'f'])
    expect(phrases.map((phrase) => [phrase.startMs, phrase.endMs])).toEqual([
      [0, 900],
      [1000, 1400],
      [1500, 2400],
      [2500, 2900],
    ])
  })

  it('gives unmatched lyrics words between two matched words an even share of the time between them', () => {
    const { phrases } = alignLyrics(
      [word('one', 0, 400), word('four', 1000, 1400)],
      'one two three four',
    )

    expect(words(phrases)).toEqual([
      { text: 'one', startMs: 0, endMs: 400, estimated: false },
      { text: 'two', startMs: 400, endMs: 700, estimated: true },
      { text: 'three', startMs: 700, endMs: 1000, estimated: true },
      { text: 'four', startMs: 1000, endMs: 1400, estimated: false },
    ])
  })

  it('shares the gap across lines and keeps each word in its own line', () => {
    const { phrases } = alignLyrics(
      [word('one', 0, 400), word('four', 1000, 1400)],
      'one two\nthree four',
    )

    expect(phrases.map((phrase) => phrase.text)).toEqual(['one two', 'three four'])
    expect(phrases[0]?.endMs).toBe(700)
    expect(phrases[1]?.startMs).toBe(700)
  })

  it('discards a transcribed word with no lyrics match', () => {
    const { phrases } = alignLyrics(
      [word('one', 0, 400), word('uh', 450, 500), word('two', 600, 900)],
      'one two',
    )

    expect(words(phrases).map((w) => w.text)).toEqual(['one', 'two'])
  })

  it('gives unmatched lyrics words before the first match the time from the first transcribed word', () => {
    const { phrases } = alignLyrics(
      [word('uh', 0, 300), word('yeah', 400, 600), word('go', 1000, 1200)],
      'oh oh go',
    )

    expect(words(phrases)).toEqual([
      { text: 'oh', startMs: 0, endMs: 500, estimated: true },
      { text: 'oh', startMs: 500, endMs: 1000, estimated: true },
      { text: 'go', startMs: 1000, endMs: 1200, estimated: false },
    ])
  })

  it('gives unmatched lyrics words after the last match the time to the last transcribed word', () => {
    const { phrases } = alignLyrics([word('go', 0, 200), word('mm', 600, 1000)], 'go now')

    expect(words(phrases)).toEqual([
      { text: 'go', startMs: 0, endMs: 200, estimated: false },
      { text: 'now', startMs: 200, endMs: 1000, estimated: true },
    ])
  })

  it('gives unmatched words no length when the first transcribed word is the first match', () => {
    const { phrases } = alignLyrics([word('go', 300, 500)], 'oh go')

    expect(words(phrases)[0]).toEqual({ text: 'oh', startMs: 300, endMs: 300, estimated: true })
  })

  it('returns the share of lyrics words that matched', () => {
    const { matchRatio } = alignLyrics(
      [word('one', 0, 100), word('two', 200, 300)],
      'one two three four',
    )

    expect(matchRatio).toBe(0.5)
  })

  it('matches no word out of sequence order', () => {
    const { phrases, matchRatio } = alignLyrics(
      [word('two', 0, 100), word('one', 200, 300)],
      'one two',
    )

    expect(matchRatio).toBe(0.5)
    expect(words(phrases).filter((w) => w.estimated)).toHaveLength(1)
  })

  it('spreads the lyrics across the transcribed words when no word matches', () => {
    const { phrases, matchRatio } = alignLyrics(
      [word('x', 1000, 1200), word('y', 2800, 3000)],
      'a b\nc',
    )

    expect(matchRatio).toBe(0)
    expect(phrases.map((phrase) => [phrase.startMs, phrase.endMs])).toEqual([
      [1000, 2000],
      [2000, 3000],
    ])
    expect(words(phrases).every((w) => w.estimated)).toBe(true)
  })

  it('places the lyrics at time 0 when there is no transcribed word', () => {
    const { phrases, matchRatio } = alignLyrics([], 'a')

    expect(matchRatio).toBe(0)
    expect(words(phrases)).toEqual([{ text: 'a', startMs: 0, endMs: 0, estimated: true }])
  })

  it('returns no phrase and a match ratio of 0 for lyrics with no word', () => {
    expect(alignLyrics([word('a', 0, 100)], '[Intro]\n')).toEqual({ phrases: [], matchRatio: 0 })
  })
})

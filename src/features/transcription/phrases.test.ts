import { describe, expect, it } from 'vitest'
import {
  groupIntoPhrases,
  parseLyrics,
  parseSectionTags,
  spreadLyrics,
  spreadWords,
} from './phrases.ts'
import type { AlignedPhrase, TimedWord } from './types.ts'

function word(text: string, startMs: number, endMs: number): TimedWord {
  return { text, startMs, endMs }
}

function texts(phrases: AlignedPhrase[]): string[] {
  return phrases.map((phrase) => phrase.text)
}

describe('groupIntoPhrases', () => {
  it('starts a new phrase after a gap of 700 ms', () => {
    const phrases = groupIntoPhrases([word('hold', 0, 300), word('on', 1000, 1200)])

    expect(texts(phrases)).toEqual(['hold', 'on'])
  })

  it('keeps words in one phrase across a gap of 699 ms', () => {
    const phrases = groupIntoPhrases([word('hold', 0, 300), word('on', 999, 1200)])

    expect(texts(phrases)).toEqual(['hold on'])
  })

  it.each(['night.', 'you?', 'go!', 'said."'])(
    'starts a new phrase after a word that ends with %s',
    (end) => {
      const phrases = groupIntoPhrases([word(end, 0, 300), word('next', 400, 600)])

      expect(phrases).toHaveLength(2)
    },
  )

  it('keeps words in one phrase after a comma', () => {
    const phrases = groupIntoPhrases([word('yes,', 0, 300), word('no', 400, 600)])

    expect(phrases).toHaveLength(1)
  })

  it('starts a new phrase when the phrase has 12 words', () => {
    const words = Array.from({ length: 13 }, (_, i) => word(`w${i}`, i * 100, i * 100 + 50))

    const phrases = groupIntoPhrases(words)

    expect(phrases.map((phrase) => phrase.words.length)).toEqual([12, 1])
  })

  it('gives a phrase the start of its first word and the end of its last word', () => {
    const [phrase] = groupIntoPhrases([word('a', 120, 300), word('b', 350, 610)])

    expect(phrase).toMatchObject({ startMs: 120, endMs: 610 })
  })

  it('removes the space that the speech model puts before a word', () => {
    const [phrase] = groupIntoPhrases([word(' Hello', 0, 300), word(' World', 350, 600)])

    expect(phrase?.words.map((w) => w.text)).toEqual(['Hello', 'World'])
    expect(phrase?.text).toBe('Hello World')
  })

  it('marks no word as estimated', () => {
    const phrases = groupIntoPhrases([word('a', 0, 100), word('b', 2000, 2100)])

    expect(phrases.flatMap((phrase) => phrase.words).every((w) => !w.estimated)).toBe(true)
  })

  it('returns no phrase for no word', () => {
    expect(groupIntoPhrases([])).toEqual([])
  })
})

describe('parseLyrics', () => {
  it('returns one list of words for each line', () => {
    expect(parseLyrics('Hello there\nGood night')).toEqual([
      ['Hello', 'there'],
      ['Good', 'night'],
    ])
  })

  it('ignores a line with no words', () => {
    expect(parseLyrics('one\n\n   \n...\ntwo')).toEqual([['one'], ['two']])
  })

  it('ignores a line that is only text in square brackets', () => {
    expect(parseLyrics('[Chorus]\n  [Verse 2]  \nla la')).toEqual([['la', 'la']])
  })

  it('keeps a line that has words after a tag in square brackets', () => {
    expect(parseLyrics('[Chorus] la')).toEqual([['[Chorus]', 'la']])
  })

  it('keeps the spelling, the case and the punctuation of each word', () => {
    expect(parseLyrics("Don't  STOP, now\r\nok")).toEqual([["Don't", 'STOP,', 'now'], ['ok']])
  })
})

describe('parseSectionTags', () => {
  it('gives each tag the index of the next lyrics line', () => {
    const lyrics = 'intro\n[Verse 1]\none\n\ntwo\n[Chorus]\nthree'

    expect(parseSectionTags(lyrics)).toEqual([
      { name: 'Verse 1', lineIndex: 1 },
      { name: 'Chorus', lineIndex: 3 },
    ])
    expect(parseLyrics(lyrics)).toEqual([['intro'], ['one'], ['two'], ['three']])
  })

  it('gives two tags in sequence the same index', () => {
    expect(parseSectionTags('[Intro]\n[Verse]\nla')).toEqual([
      { name: 'Intro', lineIndex: 0 },
      { name: 'Verse', lineIndex: 0 },
    ])
  })

  it('gives a tag at the end the count of lines', () => {
    expect(parseSectionTags('la\nla\n[Outro]')).toEqual([{ name: 'Outro', lineIndex: 2 }])
  })

  it('gives no entry for a tag with an empty name or a tag inside a line', () => {
    expect(parseSectionTags('[]\n[  ]\n[Chorus] la\nla')).toEqual([])
  })

  it('trims the name and cuts it to 40 characters', () => {
    const long = 'A'.repeat(39) + ' BC'

    expect(parseSectionTags(`[  ${long} ]\nla`)).toEqual([{ name: 'A'.repeat(39), lineIndex: 0 }])
  })
})

describe('spreadWords', () => {
  it('gives each word an equal share of the range', () => {
    expect(spreadWords(['a', 'b', 'c', 'd'], 1000, 2000)).toEqual([
      { text: 'a', startMs: 1000, endMs: 1250, estimated: true },
      { text: 'b', startMs: 1250, endMs: 1500, estimated: true },
      { text: 'c', startMs: 1500, endMs: 1750, estimated: true },
      { text: 'd', startMs: 1750, endMs: 2000, estimated: true },
    ])
  })

  it('gives each word no length when the end is before the start', () => {
    expect(spreadWords(['a', 'b'], 500, 400)).toEqual([
      { text: 'a', startMs: 500, endMs: 500, estimated: true },
      { text: 'b', startMs: 500, endMs: 500, estimated: true },
    ])
  })
})

describe('spreadLyrics', () => {
  const lyrics = 'one two\nthree\n\n[Bridge]\nfour five six\nseven'

  it('makes one phrase for each line of 4 lines of lyrics', () => {
    expect(texts(spreadLyrics(lyrics, 0, 4000))).toEqual([
      'one two',
      'three',
      'four five six',
      'seven',
    ])
  })

  it('spreads the phrases evenly across the range', () => {
    const phrases = spreadLyrics(lyrics, 1000, 5000)

    expect(phrases.map((p) => [p.startMs, p.endMs])).toEqual([
      [1000, 2000],
      [2000, 3000],
      [3000, 4000],
      [4000, 5000],
    ])
  })

  it('spreads the words of each phrase evenly across the phrase', () => {
    const phrases = spreadLyrics(lyrics, 0, 4000)

    expect(phrases[2]?.words.map((w) => [w.startMs, w.endMs])).toEqual([
      [2000, 2000 + 1000 / 3],
      [2000 + 1000 / 3, 2000 + 2000 / 3],
      [2000 + 2000 / 3, 3000],
    ])
  })

  it('marks every word as estimated', () => {
    const words = spreadLyrics(lyrics, 0, 4000).flatMap((phrase) => phrase.words)

    expect(words).toHaveLength(7)
    expect(words.every((w) => w.estimated)).toBe(true)
  })

  it('returns no phrase for lyrics with no word', () => {
    expect(spreadLyrics('\n[Intro]\n', 0, 1000)).toEqual([])
  })
})

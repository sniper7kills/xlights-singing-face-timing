import { normaliseForMatch } from './normalise.ts'
import type { AlignedPhrase, AlignedWord, TimedWord } from './types.ts'

const PHRASE_GAP_MS = 700
const MAX_WORDS_IN_PHRASE = 12

// A closing quote or bracket can follow the punctuation that ends a sentence.
const SENTENCE_END = /[.?!]["')\]]*$/

// A section tag such as "[Chorus]" is not sung, so the line is not a phrase.
const TAG_LINE = /^\[[^\]]*\]$/

/**
 * Returns one phrase that holds the words, with the start of the first word and the
 * end of the last word.
 * @param words The words of the phrase in time order. The list has one or more words.
 */
export function toPhrase(words: AlignedWord[]): AlignedPhrase {
  const first = words[0]
  const last = words[words.length - 1]
  return {
    text: words.map((word) => word.text).join(' '),
    startMs: first?.startMs ?? 0,
    endMs: last?.endMs ?? 0,
    words,
  }
}

/**
 * Returns the words as estimated words that share the range from `startMs` to `endMs`
 * evenly.
 * The times are not whole milliseconds. The caller snaps them to the frame size.
 * @param texts The words in order.
 * @param startMs The start of the range.
 * @param endMs The end of the range. If it is before `startMs`, each word has no length.
 */
export function spreadWords(texts: string[], startMs: number, endMs: number): AlignedWord[] {
  const share = Math.max(0, endMs - startMs) / texts.length
  return texts.map((text, i) => ({
    text,
    startMs: startMs + i * share,
    endMs: startMs + (i + 1) * share,
    estimated: true,
  }))
}

/**
 * Returns the words of each lyrics line, one list for each line that becomes a phrase.
 * The function ignores these lines:
 * - a line with no word,
 * - a line that is only text in square brackets, such as `[Chorus]`.
 *
 * A word is a part of the line between spaces that has a letter or a digit.
 * Each word keeps the spelling, the case and the punctuation of the lyrics.
 * @param lyrics The lyrics that the person supplies, one phrase for each line.
 */
export function parseLyrics(lyrics: string): string[][] {
  return lyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !TAG_LINE.test(line))
    .map((line) => line.split(/\s+/).filter((part) => normaliseForMatch(part) !== ''))
    .filter((words) => words.length > 0)
}

/**
 * Returns the words of the speech model grouped into phrases.
 * A new phrase starts when one of these is true:
 * - the gap from the end of the previous word is 700 ms or more,
 * - the previous word ends with `.`, `?` or `!`,
 * - the phrase has 12 words.
 *
 * No word is estimated, because the speech model gave each time.
 * @param words The transcribed words in time order.
 * @returns No phrase when there is no word.
 */
export function groupIntoPhrases(words: TimedWord[]): AlignedPhrase[] {
  const phrases: AlignedPhrase[] = []
  let current: AlignedWord[] = []
  let previous: TimedWord | undefined
  for (const word of words) {
    const startsPhrase =
      previous !== undefined &&
      (word.startMs - previous.endMs >= PHRASE_GAP_MS ||
        SENTENCE_END.test(previous.text.trim()) ||
        current.length >= MAX_WORDS_IN_PHRASE)
    if (startsPhrase) {
      phrases.push(toPhrase(current))
      current = []
    }
    // The speech model puts a space before most words.
    current.push({
      text: word.text.trim(),
      startMs: word.startMs,
      endMs: word.endMs,
      estimated: false,
    })
    previous = word
  }
  if (current.length > 0) phrases.push(toPhrase(current))
  return phrases
}

/**
 * Returns one phrase for each lyrics line, spread evenly from `startMs` to `endMs`.
 * Each phrase gets an equal share of the range. Each word gets an equal share of its
 * phrase. Every word is estimated, because no speech model gave a time.
 * @param lyrics The lyrics that the person supplies. `parseLyrics` gives the lines.
 * @param startMs The start of the target range.
 * @param endMs The end of the target range.
 * @returns No phrase when the lyrics have no word.
 */
export function spreadLyrics(lyrics: string, startMs: number, endMs: number): AlignedPhrase[] {
  const lines = parseLyrics(lyrics)
  const share = Math.max(0, endMs - startMs) / lines.length
  return lines.map((line, i) =>
    toPhrase(spreadWords(line, startMs + i * share, startMs + (i + 1) * share)),
  )
}

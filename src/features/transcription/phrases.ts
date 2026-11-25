import { MAX_SECTION_NAME } from '../../lib/sections/sectionRules.ts'
import type { SectionTag } from '../../lib/sections/tagSections.ts'
import { isLyricsWord } from '../../lib/text/normalise.ts'
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
  return readLyricsLines(lyrics).flatMap((line) => ('words' in line ? [line.words] : []))
}

/**
 * Returns the `[Name]` tags of the lyrics, in order.
 * Each tag gets the index, in the result of `parseLyrics`, of the first lyrics line after it.
 * Two tags in sequence get the same index. A tag after the last lyrics line gets the count of lines.
 * A tag with an empty name, such as `[ ]`, gives no entry.
 * @param lyrics The lyrics that the person supplies.
 */
export function parseSectionTags(lyrics: string): SectionTag[] {
  const tags: SectionTag[] = []
  let lineIndex = 0
  for (const line of readLyricsLines(lyrics)) {
    if ('words' in line) lineIndex += 1
    else if (line.tag !== '') tags.push({ name: line.tag, lineIndex })
  }
  return tags
}

/**
 * Returns the lyrics up to the end of the lyrics line with the index `count`, in the order of `parseLyrics`.
 * The run leaves out the later lines when the lyrics do not fit in the range. A tag after the last kept line goes with the later lines.
 * @param lyrics The lyrics that the person supplies.
 * @param count The count of lines with a word to keep.
 */
export function keepLyricsLines(lyrics: string, count: number): string {
  if (count <= 0) return ''
  const raw = lyrics.split(/\r?\n/)
  let kept = 0
  const end = raw.findIndex((line) => {
    const read = readLine(line)
    if (read !== null && 'words' in read) kept += 1
    return kept === count
  })
  return end < 0 ? lyrics : raw.slice(0, end + 1).join('\n')
}

/**
 * Returns the count of parts of the lyrics lines that are not a word: a part between spaces with no letter and no digit, such as `&` or an emoji.
 * The run leaves these parts out. A tag line holds no such part, because it is not sung.
 * @param lyrics The lyrics that the person supplies.
 */
export function countPartsLeftOut(lyrics: string): number {
  return lyrics.split(/\r?\n/).reduce((count, raw) => {
    const line = raw.trim()
    if (line === '' || TAG_LINE.test(line)) return count
    return count + line.split(/\s+/).filter((part) => !isLyricsWord(part)).length
  }, 0)
}

type LyricsLine = { words: string[] } | { tag: string }

/** Returns one lyrics line as a tag or as its words, or null for a line with no word. */
function readLine(raw: string): LyricsLine | null {
  const line = raw.trim()
  if (TAG_LINE.test(line))
    return { tag: line.slice(1, -1).trim().slice(0, MAX_SECTION_NAME).trimEnd() }
  const words = line.split(/\s+/).filter(isLyricsWord)
  return words.length > 0 ? { words } : null
}

/**
 * Returns each lyrics line that is a tag or that has a word.
 * `parseLyrics` and `parseSectionTags` share this function, so the line index of a tag matches the phrases.
 */
function readLyricsLines(lyrics: string): LyricsLine[] {
  return lyrics.split(/\r?\n/).flatMap((raw) => {
    const line = readLine(raw)
    return line === null ? [] : [line]
  })
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

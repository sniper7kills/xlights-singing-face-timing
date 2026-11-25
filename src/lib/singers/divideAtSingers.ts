import type { Mark } from '../../store/types.ts'
import { childrenOf } from '../marks/family.ts'
import { applyEdit } from '../marks/markEdit.ts'
import { previewSplit } from '../marks/splitRules.ts'
import type { NewId } from '../marks/words.ts'
import type { SingerPhraseRule } from '../runReport/runReport.ts'
import {
  rangesBySinger,
  SECOND_SINGER_MS,
  SECOND_SINGER_RATIO,
  type SingerRange,
  singerTimes,
} from './assignSingers.ts'

/** A part of a phrase after a division keeps this count of words or more. A chorus answer can be one held word. */
export const PART_MIN_WORDS = 1

/**
 * A part of a phrase after a division is this long or longer, in milliseconds, from the start of its first word to the end of its last word.
 * Issue #148 measured chorus answers of one or two words and 1.3 s to 2.1 s inside a phrase of the man.
 * 750 and 1000 gave the same counts. 500 made 3 more phrases with no gain. 1500 gave 5 fewer phrases on the correct voice only.
 */
export const PART_MIN_MS = 1000

/** The constants of the singer step in force, for the run report. */
export const PHRASE_RULE: SingerPhraseRule = {
  secondSingerRatio: SECOND_SINGER_RATIO,
  secondSingerMs: SECOND_SINGER_MS,
  partMinWords: PART_MIN_WORDS,
  partMinMs: PART_MIN_MS,
}

/** A run of words with one singer. `singer` is null when no singer range touches the words. */
type Part = { singer: number | null; words: Mark[] }

/** Returns the singer with the most time in the word, or null when no singer range touches it. */
function wordSinger(word: Mark, bySinger: ReadonlyMap<number, SingerRange[]>): number | null {
  const times = singerTimes(word, bySinger).sort((a, b) => b.ms - a.ms || a.singer - b.singer)
  return times[0]?.singer ?? null
}

/** Returns true when the part has the words and the time to be a phrase of its own. */
function longEnough(part: Part): boolean {
  const first = part.words[0]
  const last = part.words.at(-1)
  if (first === undefined || last === undefined) return false
  return part.words.length >= PART_MIN_WORDS && last.endMs - first.startMs >= PART_MIN_MS
}

/** Returns the parts with each pair of neighbours with the same singer joined. A word with no singer joins its neighbour. */
function joined(parts: readonly Part[]): Part[] {
  const result: Part[] = []
  for (const part of parts) {
    const last = result.at(-1)
    if (last !== undefined && (part.singer === null || part.singer === last.singer))
      last.words.push(...part.words)
    else if (last !== undefined && last.singer === null)
      result[result.length - 1] = { singer: part.singer, words: [...last.words, ...part.words] }
    else result.push({ singer: part.singer, words: [...part.words] })
  }
  return result
}

/** Returns the index of the shortest part that is not long enough, or -1 when each part is long enough. */
function shortestShortPart(parts: readonly Part[]): number {
  let found = -1
  let foundMs = Infinity
  parts.forEach((part, index) => {
    const ms = (part.words.at(-1)?.endMs ?? 0) - (part.words[0]?.startMs ?? 0)
    if (!longEnough(part) && ms < foundMs) {
      found = index
      foundMs = ms
    }
  })
  return found
}

/**
 * Returns the word parts of a phrase, one for each singer change that holds.
 * A part that is too short takes the singer of its longer neighbour, so its words join that neighbour.
 */
function singerParts(words: readonly Mark[], bySinger: ReadonlyMap<number, SingerRange[]>): Part[] {
  let parts = joined(words.map((word) => ({ singer: wordSinger(word, bySinger), words: [word] })))
  // Each join removes one part, so the loop ends after fewer rounds than the count of words.
  for (let index = shortestShortPart(parts); parts.length > 1 && index >= 0;) {
    const before = parts[index - 1]
    const after = parts[index + 1]
    const target = longerPart(before, after)
    parts = joined(parts.map((part, at) => (at === index ? { ...part, singer: target } : part)))
    index = shortestShortPart(parts)
  }
  return parts
}

/** Returns the singer of the neighbour with more time. */
function longerPart(before: Part | undefined, after: Part | undefined): number | null {
  const ms = (part: Part | undefined) =>
    part === undefined ? -1 : (part.words.at(-1)?.endMs ?? 0) - (part.words[0]?.startMs ?? 0)
  return (ms(before) >= ms(after) ? before : after)?.singer ?? null
}

/**
 * Returns the times at which the singer changes inside a phrase: the start of the first word of each new part.
 *
 * The rules:
 * - Each word gets the singer with the most time in it.
 * - A run of words with one singer is a part. A word with no singer joins the part before it.
 * - A part with fewer than `PART_MIN_WORDS` words, or shorter than `PART_MIN_MS`, joins its longer neighbour.
 * - A change inside a word never divides the word, because each time is the start of a word.
 * @param words The words of the phrase, in order of time.
 * @param segments The singer ranges, with song times.
 */
export function singerChangeTimes(
  words: readonly Mark[],
  segments: readonly SingerRange[],
): number[] {
  const parts = singerParts(words, rangesBySinger(segments))
  return parts.slice(1).map((part) => part.words[0]?.startMs ?? 0)
}

/** Returns the label of a phrase: the labels of its words with one space between them. */
function wordText(marks: readonly Mark[], phraseId: string): string {
  return childrenOf(marks, phraseId)
    .toSorted((a, b) => a.startMs - b.startMs)
    .map((word) => word.label)
    .join(' ')
}

/**
 * Returns the marks with each phrase divided where its singer changes, and the ids of all phrases after the division.
 *
 * The rules:
 * - `singerChangeTimes` gives the times of the division.
 * - The first part keeps the id of the phrase. Each later part is a new phrase with an id from `newId`.
 * - Each word keeps its id and its times, and goes to the part that holds it. Each phoneme stays with its word.
 * - The label of each part of a divided phrase is the labels of its words. A phrase that is not divided keeps its label.
 * @param marks The marks of the song.
 * @param phraseIds The phrases to divide. An unknown id stays in the result and changes nothing.
 * @param segments The singer ranges, with song times.
 * @param frameMs The frame size of the song. Each word time is a multiple of it, so each division time is too.
 * @param newId Gives the id of each new phrase.
 */
export function divideAtSingers(
  marks: readonly Mark[],
  phraseIds: readonly string[],
  segments: readonly SingerRange[],
  frameMs: number,
  newId: NewId,
): { marks: Mark[]; phraseIds: string[]; dividedCount: number } {
  let result = [...marks]
  const ids: string[] = []
  let dividedCount = 0
  for (const id of phraseIds) {
    const words = childrenOf(result, id).toSorted((a, b) => a.startMs - b.startMs)
    const parts = [id]
    // From the last time to the first, so the part before each time keeps the id of the phrase.
    for (const atMs of singerChangeTimes(words, segments).reverse()) {
      const edit = previewSplit(result, id, atMs, frameMs, newId)
      result = applyEdit(result, edit)
      parts.splice(1, 0, ...(edit.added ?? []).map((mark) => mark.id))
    }
    if (parts.length > 1) {
      dividedCount += 1
      const labels = new Map(parts.map((part) => [part, wordText(result, part)]))
      result = result.map((mark) => {
        const label = labels.get(mark.id)
        return label === undefined ? mark : { ...mark, label }
      })
    }
    ids.push(...parts)
  }
  return { marks: result, phraseIds: ids, dividedCount }
}

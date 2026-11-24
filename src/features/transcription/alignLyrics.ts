import { matchWords } from '../../lib/text/matchWords.ts'
import { normaliseForMatch } from '../../lib/text/normalise.ts'
import { parseLyrics, spreadLyrics, spreadWords, toPhrase } from './phrases.ts'
import type { AlignResult, AlignedWord, TimedWord } from './types.ts'

/**
 * Returns the lyrics as phrases, with the times of the transcribed words, and the
 * share of lyrics words that matched.
 *
 * The function compares the two word lists as sequences, without case and without
 * punctuation. Each lyrics line becomes one phrase. The rules are:
 * - A lyrics word that matches a transcribed word takes its time and keeps the
 *   lyrics spelling.
 * - A transcribed word with no lyrics match is discarded.
 * - Unmatched lyrics words between two matched words share the time between them
 *   evenly, and are estimated.
 * - Unmatched lyrics words before the first matched word share the time from the
 *   start of the first transcribed word to the start of the first matched word
 *   evenly, and are estimated.
 * - Unmatched lyrics words after the last matched word share the time from the end
 *   of the last matched word to the end of the last transcribed word evenly, and are
 *   estimated.
 * - If no word matches, the phrases spread evenly from the start of the first
 *   transcribed word to the end of the last transcribed word, as `spreadLyrics` does.
 *
 * If a time span for unmatched words has no length, those words have no length. The
 * caller extends each word to one frame size.
 * @param transcribed The words of the speech model in time order.
 * @param lyrics The lyrics that the person supplies, one phrase for each line.
 * @returns A `matchRatio` of 0 when the lyrics have no word.
 */
export function alignLyrics(transcribed: TimedWord[], lyrics: string): AlignResult {
  const lines = parseLyrics(lyrics)
  const lyricsWords = lines.flat()
  const matches = matchWords(
    transcribed.map((word) => normaliseForMatch(word.text)),
    lyricsWords.map(normaliseForMatch),
  )
  const matchedCount = matches.filter((index) => index >= 0).length
  const matchRatio = lyricsWords.length === 0 ? 0 : matchedCount / lyricsWords.length

  const rangeStartMs = transcribed[0]?.startMs ?? 0
  const rangeEndMs = transcribed.at(-1)?.endMs ?? 0
  if (matchedCount === 0) {
    return { phrases: spreadLyrics(lyrics, rangeStartMs, rangeEndMs), matchRatio }
  }

  const words: AlignedWord[] = []
  let pending: string[] = []
  // The end of the previous matched word, or the start of the first transcribed word.
  let spanStartMs = rangeStartMs
  const placePending = (spanEndMs: number): void => {
    words.push(...spreadWords(pending, spanStartMs, spanEndMs))
    pending = []
  }
  lyricsWords.forEach((text, i) => {
    const match = transcribed[matches[i] ?? -1]
    if (match === undefined) {
      pending.push(text)
      return
    }
    placePending(match.startMs)
    words.push({ text, startMs: match.startMs, endMs: match.endMs, estimated: false })
    spanStartMs = match.endMs
  })
  placePending(rangeEndMs)

  let next = 0
  const phrases = lines.map((line) => {
    const phraseWords = words.slice(next, next + line.length)
    next += line.length
    return toPhrase(phraseWords)
  })
  return { phrases, matchRatio }
}

import { snap } from '../../lib/time/snap.ts'
import type { Mark } from '../../store/types.ts'
import type { AlignedPhrase } from './types.ts'

// The label rules of docs/specs/features/02-transcription.md remove these characters.
const LABEL_PUNCTUATION = /[.,!?;:"()[\]]/g

// The label rules keep an apostrophe or a hyphen only inside a word, as in "don't" and "well-known".
const EDGE_MARKS = /^['-]+|['-]+$/g

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/**
 * Returns the word label: the text with the listed punctuation removed, in the letter case of the text.
 * Returns an empty string when no letter or digit stays.
 */
export function wordLabel(text: string): string {
  const label = text.replace(LABEL_PUNCTUATION, '').trim().replace(EDGE_MARKS, '')
  return LETTER_OR_DIGIT.test(label) ? label : ''
}

type TimedLabel = { label: string; startMs: number; endMs: number; estimated: boolean }

/**
 * Returns the words with times that are multiples of the frame size, one frame size long or more, with no overlap.
 * A word that overlaps the next word ends where the next word starts.
 * A word that is shorter than one frame size grows to one frame size, and the next word starts after it.
 */
function fitWords(words: TimedLabel[], frameMs: number): TimedLabel[] {
  const fitted: TimedLabel[] = []
  let previousEndMs = Number.NEGATIVE_INFINITY
  words.forEach((word, i) => {
    const next = words[i + 1]
    const startMs = Math.max(snap(word.startMs, frameMs), previousEndMs)
    const nextStartMs = next === undefined ? Number.POSITIVE_INFINITY : snap(next.startMs, frameMs)
    const endMs = Math.max(Math.min(snap(word.endMs, frameMs), nextStartMs), startMs + frameMs)
    fitted.push({ ...word, startMs, endMs })
    previousEndMs = endMs
  })
  return fitted
}

/**
 * Returns the phrase marks and the word marks of a transcribe run for one voice.
 * Each phrase mark comes before its word marks. Each mark has a new UUID.
 * A word with no letter or digit after the label rules gives no mark, and a phrase with no word gives no mark.
 * @param phrases The phrases from `groupIntoPhrases`, `alignLyrics` or `spreadLyrics`, in time order.
 * @param voiceId The voice that receives the marks.
 * @param frameMs The frame size of the song. Every time of a mark is a multiple of it.
 */
export function buildMarks(phrases: AlignedPhrase[], voiceId: string, frameMs: number): Mark[] {
  const kept = phrases
    .map((phrase) => ({
      label: phrase.text.trim(),
      words: phrase.words
        .map((word) => ({ ...word, label: wordLabel(word.text) }))
        .filter((word) => word.label !== ''),
    }))
    .filter((phrase) => phrase.words.length > 0)
  const fitted = fitWords(
    kept.flatMap((phrase) => phrase.words),
    frameMs,
  )

  const marks: Mark[] = []
  let index = 0
  for (const phrase of kept) {
    const words = fitted.slice(index, index + phrase.words.length)
    index += phrase.words.length
    const phraseId = crypto.randomUUID()
    marks.push({
      id: phraseId,
      voiceId,
      layer: 'phrase',
      label: phrase.label,
      startMs: words[0]?.startMs ?? 0,
      endMs: words.at(-1)?.endMs ?? 0,
      parentId: null,
      edited: false,
    })
    for (const word of words)
      marks.push({
        id: crypto.randomUUID(),
        voiceId,
        layer: 'word',
        label: word.label,
        startMs: word.startMs,
        endMs: word.endMs,
        parentId: phraseId,
        edited: false,
        estimated: word.estimated,
      })
  }
  return marks
}

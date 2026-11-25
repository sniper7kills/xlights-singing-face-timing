import { fitWords } from '../../lib/time/fitWords.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
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

/**
 * Returns the phrase marks and the word marks of a transcribe run for one voice.
 * Each phrase mark comes before its word marks. Each mark has a new UUID.
 * A word with no letter or digit after the label rules gives no mark, and a phrase with no word gives no mark.
 * A word that `fitWords` drops, because the range is too short, gives no mark.
 * `phraseIds` has one entry for each input phrase: the id of its phrase mark, or null when the phrase gave no mark.
 * @param phrases The phrases from `groupIntoPhrases`, `alignLyrics` or `spreadLyrics`, in time order.
 * @param voiceId The voice that receives the marks.
 * @param frameMs The frame size of the song. Every time of a mark is a multiple of it.
 * @param range The target range of the run. Every mark lies fully inside it.
 */
export function buildMarks(
  phrases: AlignedPhrase[],
  voiceId: string,
  frameMs: number,
  range: TimeRange,
): { marks: Mark[]; phraseIds: (string | null)[] } {
  const labelled = phrases.map((phrase) => ({
    label: phrase.text.trim(),
    words: phrase.words
      .map((word) => ({ ...word, label: wordLabel(word.text) }))
      .filter((word) => word.label !== ''),
  }))
  const fitted = fitWords(
    labelled.flatMap((phrase) => phrase.words),
    frameMs,
    range,
  )

  const marks: Mark[] = []
  const phraseIds: (string | null)[] = []
  let index = 0
  for (const phrase of labelled) {
    const words = fitted.slice(index, index + phrase.words.length)
    index += phrase.words.length
    if (words.length === 0) {
      phraseIds.push(null)
      continue
    }
    const phraseId = crypto.randomUUID()
    phraseIds.push(phraseId)
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
  return { marks, phraseIds }
}

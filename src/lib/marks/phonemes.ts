import type { Mark } from '../../store/types.ts'
import { PHONEME_LABELS, type PhonemeLabel } from '../dictionary/cmuSymbols.ts'
import { spread } from '../dictionary/spread.ts'
import { followWord } from '../time/followWord.ts'
import { childrenOf } from './family.ts'
import type { MarkEdit } from './markEdit.ts'

const PHONEME_LABEL_SET: ReadonlySet<string> = new Set(PHONEME_LABELS)

function isPhonemeLabel(label: string): label is PhonemeLabel {
  return PHONEME_LABEL_SET.has(label)
}

/**
 * Returns the phonemes of an unedited word spread again over the new word, with the labels that the word has now.
 * The spread drops phonemes when the word has fewer frames than phonemes, so the word can get as short as one frame size.
 * The kept phonemes keep their ids, and the edit removes the dropped phonemes.
 */
function spreadAgain(phonemes: readonly Mark[], word: Mark, frameMs: number): MarkEdit {
  const placed = spread(
    phonemes.map((phoneme) => phoneme.label).filter(isPhonemeLabel),
    word.startMs,
    word.endMs,
    frameMs,
  )
  return {
    changed: phonemes
      .slice(0, placed.length)
      .map((phoneme, index) => ({ ...phoneme, ...placed[index] })),
    removedIds: phonemes.slice(placed.length).map((phoneme) => phoneme.id),
  }
}

/**
 * Returns the edit of the phonemes of a word after the length of the word changes.
 *
 * The rules:
 * - An edited word keeps its phonemes. `followWord` scales them to the new word.
 * - An unedited word gets its phoneme labels spread again over the new word.
 *   The store action replaces this result with a new break down when the dictionary is loaded.
 *
 * @param marks The marks before the change.
 * @param before The word before the change.
 * @param after The word after the change. Its times are multiples of the frame size.
 * @param frameMs The frame size of the song.
 */
export function phonemesAfterResize(
  marks: readonly Mark[],
  before: Mark,
  after: Mark,
  frameMs: number,
): MarkEdit {
  const phonemes = childrenOf(marks, before.id)
  if (after.edited) return { changed: followWord(phonemes, before, after, frameMs), removedIds: [] }
  return spreadAgain(phonemes, after, frameMs)
}

import type { Mark } from '../../store/types.ts'
import { snap } from '../time/snap.ts'
import { childrenOf, findMark } from './family.ts'
import { noEdit, type MarkEdit } from './markEdit.ts'
import { parentWordEdited } from './moveRules.ts'
import { divideLabel, guessPhonemes, type NewId } from './words.ts'

/**
 * Returns the time of the phrase split: the time, or the nearest edge of the word that holds it.
 * A word stays whole in one phrase, so a split inside a word moves to the nearer word edge.
 * At equal distance, the split moves to the word start.
 */
function phraseSplitTime(marks: readonly Mark[], phrase: Mark, atMs: number): number {
  const word = childrenOf(marks, phrase.id).find((item) => item.startMs < atMs && atMs < item.endMs)
  if (!word) return atMs
  return atMs - word.startMs <= word.endMs - atMs ? word.startMs : word.endMs
}

/**
 * Returns the legal time of a split of the mark, or undefined when the split is not possible.
 * The time snaps to the frame size. A phrase split inside a word moves to the nearer word edge.
 * Both parts must be one frame size or longer, so a time outside the mark gives undefined.
 * @param marks The marks of the song.
 * @param mark The mark to split.
 * @param atMs The time of the split, usually the play cursor.
 * @param frameMs The frame size of the song.
 */
export function splitTime(
  marks: readonly Mark[],
  mark: Mark,
  atMs: number,
  frameMs: number,
): number | undefined {
  const snapped = snap(atMs, frameMs)
  const at = mark.layer === 'phrase' ? phraseSplitTime(marks, mark, snapped) : snapped
  return at - mark.startMs >= frameMs && mark.endMs - at >= frameMs ? at : undefined
}

function splitPhoneme(marks: readonly Mark[], phoneme: Mark, at: number, newId: NewId): MarkEdit {
  return {
    changed: [{ ...phoneme, endMs: at, edited: true }, ...parentWordEdited(marks, phoneme)],
    removedIds: [],
    added: [{ ...phoneme, id: newId(), startMs: at, edited: true }],
  }
}

/**
 * Returns the phonemes of a split word: each phoneme goes to the part that holds it.
 * A phoneme that crosses the split time becomes two phonemes with the same label.
 */
function dividePhonemes(
  phonemes: readonly Mark[],
  at: number,
  secondId: string,
  newId: NewId,
): MarkEdit {
  const changed: Mark[] = []
  const added: Mark[] = []
  for (const phoneme of phonemes) {
    if (phoneme.startMs >= at) changed.push({ ...phoneme, parentId: secondId })
    else if (phoneme.endMs > at) {
      changed.push({ ...phoneme, endMs: at })
      added.push({ ...phoneme, id: newId(), startMs: at, parentId: secondId })
    }
  }
  return { changed, removedIds: [], added }
}

function splitWord(
  marks: readonly Mark[],
  word: Mark,
  at: number,
  frameMs: number,
  newId: NewId,
): MarkEdit {
  const [firstLabel, secondLabel] = divideLabel(
    word.label,
    (at - word.startMs) / (word.endMs - word.startMs),
  )
  const first = { ...word, label: firstLabel, endMs: at }
  const second = { ...word, id: newId(), label: secondLabel, startMs: at }
  const phonemes = childrenOf(marks, word.id)
  const divided = dividePhonemes(phonemes, at, second.id, newId)
  // A deleted phoneme can leave a gap, so a part can hold no phoneme. The guess gives it phonemes.
  const guessed = [
    ...(phonemes.some((item) => item.startMs < at) ? [] : guessPhonemes(first, frameMs, newId)),
    ...(phonemes.some((item) => item.endMs > at) ? [] : guessPhonemes(second, frameMs, newId)),
  ]
  return {
    changed: [first, ...divided.changed],
    removedIds: [],
    added: [second, ...(divided.added ?? []), ...guessed],
    breakDownIds: word.edited ? [] : [first.id, second.id],
  }
}

/** Returns the labels of the two phrases: the words of the label when they match the word marks, else the characters. */
function phraseLabels(phrase: Mark, words: readonly Mark[], firstCount: number): [string, string] {
  const tokens = phrase.label.trim().split(/\s+/)
  if (tokens.length === words.length && firstCount > 0 && firstCount < words.length)
    return [tokens.slice(0, firstCount).join(' '), tokens.slice(firstCount).join(' ')]
  return divideLabel(phrase.label, 0.5)
}

function splitPhrase(marks: readonly Mark[], phrase: Mark, at: number, newId: NewId): MarkEdit {
  const words = childrenOf(marks, phrase.id)
  const later = words.filter((word) => word.startMs >= at)
  const [firstLabel, secondLabel] = phraseLabels(phrase, words, words.length - later.length)
  const second = { ...phrase, id: newId(), label: secondLabel, startMs: at }
  return {
    changed: [
      { ...phrase, label: firstLabel, endMs: at },
      ...later.map((word) => ({ ...word, parentId: second.id })),
    ],
    removedIds: [],
    added: [second],
  }
}

/**
 * Returns the legal result of a split of the mark at `atMs`. The first part keeps the id of the mark.
 *
 * The rules:
 * - The time snaps to the frame size, and both parts are one frame size or longer. Else the edit is empty.
 * - A word becomes two words. The label divides at the character position nearest to the split time, in proportion.
 *   Each phoneme goes to the part that holds it, and a phoneme across the split time becomes two phonemes.
 *   An unedited word gets a new break down of both parts in the store. An edited word keeps its divided phonemes.
 * - A phrase becomes two phrases, and each phrase keeps the words that lie in it.
 *   A split time inside a word moves to the nearer edge of that word.
 *   If the phrase label has one word for each word mark, the label divides between the words. Else it divides at the middle character.
 * - A phoneme becomes two phonemes with the same label. Both phonemes and the word get `edited`.
 *
 * @param marks The marks of the song.
 * @param id The id of the mark to split. An unknown id gives an empty edit.
 * @param atMs The time of the split, usually the play cursor.
 * @param frameMs The frame size of the song.
 * @param newId Gives the id of each new mark.
 */
export function previewSplit(
  marks: readonly Mark[],
  id: string,
  atMs: number,
  frameMs: number,
  newId: NewId,
): MarkEdit {
  const mark = findMark(marks, id)
  const at = mark && splitTime(marks, mark, atMs, frameMs)
  if (!mark || at === undefined) return noEdit()
  if (mark.layer === 'phoneme') return splitPhoneme(marks, mark, at, newId)
  if (mark.layer === 'word') return splitWord(marks, mark, at, frameMs, newId)
  return splitPhrase(marks, mark, at, newId)
}

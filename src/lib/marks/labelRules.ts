import type { Mark } from '../../store/types.ts'
import { PHONEME_LABELS } from '../dictionary/cmuSymbols.ts'
import { matchWords } from '../text/matchWords.ts'
import { normaliseForMatch } from '../text/normalise.ts'
import { fitWords } from '../time/fitWords.ts'
import { childrenOf, findMark } from './family.ts'
import { noEdit, type MarkEdit } from './markEdit.ts'
import { parentWordEdited } from './moveRules.ts'
import { phonemesAfterResize } from './phonemes.ts'
import { guessPhonemes, type NewId } from './words.ts'

/** Returns the words of a phrase label: the parts between spaces that hold a letter or a digit. */
function labelWords(label: string): string[] {
  return label
    .trim()
    .split(/\s+/)
    .filter((part) => normaliseForMatch(part) !== '')
}

/**
 * Returns true when a new label of the phrase changes its words, so the editor asks for a confirm first.
 * The comparison ignores case and punctuation: `Silent night!` has the same words as `silent night`.
 * @param marks The marks of the song.
 * @param phraseId The id of the phrase.
 * @param label The new label.
 * @returns False for an unknown id, a mark that is no phrase, and a label that is empty after a trim.
 */
export function phraseWordsChange(
  marks: readonly Mark[],
  phraseId: string,
  label: string,
): boolean {
  const phrase = findMark(marks, phraseId)
  if (phrase?.layer !== 'phrase' || label.trim() === '') return false
  const before = childrenOf(marks, phrase.id).map((word) => normaliseForMatch(word.label))
  const after = labelWords(label).map(normaliseForMatch)
  return before.length !== after.length || before.some((word, index) => word !== after[index])
}

/**
 * Returns the legal result of a new phoneme label. The phoneme and its word get `edited`.
 * @param marks The marks of the song.
 * @param id The id of the phoneme. An unknown id or a mark that is no phoneme gives an empty edit.
 * @param label One of the ten phoneme labels. Any other label, or the current label, gives an empty edit.
 */
export function previewPhonemeLabel(marks: readonly Mark[], id: string, label: string): MarkEdit {
  const phoneme = findMark(marks, id)
  const valid = (PHONEME_LABELS as readonly string[]).includes(label)
  if (phoneme?.layer !== 'phoneme' || !valid || phoneme.label === label) return noEdit()
  return {
    changed: [{ ...phoneme, label, edited: true }, ...parentWordEdited(marks, phoneme)],
    removedIds: [],
  }
}

function relabelWord(
  marks: readonly Mark[],
  word: Mark,
  label: string,
  frameMs: number,
  newId: NewId,
): MarkEdit {
  const relabelled = { ...word, label, edited: false }
  // A word with a new label has no break down yet, so its old `unknown` state is not true any more.
  delete relabelled.unknown
  return {
    changed: [relabelled],
    removedIds: childrenOf(marks, word.id).map((phoneme) => phoneme.id),
    added: guessPhonemes(relabelled, frameMs, newId),
    breakDownIds: [word.id],
  }
}

/** One word of the new phrase label, with its time and the old word that matches it. */
type PlannedWord = { text: string; startMs: number; endMs: number; old: Mark | undefined }

/**
 * Returns the new words of the phrase with their times, before the fit to the frame size.
 * A word that matches an old word takes its time. The other words share the free time between matched words evenly.
 */
function planWords(old: readonly Mark[], texts: readonly string[], phrase: Mark): PlannedWord[] {
  const matches = matchWords(
    old.map((word) => normaliseForMatch(word.label)),
    texts.map(normaliseForMatch),
  )
  const planned: PlannedWord[] = []
  let pending: string[] = []
  let spanStartMs = phrase.startMs
  const placePending = (spanEndMs: number) => {
    const share = (spanEndMs - spanStartMs) / Math.max(1, pending.length)
    pending.forEach((text, index) => {
      const startMs = spanStartMs + index * share
      planned.push({ text, startMs, endMs: startMs + share, old: undefined })
    })
    pending = []
  }
  texts.forEach((text, index) => {
    const match = old[matches[index] ?? -1]
    if (!match) {
      pending.push(text)
      return
    }
    placePending(match.startMs)
    planned.push({ text, startMs: match.startMs, endMs: match.endMs, old: match })
    spanStartMs = match.endMs
  })
  placePending(phrase.endMs)
  return planned
}

/** Returns the edit of a matched word that keeps its label and gets a new time from the fit. */
function moveMatchedWord(
  marks: readonly Mark[],
  old: Mark,
  item: PlannedWord,
  frameMs: number,
): MarkEdit {
  if (item.startMs === old.startMs && item.endMs === old.endMs) return noEdit()
  const phonemeCount = childrenOf(marks, old.id).length
  // An edited word needs one frame size for each phoneme. A shorter word spreads its phonemes again.
  const fits = item.endMs - item.startMs >= phonemeCount * frameMs
  const after = { ...old, startMs: item.startMs, endMs: item.endMs, edited: old.edited && fits }
  const phonemes = phonemesAfterResize(marks, old, after, frameMs)
  return { ...phonemes, changed: [after, ...phonemes.changed] }
}

function placeWord(
  marks: readonly Mark[],
  phrase: Mark,
  item: PlannedWord,
  frameMs: number,
  newId: NewId,
): MarkEdit {
  const { old } = item
  if (old && old.label === item.text) return moveMatchedWord(marks, old, item, frameMs)
  if (old)
    return relabelWord(
      marks,
      { ...old, startMs: item.startMs, endMs: item.endMs },
      item.text,
      frameMs,
      newId,
    )
  const word: Mark = {
    id: newId(),
    voiceId: phrase.voiceId,
    layer: 'word',
    label: item.text,
    startMs: item.startMs,
    endMs: item.endMs,
    parentId: phrase.id,
    edited: false,
    // No word of the speech model gave the time of a new word.
    estimated: true,
  }
  return {
    changed: [],
    removedIds: [],
    added: [word, ...guessPhonemes(word, frameMs, newId)],
    breakDownIds: [word.id],
  }
}

function realignPhrase(
  marks: readonly Mark[],
  phrase: Mark,
  label: string,
  frameMs: number,
  newId: NewId,
): MarkEdit {
  const old = childrenOf(marks, phrase.id)
  const fitted = fitWords(planWords(old, labelWords(label), phrase), frameMs, phrase)
  const kept = new Set(fitted.map((item) => item.old?.id))
  const edits = fitted.map((item) => placeWord(marks, phrase, item, frameMs, newId))
  return {
    changed: [{ ...phrase, label }, ...edits.flatMap((edit) => edit.changed)],
    removedIds: [
      ...old
        .filter((word) => !kept.has(word.id))
        .flatMap((word) => [word.id, ...childrenOf(marks, word.id).map((phoneme) => phoneme.id)]),
      ...edits.flatMap((edit) => edit.removedIds),
    ],
    added: edits.flatMap((edit) => edit.added ?? []),
    breakDownIds: edits.flatMap((edit) => edit.breakDownIds ?? []),
  }
}

/**
 * Returns the legal result of a new label of a phrase, a word or a phoneme.
 *
 * The rules:
 * - A label that is empty after a trim, or the same label, gives an empty edit. The mark keeps its old label.
 * - A new word label clears `edited` and replaces the phonemes. The old phonemes of the person do not fit the new word.
 *   The store breaks down the word.
 * - A new phrase label with the same words changes only the label. See `phraseWordsChange`.
 * - A new phrase label with other words aligns the new words with the old words, the same as the lyrics align:
 *   - A new word that matches an old word takes its time and its id. A changed spelling gets a new break down.
 *   - The other new words share the free time between matched words evenly, are estimated and get a break down.
 *   - The old words with no match go, with their phonemes.
 *   - The words then fit to the frame size inside the phrase. If the phrase has fewer frames than words, the last words go.
 * - A phoneme label follows `previewPhonemeLabel`.
 *
 * @param marks The marks of the song.
 * @param id The id of the mark. An unknown id gives an empty edit.
 * @param label The new label.
 * @param frameMs The frame size of the song.
 * @param newId Gives the id of each new mark.
 */
export function previewLabel(
  marks: readonly Mark[],
  id: string,
  label: string,
  frameMs: number,
  newId: NewId,
): MarkEdit {
  const mark = findMark(marks, id)
  const text = label.trim()
  if (!mark || text === '') return noEdit()
  if (mark.layer === 'phoneme') return previewPhonemeLabel(marks, id, text)
  if (text === mark.label) return noEdit()
  if (mark.layer === 'word') return relabelWord(marks, mark, text, frameMs, newId)
  if (!phraseWordsChange(marks, id, text))
    return { changed: [{ ...mark, label: text }], removedIds: [] }
  return realignPhrase(marks, mark, text, frameMs, newId)
}

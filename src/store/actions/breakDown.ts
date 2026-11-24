import { loadDictionary } from '../../features/phoneme-breakdown/loadDictionary.ts'
import { lookup } from '../../lib/dictionary/lookup.ts'
import { normaliseWord } from '../../lib/dictionary/normaliseWord.ts'
import { spread } from '../../lib/dictionary/spread.ts'
import { toPhonemeLabels } from '../../lib/dictionary/toPhonemeLabels.ts'
import type { Dictionary } from '../../lib/dictionary/types.ts'
import { customDictionary } from '../customEntries.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'

/** The two tables that a break down reads. */
export type Dictionaries = {
  /** The in-memory copy of the custom dictionary. */
  custom: Dictionary
  /** The dictionary from `public/dict/cmudict.json`. */
  cmu: Dictionary
}

/**
 * Returns the custom dictionary and the dictionary.
 * The first call of a visit requests the dictionary file. Later calls use the same file.
 * Rejects with DictionaryLoadError when the dictionary file does not load.
 */
export async function loadDictionaries(): Promise<Dictionaries> {
  const [custom, cmu] = await Promise.all([customDictionary(), loadDictionary()])
  return { custom, cmu }
}

/**
 * Returns the word with `unknown` set, and its phoneme marks.
 * The phonemes fill the word with no gap, and each phoneme time is a multiple of the frame size.
 * The app writes no `rest` phoneme.
 * @param word The word mark.
 * @param dictionaries The custom dictionary and the dictionary.
 * @param frameMs The frame size of the song.
 */
export function phonemesForWord(
  word: Mark,
  dictionaries: Dictionaries,
  frameMs: number,
): { word: Mark; phonemes: Mark[] } {
  const { symbols, source } = lookup(word.label, dictionaries.custom, dictionaries.cmu)
  const phonemes = spread(toPhonemeLabels(symbols), word.startMs, word.endMs, frameMs).map(
    (phoneme): Mark => ({
      id: crypto.randomUUID(),
      voiceId: word.voiceId,
      layer: 'phoneme',
      label: phoneme.label,
      startMs: phoneme.startMs,
      endMs: phoneme.endMs,
      parentId: word.id,
      edited: false,
    }),
  )
  return { word: { ...word, unknown: source === 'guess' }, phonemes }
}

/**
 * Returns the marks with each target word broken down: its old phonemes replaced by new phonemes, and `unknown` set.
 * A target is a word mark that is not edited and that `isTarget` accepts. An edited word keeps its phonemes.
 * Returns the input array when no word is a target.
 * @param marks The marks of a song, or the new marks of a transcribe run.
 * @param isTarget Selects the words to break down.
 * @param dictionaries The custom dictionary and the dictionary.
 * @param frameMs The frame size of the song.
 */
export function breakDownMarks(
  marks: readonly Mark[],
  isTarget: (word: Mark) => boolean,
  dictionaries: Dictionaries,
  frameMs: number,
): readonly Mark[] {
  const results = marks
    .filter((mark) => mark.layer === 'word' && !mark.edited && isTarget(mark))
    .map((word) => phonemesForWord(word, dictionaries, frameMs))
  if (results.length === 0) return marks
  const words = new Map(results.map(({ word }) => [word.id, word]))
  const kept = marks.filter(
    (mark) => !(mark.layer === 'phoneme' && mark.parentId !== null && words.has(mark.parentId)),
  )
  return [
    ...kept.map((mark) => words.get(mark.id) ?? mark),
    ...results.flatMap(({ phonemes }) => phonemes),
  ]
}

async function applyBreakDown(isTarget: (word: Mark) => boolean): Promise<void> {
  const dictionaries = await loadDictionaries()
  useSongStore.getState().apply((content): SongContent => {
    const marks = breakDownMarks(content.marks, isTarget, dictionaries, content.song.frameMs)
    return marks === content.marks ? content : { ...content, marks: [...marks] }
  })
}

/**
 * Breaks down the words of the open song again, as one undo step. This is "Break down again".
 * An edited word keeps its phonemes. An id of a mark that is not a word changes nothing.
 * @param wordIds The ids of the word marks.
 * Rejects with DictionaryLoadError when the dictionary file does not load. The words then keep their phonemes.
 */
export function breakDownWords(wordIds: readonly string[]): Promise<void> {
  const ids = new Set(wordIds)
  return applyBreakDown((word) => ids.has(word.id))
}

/**
 * Breaks down again each unedited word of the open song that the custom entries match, in every voice, as one undo step.
 * Call it after a custom entry changes or goes, with the in-memory copy already refreshed.
 * The words of a song that is not open do not change. They read the entry at their next break down.
 * A label that ends in `IN'` also matches the entry with `ING`, the same as `lookup`.
 * @param words The words of the changed entries, in upper case.
 * Rejects with DictionaryLoadError when the dictionary file does not load. The words then keep their phonemes.
 */
export async function rebreakForEntries(words: readonly string[]): Promise<void> {
  const entries = new Set(words)
  const matches = (word: Mark) => {
    const key = normaliseWord(word.label)
    return entries.has(key) || (key.endsWith("IN'") && entries.has(`${key.slice(0, -1)}G`))
  }
  const marks = useSongStore.getState().current?.marks ?? []
  // No match needs no dictionary, so an entry change before the first break down requests no file.
  if (!marks.some((mark) => mark.layer === 'word' && !mark.edited && matches(mark))) return
  await applyBreakDown(matches)
}

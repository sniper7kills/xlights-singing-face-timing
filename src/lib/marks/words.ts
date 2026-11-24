import type { Mark } from '../../store/types.ts'
import { lookup } from '../dictionary/lookup.ts'
import { spread } from '../dictionary/spread.ts'
import { toPhonemeLabels } from '../dictionary/toPhonemeLabels.ts'
import { clamp } from './limits.ts'

/** Returns a new unique mark id. The store passes `crypto.randomUUID`, and a test passes a counter. */
export type NewId = () => string

/**
 * Returns phoneme marks for the word from the rule-based guess, which fill the word with no gap.
 * A rule calls it for a new or changed word, so that the word has phonemes when the dictionary is not in memory.
 * The store action replaces them with a break down when the dictionary is in memory.
 * @param word The word mark. Its times are multiples of the frame size.
 * @param frameMs The frame size of the song.
 * @param newId Gives the id of each phoneme.
 */
export function guessPhonemes(word: Mark, frameMs: number, newId: NewId): Mark[] {
  // Empty tables make `lookup` use the guess, which gives one symbol or more for every label.
  const { symbols } = lookup(word.label, {}, {})
  return spread(toPhonemeLabels(symbols), word.startMs, word.endMs, frameMs).map(
    (phoneme): Mark => ({
      id: newId(),
      voiceId: word.voiceId,
      layer: 'phoneme',
      label: phoneme.label,
      startMs: phoneme.startMs,
      endMs: phoneme.endMs,
      parentId: word.id,
      edited: false,
    }),
  )
}

/**
 * Returns the label in two parts, divided at the character position nearest to `fraction` of its length.
 * Each part keeps one character or more and has no space at its ends.
 * A label of one character gives the same label for both parts.
 * @param label The label to divide.
 * @param fraction The position of the division, from 0 (the start) to 1 (the end).
 */
export function divideLabel(label: string, fraction: number): [string, string] {
  // Array.from counts characters, so a character outside the basic plane stays whole.
  const characters = Array.from(label.trim())
  if (characters.length < 2) return [label.trim(), label.trim()]
  const at = clamp(Math.round(characters.length * fraction), 1, characters.length - 1)
  return [characters.slice(0, at).join('').trim(), characters.slice(at).join('').trim()]
}

/**
 * Returns the word with no `unknown` state.
 * A word with a new label has no break down yet, so its old `unknown` state is not true any more.
 */
export function withoutUnknown(word: Mark): Mark {
  const result = { ...word }
  delete result.unknown
  return result
}

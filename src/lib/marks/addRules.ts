import type { Layer, Mark } from '../../store/types.ts'
import { PHONEME_LABELS } from '../dictionary/cmuSymbols.ts'
import { snap } from '../time/snap.ts'
import type { TimeRange } from '../time/timeRange.ts'
import { clamp } from './limits.ts'
import { noEdit, type MarkEdit } from './markEdit.ts'
import { guessPhonemes, type NewId } from './words.ts'

/** The fields of a new mark that the person adds. */
export type NewMark = {
  voiceId: string
  layer: Layer
  /** The first time of the range. It can come after `endMs`. */
  startMs: number
  endMs: number
  label: string
}

/** The legal range of a new mark, and the parent that holds it. */
export type AddPlace = {
  range: TimeRange
  /** The phrase of a new word, the word of a new phoneme, or undefined for a phrase and for a word outside any phrase. */
  parent: Mark | undefined
}

const PARENT_LAYER = { phrase: undefined, word: 'phrase', phoneme: 'word' } as const

function holds(mark: Mark, timeMs: number): boolean {
  return mark.startMs <= timeMs && timeMs < mark.endMs
}

/**
 * Returns the empty range on the layer of the voice around `anchorMs`, inside `outer`.
 * Returns undefined when a mark of the layer holds the anchor.
 */
function gapAround(
  marks: readonly Mark[],
  voiceId: string,
  layer: Layer,
  anchorMs: number,
  outer: TimeRange,
): TimeRange | undefined {
  const own = marks.filter((mark) => mark.voiceId === voiceId && mark.layer === layer)
  if (own.some((mark) => holds(mark, anchorMs))) return undefined
  return {
    startMs: Math.max(
      outer.startMs,
      ...own.filter((mark) => mark.endMs <= anchorMs).map((mark) => mark.endMs),
    ),
    endMs: Math.min(
      outer.endMs,
      ...own.filter((mark) => mark.startMs > anchorMs).map((mark) => mark.startMs),
    ),
  }
}

/**
 * Returns the range that the new mark must stay inside, and its parent.
 * A phrase stays inside the song. A word stays inside the phrase that holds the anchor, or else in the gap between phrases.
 * A phoneme needs the word that holds the anchor.
 */
function outerPlace(
  marks: readonly Mark[],
  input: NewMark,
  anchorMs: number,
  songRange: TimeRange,
): { outer: TimeRange; parent: Mark | undefined } | undefined {
  const parentLayer = PARENT_LAYER[input.layer]
  if (!parentLayer) return { outer: songRange, parent: undefined }
  const parent = marks.find(
    (mark) => mark.voiceId === input.voiceId && mark.layer === parentLayer && holds(mark, anchorMs),
  )
  if (parent) return { outer: parent, parent }
  if (input.layer === 'phoneme') return undefined
  const outer = gapAround(marks, input.voiceId, 'phrase', anchorMs, songRange)
  return outer && { outer, parent: undefined }
}

/**
 * Returns the legal place of a new mark, or undefined when the add is not possible.
 *
 * The rules:
 * - Both times snap to the frame size. The start time is the anchor of the empty range.
 * - The mark goes in the empty range of its layer of its voice around the anchor, and the rule clamps the mark to that range.
 * - The mark stays inside its parent: a word in the phrase that holds the anchor, a phoneme in the word that holds the anchor.
 *   A word outside any phrase stays in the empty range between phrases.
 * - The clamped mark must be one frame size or longer.
 *
 * @param marks The marks of the song.
 * @param input The voice, the layer and the times of the new mark.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 */
export function addPlace(
  marks: readonly Mark[],
  input: NewMark,
  frameMs: number,
  durationMs: number,
): AddPlace | undefined {
  const songRange = { startMs: 0, endMs: Math.floor(durationMs / frameMs) * frameMs }
  const startMs = snap(Math.min(input.startMs, input.endMs), frameMs)
  const endMs = snap(Math.max(input.startMs, input.endMs), frameMs)
  const anchorMs = clamp(startMs, songRange.startMs, songRange.endMs - frameMs)
  const place = outerPlace(marks, input, anchorMs, songRange)
  const gap = place && gapAround(marks, input.voiceId, input.layer, anchorMs, place.outer)
  if (!place || !gap) return undefined
  const range = { startMs: Math.max(startMs, gap.startMs), endMs: Math.min(endMs, gap.endMs) }
  return range.endMs - range.startMs >= frameMs ? { range, parent: place.parent } : undefined
}

function newMark(input: NewMark, label: string, place: AddPlace, id: string): Mark {
  return {
    id,
    voiceId: input.voiceId,
    layer: input.layer,
    label,
    ...place.range,
    parentId: place.parent?.id ?? null,
    // A phoneme that the person adds is a phoneme edit by hand.
    edited: input.layer === 'phoneme',
  }
}

function wordEdit(word: Mark, frameMs: number, newId: NewId): MarkEdit {
  const phrase: Mark[] =
    word.parentId === null ? [{ ...word, id: newId(), layer: 'phrase', edited: false }] : []
  const placed = phrase[0] ? { ...word, parentId: phrase[0].id } : word
  return {
    changed: [],
    removedIds: [],
    added: [...phrase, placed, ...guessPhonemes(placed, frameMs, newId)],
    breakDownIds: [placed.id],
  }
}

function hasValidLabel(layer: Layer, label: string): boolean {
  if (layer === 'phoneme') return (PHONEME_LABELS as readonly string[]).includes(label)
  return label !== ''
}

/**
 * Returns the legal result of an add of a mark. See `addPlace` for the place rules.
 *
 * The other rules:
 * - A phrase or a word needs a label that is not empty after a trim. A phoneme needs one of the ten phoneme labels.
 * - A new word inside a phrase becomes a child of the phrase. The store breaks it down.
 * - A new word outside any phrase also creates a phrase with the same range and the same label.
 * - A new phoneme sets `edited` on itself and on its word.
 *
 * @param marks The marks of the song.
 * @param input The voice, the layer, the times and the label of the new mark.
 * @param frameMs The frame size of the song.
 * @param durationMs The length of the song.
 * @param newId Gives the id of each new mark.
 * @returns An empty edit when the add is not possible.
 */
export function previewAdd(
  marks: readonly Mark[],
  input: NewMark,
  frameMs: number,
  durationMs: number,
  newId: NewId,
): MarkEdit {
  const label = input.label.trim()
  const place = hasValidLabel(input.layer, label)
    ? addPlace(marks, input, frameMs, durationMs)
    : undefined
  if (!place) return noEdit()
  const mark = newMark(input, label, place, newId())
  if (input.layer === 'word') return wordEdit(mark, frameMs, newId)
  const word = place.parent && !place.parent.edited ? [{ ...place.parent, edited: true }] : []
  return { changed: input.layer === 'phoneme' ? word : [], removedIds: [], added: [mark] }
}

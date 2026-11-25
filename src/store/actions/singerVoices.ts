import { applyEdit } from '../../lib/marks/markEdit.ts'
import { previewTransfer, type TransferMode } from '../../lib/marks/transferRules.ts'
import { nextVoiceName } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'
import { newMarkId } from './commitMarkEdit.ts'
import { addVoiceStep } from './voices.ts'

/** The singers of each phrase of a run, as `assignSingers` returns them. */
export type SingerAssignment = ReadonlyMap<string, readonly number[]>

/** One transfer of phrases to one voice. */
type Transfer = { phraseIds: string[]; toVoiceId: string; mode: TransferMode }

/** Returns the phrases of the voice that the assignment names, so older marks of the voice do not change. */
function runPhrases(content: SongContent, voiceId: string, assignment: SingerAssignment): Mark[] {
  return content.marks.filter(
    (mark) => mark.layer === 'phrase' && mark.voiceId === voiceId && assignment.has(mark.id),
  )
}

/**
 * Returns the content with a new voice for each singer after singer 0, and the voice id of each singer.
 * Singer 0 keeps the voice of the run. The new voices are "Singer 2", "Singer 3" … with the lowest free numbers.
 * At 12 voices the action adds no more voices, and the next singers keep the voice of the run.
 */
function withSingerVoices(content: SongContent, voiceId: string, singerCount: number) {
  let next = content
  const voiceIds = [voiceId]
  for (let singer = 1; singer < singerCount; singer++) {
    const added = addVoiceStep(next, nextVoiceName(next.voices, 'Singer'))
    if (added === null) break
    next = added.content
    voiceIds.push(added.voice.id)
  }
  return { content: next, voiceIds }
}

/** Adds the phrase id to the transfer of the voice and the mode. */
function addTo(
  transfers: Map<string, Transfer>,
  phraseId: string,
  toVoiceId: string,
  mode: TransferMode,
) {
  const key = `${mode}/${toVoiceId}`
  const transfer = transfers.get(key) ?? { phraseIds: [], toVoiceId, mode }
  transfer.phraseIds.push(phraseId)
  transfers.set(key, transfer)
}

/**
 * Returns the moves first, then the copies.
 * A phrase moves to the voice of its first singer, and each other singer gets a copy.
 * The copies come after the moves, so a phrase that moves is copied from its new voice.
 */
function transfersOf(
  phrases: readonly Mark[],
  assignment: SingerAssignment,
  voiceIds: readonly string[],
  voiceId: string,
): Transfer[] {
  const transfers = new Map<string, Transfer>()
  for (const phrase of phrases) {
    const targets = [
      ...new Set((assignment.get(phrase.id) ?? []).map((s) => voiceIds[s] ?? voiceId)),
    ]
    const [first = voiceId, ...others] = targets
    if (first !== voiceId) addTo(transfers, phrase.id, first, 'move')
    for (const other of others) addTo(transfers, phrase.id, other, 'copy')
  }
  return [...transfers.values()].sort((a, b) =>
    a.mode === b.mode ? 0 : a.mode === 'move' ? -1 : 1,
  )
}

/**
 * Returns the assignment of the phrases with the singers after singer 0 numbered 1, 2, 3 … with no gap,
 * in the order of the first phrase of each singer by start time, and the count of singers.
 * Singer 0 keeps its number, because it is the singer of the voice of the run.
 * With no gap, each new voice gets at least one phrase.
 */
function denseSingers(phrases: readonly Mark[], assignment: SingerAssignment) {
  const newNumber = new Map([[0, 0]])
  const ordered = phrases.toSorted((a, b) => a.startMs - b.startMs)
  for (const phrase of ordered)
    for (const singer of (assignment.get(phrase.id) ?? []).toSorted((a, b) => a - b))
      if (!newNumber.has(singer)) newNumber.set(singer, newNumber.size)
  const dense = new Map(
    phrases.map((phrase) => [
      phrase.id,
      (assignment.get(phrase.id) ?? []).map((singer) => newNumber.get(singer) ?? 0),
    ]),
  )
  return { dense, singerCount: newNumber.size }
}

/** Returns the content after each transfer, with the voices of the singers, and the voice count of the run. */
function singerVoicesStep(content: SongContent, voiceId: string, assignment: SingerAssignment) {
  const unchanged = { content, voiceCount: 1 }
  if (!content.voices.some((voice) => voice.id === voiceId)) return unchanged
  const phrases = runPhrases(content, voiceId, assignment)
  const { dense, singerCount } = denseSingers(phrases, assignment)
  const withVoices = withSingerVoices(content, voiceId, singerCount)
  if (withVoices.voiceIds.length === 1) return unchanged
  let marks = withVoices.content.marks
  for (const transfer of transfersOf(phrases, dense, withVoices.voiceIds, voiceId)) {
    // Each new voice is empty, so `replace` removes nothing there. It keeps the replace rule of a transfer in force.
    const edit = previewTransfer(
      marks,
      transfer.phraseIds,
      transfer.toVoiceId,
      transfer.mode,
      true,
      newMarkId,
    )
    marks = applyEdit(marks, edit)
  }
  return { content: { ...withVoices.content, marks }, voiceCount: withVoices.voiceIds.length }
}

/**
 * Puts each singer of a transcribe run on its own voice, as one undo step.
 *
 * The rules:
 * - Singer 0 keeps the voice of the run.
 * - Each other singer gets a new voice "Singer 2", "Singer 3" … with the next unused colour.
 * - A phrase moves to the voice of its first singer, with its words and phonemes.
 * - A phrase with more than one singer goes to each other singer as a copy with new ids.
 * - Only the phrases in the assignment change. Older marks of the voice stay.
 * - A song has 12 voices at most. A singer with no free voice keeps the voice of the run.
 * - The action numbers the singers after singer 0 again with no gap, so a gap in the assignment makes no empty voice.
 *
 * With one singer, an unknown voice or no phrase, the action records no step.
 * @param voiceId The voice of the run.
 * @param assignment The singers of each phrase of the run, from `assignSingers`.
 * Returns the count of voices that hold the phrases of the run: 1 when the action changes nothing.
 */
export function putSingersOnVoices(voiceId: string, assignment: SingerAssignment): number {
  let voiceCount = 1
  useSongStore.getState().apply((content) => {
    const result = singerVoicesStep(content, voiceId, assignment)
    voiceCount = result.voiceCount
    return result.content
  })
  return voiceCount
}

import { applyEdit } from '../../lib/marks/markEdit.ts'
import { previewTransfer, type TransferMode } from '../../lib/marks/transferRules.ts'
import {
  type AssignmentStats,
  assignmentStats,
  assignSingers,
  type SingerRange,
} from '../../lib/singers/assignSingers.ts'
import { divideAtSingers } from '../../lib/singers/divideAtSingers.ts'
import { nextVoiceName } from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { Mark, SongContent } from '../types.ts'
import { newMarkId } from './commitMarkEdit.ts'
import { addVoiceStep } from './voices.ts'

/** The singers of each phrase of a run, as `assignSingers` returns them. */
type SingerAssignment = ReadonlyMap<string, readonly number[]>

/** What the singer step did with the phrases of a run. */
export type SingerStepResult = {
  /** The count of voices that hold the phrases of the run: 1 when the step changed nothing. */
  voiceCount: number
  /** The phrases of the run that the step divided where the singer changes. */
  dividedCount: number
  /** The counts of the assignment of the phrases after the division, with no limit of singers. */
  stats: AssignmentStats
}

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
function transferStep(content: SongContent, voiceId: string, assignment: SingerAssignment) {
  const unchanged = { content, voiceCount: 1 }
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

/** Returns the content after the division and the transfers, and what the step did. */
function singerVoicesStep(
  content: SongContent,
  voiceId: string,
  phraseIds: readonly string[],
  segments: readonly SingerRange[],
  maxSingers: number,
): { content: SongContent; result: SingerStepResult } {
  const owned = content.marks.filter(
    (mark) => mark.layer === 'phrase' && mark.voiceId === voiceId && phraseIds.includes(mark.id),
  )
  const divided = divideAtSingers(
    content.marks,
    owned.map((mark) => mark.id),
    segments,
    content.song.frameMs,
    newMarkId,
  )
  const phrases = divided.marks.filter((mark) => divided.phraseIds.includes(mark.id))
  const stats = assignmentStats(phrases, segments)
  const assignment = assignSingers(phrases, segments, maxSingers)
  const moved = transferStep({ ...content, marks: divided.marks }, voiceId, assignment)
  // With one voice, the division alone gives the person no gain, so the step keeps the song as it was.
  if (moved.voiceCount === 1)
    return {
      content,
      result: { voiceCount: 1, dividedCount: 0, stats: assignmentStats(owned, segments) },
    }
  return {
    content: moved.content,
    result: { voiceCount: moved.voiceCount, dividedCount: divided.dividedCount, stats },
  }
}

/**
 * Puts each singer of a transcribe run on its own voice, as one undo step.
 *
 * The rules:
 * - A phrase of the run with a change of singer inside it becomes two or more phrases. See `divideAtSingers`.
 * - `assignSingers` gives the singers of each phrase. Singer 0 keeps the voice of the run.
 * - Each other singer gets a new voice "Singer 2", "Singer 3" … with the next unused colour.
 * - A phrase moves to the voice of its first singer, with its words and phonemes.
 * - A phrase with more than one singer goes to each other singer as a copy with new ids.
 * - Only the phrases of the run change. Older marks of the voice stay.
 * - A song has 12 voices at most. A singer with no free voice keeps the voice of the run.
 * - The action numbers the singers after singer 0 again with no gap, so a gap in the assignment makes no empty voice.
 *
 * With one singer, an unknown voice or no phrase, the action records no step and divides no phrase.
 * @param voiceId The voice of the run.
 * @param phraseIds The phrases that the run wrote. An id of another voice changes nothing.
 * @param segments The singer ranges, with song times.
 * @param maxSingers The most singers: the free voices of the song plus the voice of the run.
 */
export function putSingersOnVoices(
  voiceId: string,
  phraseIds: readonly string[],
  segments: readonly SingerRange[],
  maxSingers: number,
): SingerStepResult {
  let result: SingerStepResult = {
    voiceCount: 1,
    dividedCount: 0,
    stats: { singersWithPhrases: 0, phrasesWithNoSinger: 0, phrasesWithMoreSingers: 0 },
  }
  useSongStore.getState().apply((content) => {
    const step = singerVoicesStep(content, voiceId, phraseIds, segments, maxSingers)
    result = step.result
    return step.content
  })
  return result
}

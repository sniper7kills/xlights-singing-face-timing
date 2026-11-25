// The summary states the result of the singer step in plain words, from the numbers of the report only. It holds no lyrics.
import type { SingerDiagnostics } from '../singers/diagnostics.ts'
import type { SingerSection } from './runReport.ts'

/** The next action after a result with one singer and the choice "Automatic". */
const SELECT_COUNT = 'If the song has more singers, select the count in "Singers" and run again.'
/** The next action after a result with two singers or more. */
const MOVE_TO_VOICE = 'If a phrase is on the wrong voice, use "Move to voice" to correct it.'
const STAY = 'The phrases stay on the voice of the run.'

/** Returns the count and the noun, for example "1 singer" or "3 singers". */
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** Returns the sentences of a failed step: the cause and the next action. */
function failedLines(kind: string | null): string[] {
  switch (kind) {
    case 'download':
      return [
        `The app could not download the singer model. ${STAY}`,
        'Check the connection and run again.',
      ]
    case 'memory':
      return [
        `This browser did not have enough memory to find the singers. ${STAY}`,
        'Run again on a shorter part of the song.',
      ]
    default:
      return [
        `The singer step failed (${kind ?? 'cause not known'}). ${STAY}`,
        'Run again. If the step fails again, copy this report into a bug report.',
      ]
  }
}

/**
 * Returns the most probable reason that the search found one singer, from its diagnostics.
 * - Other groups joined the first group because they were short: the parts of other singers were short.
 * - Two groups had centres closer than the merge threshold, or the search made one group only: the singers sound alike.
 */
function oneSingerReason(diagnostics: SingerDiagnostics): string {
  const joinedShort = diagnostics.rawGroups.some(
    (group) => group.fate.kind === 'joined' && group.fate.reason !== 'cap',
  )
  if (joinedShort)
    return `The app found ${counted(diagnostics.rawGroupCount, 'group')} of voice prints, but the parts of other singers were short. So the app joined them with the first singer.`
  const closest = diagnostics.centroidDistances?.min
  if (closest !== undefined && closest < diagnostics.settings.threshold)
    return 'The singers sound alike to the app, so the app joined them into one singer.'
  return 'All voice prints of the song are close to each other. If the song has more singers, they sound alike to the app.'
}

function oneSingerLines(singers: SingerSection): string[] {
  const { diagnostics, selected } = singers
  const head =
    typeof selected === 'number'
      ? `The app found 1 singer, and you selected ${selected}. All phrases stay on one voice.`
      : 'The app found 1 singer, so all phrases stay on one voice.'
  return [
    head,
    ...(diagnostics === null ? [] : [oneSingerReason(diagnostics)]),
    typeof selected === 'number' ? MOVE_TO_VOICE : SELECT_COUNT,
  ]
}

/** Returns the sentence for a search that made more groups than the count that the person selected, or none. */
function cutLines(singers: SingerSection): string[] {
  const { diagnostics, selected } = singers
  if (typeof selected !== 'number' || diagnostics === null) return []
  if (diagnostics.rawGroupCount <= selected) return []
  return [
    `The app found ${counted(diagnostics.rawGroupCount, 'group')} of voice prints, and you selected ${selected}. The app joined the groups that sound most alike.`,
  ]
}

/** Returns the sentences about the divided phrases, the copied phrases and the phrases with no singer. */
function phraseLines(singers: SingerSection): string[] {
  const lines: string[] = []
  const divided = singers.phrasesDivided ?? 0
  if (divided > 0)
    lines.push(`The app divided ${counted(divided, 'phrase')} where the singer changes.`)
  const copied = singers.phrasesWithMoreSingers ?? 0
  if (copied > 0)
    lines.push(
      `${counted(copied, 'phrase')} had more than one singer, so each voice of those singers got a copy.`,
    )
  const alone = singers.phrasesWithNoSinger ?? 0
  if (alone > 0)
    lines.push(
      `${counted(alone, 'phrase')} had no singer, so ${alone === 1 ? 'it stays' : 'they stay'} on the voice of the run.`,
    )
  return lines
}

/** Returns the count of singers that the step found, or null when the report does not know it. */
function foundCount(singers: SingerSection): number | null {
  return singers.diagnostics?.finalSingerCount ?? singers.singersWithPhrases
}

function splitLines(singers: SingerSection): string[] {
  const found = foundCount(singers)
  const voices = singers.voicesMade
  const head =
    found === null || voices === null
      ? 'The app put the phrases on the voices of the singers.'
      : `The app found ${counted(found, 'singer')} and put the phrases on ${counted(voices, 'voice')}.`
  return [head, ...cutLines(singers), ...phraseLines(singers), MOVE_TO_VOICE]
}

function cappedLines(singers: SingerSection): string[] {
  const found = foundCount(singers)
  const head =
    found === null
      ? 'The app found more singers than the song has free voices.'
      : `The app found ${counted(found, 'singer')}, more than the song has free voices. A song has 12 voices at most.`
  return [
    head,
    'The singers with no free voice stay on the voice of the run.',
    ...phraseLines(singers),
    'Delete the voices that you do not use, and run again.',
  ]
}

/**
 * Returns the summary of the singer step in plain words: the result, the most probable reason, and the next action.
 * The panel and the copied text show it at the top. The sentences hold counts only, no lyrics.
 * @param singers The singer section of a stored report.
 */
export function singerSummary(singers: SingerSection): string[] {
  switch (singers.status) {
    case 'option-off':
      return [
        'The singer step did not run, because "Put each singer on its own voice" was off.',
        'To give each singer a voice, select that option and run again.',
      ]
    case 'no-vocals':
      return [
        'The singer step did not run, because the run had no separated vocals.',
        'Select "Separate the vocals first" and run again.',
      ]
    case 'failed':
      return failedLines(singers.failureKind)
    case 'cancelled':
      return [`You stopped the singer step. ${STAY}`, 'Run again to find the singers.']
    case 'capped':
      return cappedLines(singers)
    case 'one-singer':
      return oneSingerLines(singers)
    case 'split':
      return splitLines(singers)
  }
}

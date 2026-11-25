// The run report holds counts, names of models, voice names and times only. It never holds a lyrics word, an API key, a URL or audio.
import {
  type FinalSinger,
  joinReasonText,
  type RawGroup,
  type SingerDiagnostics,
} from '../singers/diagnostics.ts'

/** A step of a transcribe run that the report times. */
export type RunStep =
  | 'prepare'
  | 'separationDownload'
  | 'separation'
  | 'modelLoad'
  | 'transcribe'
  | 'upload'
  | 'wait'
  | 'singersDownload'
  | 'singers'
  | 'breakDown'

/** The text of each step in `reportToText` and in the run report panel, in the order of a run. */
const STEP_TEXT: Record<RunStep, string> = {
  prepare: 'Prepare the audio',
  separationDownload: 'Load the vocal separation model',
  separation: 'Separate the vocals',
  modelLoad: 'Load the speech model',
  transcribe: 'Transcribe',
  upload: 'Send the audio',
  wait: 'Wait for the remote endpoint',
  singersDownload: 'Load the singer model',
  singers: 'Find the singers',
  breakDown: 'Align and break down the words',
}

/** The time of each step of a run in whole milliseconds. A step that did not run has no value. */
export type StepDurations = Partial<Record<RunStep, number>>

/**
 * One warning or failure of a step that the run continued after.
 * - `step`: the step that gave it.
 * - `kind`: the cause, for example `memory`.
 * - `text`: one line, for example "separation failed: memory; continued with the fast model".
 */
export type RunNote = {
  step: 'separation' | 'singers' | 'break-down' | 'storage'
  kind: string
  text: string
}

/** The vocal separation model that gave the vocals of a run, or 'none' for a run with no separated vocals. */
export type ReportSeparationModel = 'spleeter' | 'demucs' | 'none'

/**
 * The count of phrases of the run on one voice.
 * `made` is true for a voice that the singer step added. A report of an earlier version of the app has no `made`.
 */
export type VoicePhrases = { name: string; phraseCount: number; made?: boolean }

/**
 * The result of the singer step:
 * - `option-off`: the run had no "Put each singer on its own voice".
 * - `split`: the step put two or more singers on their own voices.
 * - `one-singer`: the step found one singer.
 * - `capped`: the step found more singers than the song has free voices.
 * - `failed`: the step stopped with a failure. `failureKind` gives the cause.
 * - `cancelled`: the person cancelled the step.
 * - `no-vocals`: the run had no separated vocals, so the step did not run.
 */
export type SingerStepStatus =
  'option-off' | 'split' | 'one-singer' | 'capped' | 'failed' | 'cancelled' | 'no-vocals'

/** What the singer step found, and what the app did with it. A count is null when the step did not get that far. */
export type SingerSection = {
  status: SingerStepStatus
  /** The cause of a `failed` step, for example `memory`, else null. */
  failureKind: string | null
  /** The numbers of the singer search, or null when the engine gave none. */
  diagnostics: SingerDiagnostics | null
  /** The count of singer ranges that the search returned. */
  rangeCount: number | null
  /** A singer gets a phrase when its ranges cover this share of the phrase, from 0 to 1. */
  shareThreshold: number
  /** The singers that got one phrase or more, before the limit of free voices. */
  singersWithPhrases: number | null
  /** The phrases that no singer range touches. They stay on the voice of the run. */
  phrasesWithNoSinger: number | null
  /** The phrases that two or more singers got. Each of their voices gets a copy. */
  phrasesWithMoreSingers: number | null
  /** The voices that hold the phrases of the run after the step. */
  voicesMade: number | null
}

/** What one transcribe run did. The app keeps the report of the last run of each song. */
export type RunReport = {
  /** The ISO 8601 date and time of the "Start" click. */
  startedAt: string
  /** The short git commit of the app that made the run. A report of an earlier version of the app has no build. */
  build?: string
  /** Where the words came from. A lyrics-only run has the source 'browser'. */
  source: 'browser' | 'remote'
  /** The host of the remote endpoint, for example `api.openai.com`, or null for a run in the browser. */
  endpointHost: string | null
  /** 'lyrics-only' for a run with no speech model. */
  mode: 'model' | 'lyrics-only'
  /** The speech model id, the model name of the remote endpoint, or null for a lyrics-only run. */
  speechModel: string | null
  /** The device that ran the speech model in the browser, or null for a remote or a lyrics-only run. */
  device: 'webgpu' | 'wasm' | null
  separationModel: ReportSeparationModel
  /** True when a Demucs run failed and the person selected "Use the fast model". */
  separationFallback: boolean
  /**
   * The count of audio tracks that the vocal separation gave: 2 (the vocals and the instruments), or 0 with no separation.
   * A report of an earlier version of the app has no value.
   */
  trackCount?: number
  /** True when the app stored the audio tracks of the run. A report of an earlier version of the app has no value. */
  tracksKept?: boolean
  singers: SingerSection
  /** Each voice that holds phrases of the run, with its count of phrases. */
  voices: VoicePhrases[]
  phraseCount: number
  wordCount: number
  estimatedCount: number
  /** The words that no dictionary has. */
  unknownCount: number
  /** The part of the song that the run read. */
  range: { startMs: number; endMs: number }
  frameMs: number
  durationsMs: StepDurations
  notes: RunNote[]
}

/** The part of a mark that the report counts. The report never reads the label. */
export type CountedMark = {
  layer: 'phrase' | 'word' | 'phoneme'
  estimated?: boolean
  unknown?: boolean
}

/** A time range of one singer, with the shape of `SingerSegment` of the singers worker. */
export type ReportSingerRange = { startMs: number; endMs: number; singer: number }

/** The facts of a run that `buildRunReport` turns into a report. */
export type RunFacts = Omit<
  RunReport,
  'phraseCount' | 'wordCount' | 'estimatedCount' | 'unknownCount'
> & {
  /** The marks that the run wrote, before the singer step. */
  marks: readonly CountedMark[]
}

/**
 * Returns the report of a run from its facts.
 * The report counts the marks. It copies no label of a mark.
 * @param facts The facts that the run collected.
 */
export function buildRunReport(facts: RunFacts): RunReport {
  const words = facts.marks.filter((mark) => mark.layer === 'word')
  return {
    startedAt: facts.startedAt,
    ...(facts.build === undefined ? {} : { build: facts.build }),
    source: facts.source,
    endpointHost: facts.endpointHost,
    mode: facts.mode,
    speechModel: facts.speechModel,
    device: facts.device,
    separationModel: facts.separationModel,
    separationFallback: facts.separationFallback,
    ...(facts.trackCount === undefined ? {} : { trackCount: facts.trackCount }),
    ...(facts.tracksKept === undefined ? {} : { tracksKept: facts.tracksKept }),
    singers: facts.singers,
    voices: facts.voices,
    phraseCount: facts.marks.filter((mark) => mark.layer === 'phrase').length,
    wordCount: words.length,
    estimatedCount: words.filter((mark) => mark.estimated === true).length,
    unknownCount: words.filter((mark) => mark.unknown === true).length,
    range: facts.range,
    frameMs: facts.frameMs,
    durationsMs: facts.durationsMs,
    notes: facts.notes,
  }
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

function countText(value: number | null | undefined): string {
  return value == null ? 'not known' : String(value)
}

/** Returns the text of a yes or no fact, or 'not known' for a report of an earlier version of the app. */
export function knownYesNo(value: boolean | undefined): string {
  return value === undefined ? 'not known' : yesNo(value)
}

/** Returns the rows as lines with each column padded to its widest cell, so a monospace font shows a table. */
export function alignedTable(rows: readonly (readonly string[])[]): string[] {
  const widths = rows.reduce<number[]>(
    (max, row) => row.map((cell, index) => Math.max(max[index] ?? 0, cell.length)),
    [],
  )
  return rows.map(
    (row) =>
      `  ${row
        .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
        .join('  ')}`,
  )
}

function fateText(group: RawGroup, diagnostics: SingerDiagnostics): string {
  const { fate } = group
  if (fate.kind === 'kept')
    return fate.singer === null
      ? 'kept, no range after the range limits'
      : `kept as singer ${fate.singer}`
  return `joined group ${fate.into}: ${joinReasonText(fate.reason, diagnostics.settings)}`
}

function rawGroupLines(diagnostics: SingerDiagnostics): string[] {
  if (diagnostics.rawGroups.length === 0) return []
  return alignedTable([
    ['group', 'sung ms', 'embeddings', 'result'],
    ...diagnostics.rawGroups.map((group) => [
      String(group.group),
      String(group.sungMs),
      String(group.embeddingCount),
      fateText(group, diagnostics),
    ]),
  ])
}

function finalSingerLines(singers: readonly FinalSinger[]): string[] {
  if (singers.length === 0) return []
  return alignedTable([
    ['singer', 'sung ms', 'ranges'],
    ...singers.map((singer) => [
      String(singer.singer),
      String(singer.sungMs),
      String(singer.rangeCount),
    ]),
  ])
}

function distanceText(diagnostics: SingerDiagnostics): string {
  const distances = diagnostics.centroidDistances
  if (distances === null) return 'none (fewer than 2 raw groups)'
  return `${distances.min} / ${distances.median} / ${distances.max}`
}

function diagnosticLines(diagnostics: SingerDiagnostics | null): string[] {
  if (diagnostics === null) return ['Diagnostics: none']
  const { settings } = diagnostics
  return [
    `Audio: ${diagnostics.audioMs} ms`,
    `Windows: ${diagnostics.windowCount}`,
    `Frames with a singer: ${diagnostics.framesWithSpeech}`,
    `Sung time: ${diagnostics.sungMs} ms`,
    `Embeddings: ${diagnostics.embeddingCount}`,
    `Embeddings dropped (not finite): ${diagnostics.droppedEmbeddings}`,
    `Merge threshold: ${settings.threshold}`,
    `Minimum group size: ${settings.minGroupSize} embeddings`,
    `Highest count of singers: ${settings.maxSingers}`,
    `Short singer limits: ${Math.round(settings.minSingerShare * 100)}% of the sung time, ${settings.minSingerMs} ms`,
    `Centroid distances (smallest / median / largest): ${distanceText(diagnostics)}`,
    `Raw groups: ${diagnostics.rawGroupCount}`,
    ...rawGroupLines(diagnostics),
    `Final singers: ${diagnostics.finalSingerCount}`,
    ...finalSingerLines(diagnostics.singers),
  ]
}

function singerLines(singers: SingerSection): string[] {
  const status =
    singers.failureKind === null ? singers.status : `${singers.status} (${singers.failureKind})`
  if (singers.status === 'option-off' || singers.status === 'no-vocals')
    return ['[Singers]', `Step: ${status}`]
  return [
    '[Singers]',
    `Step: ${status}`,
    ...diagnosticLines(singers.diagnostics),
    `Singer ranges: ${countText(singers.rangeCount)}`,
    `Phrase share for a singer: ${Math.round(singers.shareThreshold * 100)}% of the phrase length`,
    `Singers with one phrase or more: ${countText(singers.singersWithPhrases)}`,
    `Phrases with no singer range: ${countText(singers.phrasesWithNoSinger)}`,
    `Phrases with more than one singer: ${countText(singers.phrasesWithMoreSingers)}`,
    `Voices made: ${countText(singers.voicesMade)}`,
  ]
}

function runLines(report: RunReport): string[] {
  const { startMs, endMs } = report.range
  return [
    '[Run]',
    `Build: ${report.build ?? 'not known'}`,
    `Source: ${report.source}`,
    `Remote endpoint host: ${report.endpointHost ?? 'none'}`,
    `Mode: ${report.mode === 'model' ? 'speech model' : 'lyrics only'}`,
    `Speech model: ${report.speechModel ?? 'none'}`,
    `Device: ${report.device ?? 'none'}`,
    `Range: ${startMs} ms to ${endMs} ms (${endMs - startMs} ms)`,
    `Frame size: ${report.frameMs} ms`,
    '',
    '[Vocal separation]',
    `Separation model: ${report.separationModel}`,
    `Changed to the fast model: ${yesNo(report.separationFallback)}`,
    `Audio tracks: ${countText(report.trackCount)}`,
    `Tracks kept: ${knownYesNo(report.tracksKept)}`,
  ]
}

function countLines(report: RunReport): string[] {
  return [
    '[Counts]',
    `Phrases: ${report.phraseCount}`,
    `Words: ${report.wordCount}`,
    `Estimated words: ${report.estimatedCount}`,
    `Unknown words: ${report.unknownCount}`,
    '',
    '[Voices]',
    ...report.voices.map(
      (voice) =>
        `"${voice.name}": ${voice.phraseCount} phrases${voice.made === true ? ', made by the run' : ''}`,
    ),
  ]
}

/**
 * Returns the text and the time of each step that ran, in the order of a run.
 * @param durations The time of each step of a run.
 */
export function stepTimes(durations: StepDurations): { text: string; ms: number }[] {
  return (Object.keys(STEP_TEXT) as RunStep[]).flatMap((step) => {
    const ms = durations[step]
    return ms === undefined ? [] : [{ text: STEP_TEXT[step], ms }]
  })
}

function stepLines(durations: StepDurations): string[] {
  const steps = stepTimes(durations).map(({ text, ms }) => `${text}: ${ms} ms`)
  return ['[Step times]', ...(steps.length === 0 ? ['none'] : steps)]
}

function noteLines(notes: readonly RunNote[]): string[] {
  return ['[Warnings and failures]', ...(notes.length === 0 ? ['none'] : notes.map((n) => n.text))]
}

/**
 * Returns the report as plain text to paste into a chat or to save as `report.txt`.
 * Each section starts with a heading line in brackets. Each line holds one fact, with its unit.
 * The text holds the names of the voices and no lyrics.
 * @param report The report of a run.
 */
export function reportToText(report: RunReport): string {
  const sections = [
    runLines(report),
    countLines(report),
    singerLines(report.singers),
    stepLines(report.durationsMs),
    noteLines(report.notes),
  ]
  const head = ['Transcribe run report', `Started: ${report.startedAt}`]
  return `${[head, ...sections].map((lines) => lines.join('\n')).join('\n\n')}\n`
}

/** Measures the time of each step of a run. A step that starts two times adds both times. */
export type StepClock = {
  /** Ends the current step and starts `step`. Null ends the current step and starts none. */
  enter(step: RunStep | null): void
  /** Returns the time of each step that ended, in whole milliseconds. */
  durations(): StepDurations
}

/**
 * Returns a clock that measures the steps of a run.
 * @param now Returns the current time in milliseconds, for example `performance.now`.
 */
export function createStepClock(now: () => number): StepClock {
  const totals: StepDurations = {}
  let current: { step: RunStep; startMs: number } | null = null
  return {
    enter(step) {
      const at = now()
      if (current !== null)
        totals[current.step] = Math.round((totals[current.step] ?? 0) + at - current.startMs)
      current = step === null ? null : { step, startMs: at }
    },
    durations: () => ({ ...totals }),
  }
}

/** A voice with its id and name. */
export type NamedVoice = { id: string; name: string }

/** The part of a mark that `voicePhrases` reads. */
export type PlacedMark = { voiceId: string; layer: string; startMs: number }

/**
 * Returns the count of phrases that start in the range, for each voice, in the order of `voices`.
 * @param voices The voices that hold the phrases of the run.
 * @param marks All marks of the song.
 * @param range The range of the run.
 * @param madeIds The ids of the voices that the run added.
 */
export function voicePhrases(
  voices: readonly NamedVoice[],
  marks: readonly PlacedMark[],
  range: { startMs: number; endMs: number },
  madeIds: readonly string[] = [],
): VoicePhrases[] {
  return voices.map((voice) => ({
    name: voice.name,
    made: madeIds.includes(voice.id),
    phraseCount: marks.filter(
      (mark) =>
        mark.voiceId === voice.id &&
        mark.layer === 'phrase' &&
        mark.startMs >= range.startMs &&
        mark.startMs < range.endMs,
    ).length,
  }))
}

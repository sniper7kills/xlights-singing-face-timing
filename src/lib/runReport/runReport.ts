// The run report holds counts, names of models, voice names and times only. It never holds a lyrics word, an API key, a URL or audio.
import type { SingerDiagnostics } from '../singers/diagnostics.ts'
import type { SingerTrackLabel, SplitMode } from '../singers/splitRules.ts'

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
  | 'splitDownload'
  | 'split'
  | 'breakDown'

/** The text of each step in the run report panel and in the copied text, in the order of a run. */
const STEP_TEXT: Record<RunStep, string> = {
  prepare: 'Prepare the audio',
  separationDownload: 'Load the vocal separation model',
  separation: 'Separate the vocals',
  splitDownload: 'Load the singer split model',
  split: 'Split the singers',
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
 * - `name`: the name of the voice at the end of the run.
 * - `made`: true for a voice that the singer step added. A report of an earlier version of the app has no `made`.
 * - `voiceId`: the id of the voice, so the panel can show its present name. A report from before issue #173 has no `voiceId`.
 */
export type VoicePhrases = { name: string; phraseCount: number; made?: boolean; voiceId?: string }

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

/**
 * The constants of the rule that gives the phrases of a run to the singers:
 * - `secondSingerRatio`: a second singer gets a phrase with this share of the time of the top singer or more, from 0 to 1.
 * - `secondSingerMs`: a second singer also needs this time in the phrase, in milliseconds.
 * - `partMinWords` and `partMinMs`: the smallest part of a divided phrase, in words and in milliseconds.
 */
export type SingerPhraseRule = {
  secondSingerRatio: number
  secondSingerMs: number
  partMinWords: number
  partMinMs: number
}

/** What the singer step found, and what the app did with it. A count is null when the step did not get that far. */
export type SingerSection = {
  status: SingerStepStatus
  /** The cause of a `failed` step, for example `memory`, else null. */
  failureKind: string | null
  /** The numbers of the singer search, or null when the engine gave none. */
  diagnostics: SingerDiagnostics | null
  /** The count of singer ranges that the search returned. */
  rangeCount: number | null
  /** The rule that gives the phrases to the singers. A report of an earlier version of the app has no rule. */
  rule?: SingerPhraseRule
  /** The phrases of the run that the step divided where the singer changes. A report of an earlier version has none. */
  phrasesDivided?: number | null
  /** The singers that got one phrase or more, before the limit of free voices. */
  singersWithPhrases: number | null
  /** The phrases that no singer range touches. They stay on the voice of the run. */
  phrasesWithNoSinger: number | null
  /** The phrases that two or more singers got. Each of their voices gets a copy. */
  phrasesWithMoreSingers: number | null
  /** The voices that hold the phrases of the run after the step. */
  voicesMade: number | null
  /**
   * The choice of "Singers" in the transcribe dialog: `automatic`, or the count that the person gave.
   * A report from before the field, or of a run with the singer option off, has no value.
   */
  selected?: number | 'automatic'
}

/**
 * What the singer split of a run did:
 * - `mode`: the mode that the person selected.
 * - `tracks`: each singer track in voice order, with the name of its voice at the end of the run and its count of words.
 */
export type SplitSection = {
  mode: SplitMode
  tracks: { label: SingerTrackLabel; voiceName: string; wordCount: number }[]
}

/** Returns the text of the choice of "Singers" of a report: "Automatic", the count, or "not recorded". */
export function selectedSingersText(selected: SingerSection['selected']): string {
  if (selected === undefined) return 'not recorded'
  return selected === 'automatic' ? 'Automatic' : String(selected)
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
  /** The result of the singer split. A run with no singer split, and a report from before issue #193, have no value. */
  split?: SplitSection
  /** Each voice that holds phrases of the run, with its count of phrases. */
  voices: VoicePhrases[]
  phraseCount: number
  wordCount: number
  estimatedCount: number
  /** The words that no dictionary has. */
  unknownCount: number
  /** The lyrics lines that the run left out, because the range has no room for their words. A report of an earlier version has no value. */
  linesLeftOut?: number
  /** The words that the run left out, because it cannot use them. A report of an earlier version has no value. */
  wordsLeftOut?: number
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
    ...(facts.split === undefined ? {} : { split: facts.split }),
    voices: facts.voices,
    phraseCount: facts.marks.filter((mark) => mark.layer === 'phrase').length,
    wordCount: words.length,
    estimatedCount: words.filter((mark) => mark.estimated === true).length,
    unknownCount: words.filter((mark) => mark.unknown === true).length,
    ...(facts.linesLeftOut === undefined ? {} : { linesLeftOut: facts.linesLeftOut }),
    ...(facts.wordsLeftOut === undefined ? {} : { wordsLeftOut: facts.wordsLeftOut }),
    range: facts.range,
    frameMs: facts.frameMs,
    durationsMs: facts.durationsMs,
    notes: facts.notes,
  }
}

/** Returns the text of a yes or no fact, or 'not known' for a report of an earlier version of the app. */
export function knownYesNo(value: boolean | undefined): string {
  if (value === undefined) return 'not known'
  return value ? 'yes' : 'no'
}

/**
 * Returns the text of the rule that gives a phrase to its singers, or `not known` for a report with no rule.
 * @param rule The rule of the report.
 */
export function phraseRuleText(rule: SingerPhraseRule | undefined): string {
  if (rule === undefined) return 'not known'
  return `the singer with the most time; a second singer with ${Math.round(rule.secondSingerRatio * 100)}% of that time and ${rule.secondSingerMs / 1000} s or more`
}

/**
 * Returns the text of the limit of a phrase division, or `not known` for a report with no rule.
 * @param rule The rule of the report.
 */
export function divisionRuleText(rule: SingerPhraseRule | undefined): string {
  if (rule === undefined) return 'not known'
  const words = rule.partMinWords === 1 ? '1 word' : `${rule.partMinWords} words`
  return `at a change of singer, when each part has ${words} or more and ${rule.partMinMs / 1000} s or more`
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
    voiceId: voice.id,
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

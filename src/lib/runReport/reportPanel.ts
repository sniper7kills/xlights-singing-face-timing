// The run report panel shows the same facts as `reportToText`, with words for a person and one time format.
import { joinReasonText, type RawGroup, type SingerDiagnostics } from '../singers/diagnostics.ts'
import { safeFileName } from '../xtiming/names.ts'
import {
  divisionRuleText,
  knownYesNo,
  phraseRuleText,
  type ReportSeparationModel,
  type RunReport,
  type SingerSection,
  selectedSingersText,
  type StepDurations,
  stepTimes,
} from './runReport.ts'

/** One fact of a panel section: a label and its value with the unit. */
export type PanelFact = { label: string; value: string }

/** A table of a panel section. Each row has one cell for each column. */
export type PanelTable = { caption: string; columns: string[]; rows: string[][] }

/**
 * One section of the run report panel.
 * - `text`: a sentence before the facts, or the one sentence of a section with no data.
 * - `items`: lines that the panel shows as a list, for example the warnings.
 */
export type PanelSection = {
  title: string
  text: string | null
  facts: PanelFact[]
  tables: PanelTable[]
  items: string[]
}

/**
 * Returns a time in seconds with one decimal, for example `12.3 s` for 12 340 ms.
 * The panel shows each time of a run in this format.
 * @param ms The time in milliseconds.
 */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

/**
 * Returns the date and the time of an ISO 8601 text in the local time of the person.
 * @param iso The ISO 8601 date and time, for example the `startedAt` of a report.
 * @param locale The locale of the text. The default is the locale of the browser.
 * @param timeZone The time zone of the text. The default is the time zone of the computer.
 */
export function formatStartTime(iso: string, locale?: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone,
  })
}

/**
 * Returns the name of the text file of a run report: `<song name> - run report.txt`.
 * The function replaces each character that a file name cannot hold with `_`.
 * @param songName The name of the song.
 */
export function reportFileName(songName: string): string {
  return safeFileName(`${songName} - run report.txt`)
}

function section(title: string, change: Partial<PanelSection>): PanelSection {
  return { title, text: null, facts: [], tables: [], items: [], ...change }
}

function countText(value: number | null): string {
  return value === null ? 'not known' : String(value)
}

function sourceFacts(report: RunReport): PanelFact[] {
  if (report.mode === 'lyrics-only')
    return [{ label: 'Source', value: 'Lyrics only, with no speech model' }]
  if (report.source === 'remote')
    return [
      { label: 'Source', value: 'Remote endpoint' },
      { label: 'Remote endpoint host', value: report.endpointHost ?? 'not known' },
      { label: 'Speech model', value: report.speechModel ?? 'not known' },
    ]
  return [
    { label: 'Source', value: 'In this browser' },
    { label: 'Speech model', value: report.speechModel ?? 'not known' },
    { label: 'Device', value: report.device === 'webgpu' ? 'WebGPU' : 'WASM (CPU)' },
  ]
}

function runSection(report: RunReport, formatDate: (iso: string) => string): PanelSection {
  const { startMs, endMs } = report.range
  return section('Run', {
    facts: [
      { label: 'Started', value: formatDate(report.startedAt) },
      { label: 'Build', value: report.build ?? 'not known' },
      ...sourceFacts(report),
      {
        label: 'Range',
        value: `${formatSeconds(startMs)} to ${formatSeconds(endMs)} (${formatSeconds(endMs - startMs)})`,
      },
      { label: 'Frame size', value: `${report.frameMs} ms` },
    ],
  })
}

function stepSection(durations: StepDurations): PanelSection {
  const steps = stepTimes(durations)
  if (steps.length === 0) return section('Steps', { text: 'The report has no step times.' })
  const totalMs = steps.reduce((sum, { ms }) => sum + ms, 0)
  return section('Steps', {
    tables: [
      {
        caption: 'The time of each step',
        columns: ['Step', 'Time'],
        rows: [
          ...steps.map(({ text, ms }) => [text, formatSeconds(ms)]),
          ['Total', formatSeconds(totalMs)],
        ],
      },
    ],
  })
}

const SEPARATION_TEXT: Record<ReportSeparationModel, string> = {
  spleeter: 'Fast (Spleeter)',
  demucs: 'Demucs, experimental',
  none: 'none',
}

function separationSection(report: RunReport): PanelSection {
  if (report.separationModel === 'none')
    return section('Vocal separation', { text: 'The run did not separate the vocals.' })
  return section('Vocal separation', {
    facts: [
      { label: 'Separation model', value: SEPARATION_TEXT[report.separationModel] },
      { label: 'Changed to the fast model', value: report.separationFallback ? 'yes' : 'no' },
      { label: 'Audio tracks', value: String(report.trackCount ?? 'not known') },
      { label: 'Tracks kept', value: knownYesNo(report.tracksKept) },
    ],
  })
}

/**
 * Returns the sentence that states the result of the singer step in plain words.
 * @param singers The singer section of a report.
 */
export function singerStatusText(singers: SingerSection): string {
  switch (singers.status) {
    case 'option-off':
      return 'The singer step did not run, because the option was off.'
    case 'no-vocals':
      return 'The singer step did not run, because the run had no separated vocals.'
    case 'split':
      return `The singer step put the phrases on ${singers.voicesMade ?? 'an unknown count of'} voices.`
    case 'one-singer':
      return 'The singer step found one singer, so all phrases stay on one voice.'
    case 'capped':
      return 'The singer step found more singers than the song has free voices.'
    case 'failed':
      return `The singer step failed (${singers.failureKind ?? 'unknown'}). The phrases stay on the voice of the run.`
    case 'cancelled':
      return 'The person cancelled the singer step. The phrases stay on the voice of the run.'
  }
}

function groupResult(group: RawGroup, diagnostics: SingerDiagnostics): string {
  const { fate } = group
  if (fate.kind === 'kept')
    return fate.singer === null
      ? 'Kept, with no range after the range limits'
      : `Kept as singer ${fate.singer}`
  return `Joined into group ${fate.into}: ${joinReasonText(fate.reason, diagnostics.settings)}`
}

function diagnosticTables(diagnostics: SingerDiagnostics): PanelTable[] {
  return [
    {
      caption: 'The groups straight after the clustering',
      columns: ['Group', 'Sung time', 'Embeddings', 'Result'],
      rows: diagnostics.rawGroups.map((group) => [
        String(group.group),
        formatSeconds(group.sungMs),
        String(group.embeddingCount),
        groupResult(group, diagnostics),
      ]),
    },
    {
      caption: 'The final singers',
      columns: ['Singer', 'Sung time', 'Ranges'],
      rows: diagnostics.singers.map((singer) => [
        String(singer.singer),
        formatSeconds(singer.sungMs),
        String(singer.rangeCount),
      ]),
    },
  ]
}

function diagnosticFacts(diagnostics: SingerDiagnostics): PanelFact[] {
  const { settings, centroidDistances: distances } = diagnostics
  return [
    { label: 'Audio', value: formatSeconds(diagnostics.audioMs) },
    { label: 'Sung time', value: formatSeconds(diagnostics.sungMs) },
    { label: 'Embeddings', value: String(diagnostics.embeddingCount) },
    { label: 'Embeddings dropped (not finite)', value: String(diagnostics.droppedEmbeddings) },
    { label: 'Merge threshold', value: String(settings.threshold) },
    { label: 'Minimum group size', value: `${settings.minGroupSize} embeddings` },
    { label: 'Highest count of singers', value: String(settings.maxSingers) },
    {
      label: 'Short singer limits',
      value: `${Math.round(settings.minSingerShare * 100)}% of the sung time, ${formatSeconds(settings.minSingerMs)}`,
    },
    ...(distances === null
      ? []
      : [
          {
            label: 'Centroid distances (smallest / median / largest)',
            value: `${distances.min} / ${distances.median} / ${distances.max}`,
          },
        ]),
  ]
}

function assignmentFacts(singers: SingerSection): PanelFact[] {
  return [
    { label: 'Singers selected', value: selectedSingersText(singers.selected) },
    { label: 'Singer ranges', value: countText(singers.rangeCount) },
    { label: 'Phrase rule', value: phraseRuleText(singers.rule) },
    { label: 'Phrase division', value: divisionRuleText(singers.rule) },
    { label: 'Phrases divided', value: countText(singers.phrasesDivided ?? null) },
    {
      label: 'Singers with one phrase or more',
      value: countText(singers.singersWithPhrases),
    },
    { label: 'Phrases with no singer', value: countText(singers.phrasesWithNoSinger) },
    {
      label: 'Phrases with more than one singer (copied to each voice)',
      value: countText(singers.phrasesWithMoreSingers),
    },
  ]
}

function singerSection(singers: SingerSection): PanelSection {
  const text = singerStatusText(singers)
  if (singers.status === 'option-off' || singers.status === 'no-vocals')
    return section('Singers', { text })
  const { diagnostics } = singers
  return section('Singers', {
    text: diagnostics === null ? `${text} The singer search gave no diagnostics.` : text,
    tables: diagnostics === null ? [] : diagnosticTables(diagnostics),
    facts: [
      ...(diagnostics === null ? [] : diagnosticFacts(diagnostics)),
      ...assignmentFacts(singers),
    ],
  })
}

function voiceSection(report: RunReport): PanelSection {
  if (report.voices.length === 0)
    return section('Voices', { text: 'No voice holds phrases of the run.' })
  return section('Voices', {
    tables: [
      {
        caption: 'The voices that hold phrases of the run',
        columns: ['Voice', 'Phrases', 'Made by the run'],
        rows: report.voices.map((voice) => [
          voice.name,
          String(voice.phraseCount),
          voice.made === true ? 'yes' : 'no',
        ]),
      },
    ],
  })
}

function markSection(report: RunReport): PanelSection {
  return section('Marks', {
    facts: [
      { label: 'Phrases', value: String(report.phraseCount) },
      { label: 'Words', value: String(report.wordCount) },
      { label: 'Estimated words', value: String(report.estimatedCount) },
      { label: 'Unknown words', value: String(report.unknownCount) },
      { label: 'Lyrics lines left out', value: countText(report.linesLeftOut ?? null) },
      { label: 'Words left out', value: countText(report.wordsLeftOut ?? null) },
    ],
  })
}

function noteSection(report: RunReport): PanelSection {
  if (report.notes.length === 0)
    return section('Notes', { text: 'The run had no warning and no failure.' })
  return section('Notes', { items: report.notes.map((note) => note.text) })
}

/**
 * Returns the sections of the run report panel, in the order of the panel.
 * Each value holds its unit. The sections hold no label of a mark.
 * @param report The stored report of a run.
 * @param formatDate Returns the start time as a text. The default is the local time of the person.
 */
export function reportPanel(
  report: RunReport,
  formatDate: (iso: string) => string = (iso) => formatStartTime(iso),
): PanelSection[] {
  return [
    runSection(report, formatDate),
    stepSection(report.durationsMs),
    separationSection(report),
    singerSection(report.singers),
    voiceSection(report),
    markSection(report),
    noteSection(report),
  ]
}

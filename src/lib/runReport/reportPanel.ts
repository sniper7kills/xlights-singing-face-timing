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
import { singerSummary } from './singerSummary.ts'

/** One fact of a panel section: a label and its value with the unit. */
export type PanelFact = { label: string; value: string }

/** A table of a panel section. Each row has one cell for each column. */
export type PanelTable = { caption: string; columns: string[]; rows: string[][] }

/** The title of the part that folds and holds the numbers for a bug report. */
export const DETAILS_TITLE = 'Details for a bug report'

/**
 * The part of a section that folds, closed by default: the numbers for a bug report.
 * - `terms`: one sentence for each term of the part.
 */
export type PanelDetails = {
  terms: PanelFact[]
  facts: PanelFact[]
  tables: PanelTable[]
}

/**
 * One section of the run report panel.
 * - `text`: the sentences before the facts, or the one sentence of a section with no data.
 * - `items`: lines that the panel shows as a list, for example the warnings.
 * - `details`: the part that folds, or null.
 */
export type PanelSection = {
  title: string
  text: string | null
  facts: PanelFact[]
  tables: PanelTable[]
  items: string[]
  details: PanelDetails | null
}

/**
 * Returns a time in seconds with each millisecond and one decimal or more, for example `12.34 s` for 12 340 ms.
 * The panel and the copied text show each time of a run in this format, so the copied text keeps each millisecond.
 * @param ms The time in milliseconds.
 */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(3).replace(/0{1,2}$/, '')} s`
}

/**
 * Returns the date and the time of an ISO 8601 text in the local time of the person, and the UTC time after it.
 * For example `Nov 25, 2026, 12:34:05 AM (2026-11-25 05:34:05 UTC)`.
 * @param iso The ISO 8601 date and time, for example the `startedAt` of a report.
 * @param locale The locale of the text. The default is the locale of the browser.
 * @param timeZone The time zone of the text. The default is the time zone of the computer.
 */
export function formatStartTime(iso: string, locale?: string, timeZone?: string): string {
  const date = new Date(iso)
  const local = date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone })
  return `${local} (${date.toISOString().slice(0, 19).replace('T', ' ')} UTC)`
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
  return { title, text: null, facts: [], tables: [], items: [], details: null, ...change }
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
      columns: ['Group', 'Sung time', 'Voice prints', 'Result'],
      rows: diagnostics.rawGroups.map((group) => [
        String(group.group),
        formatSeconds(group.sungMs),
        String(group.embeddingCount),
        groupResult(group, diagnostics),
      ]),
    },
    {
      caption: 'The final singers',
      columns: ['Singer', 'Sung time', 'Singer ranges'],
      rows: diagnostics.singers.map((singer) => [
        String(singer.singer),
        formatSeconds(singer.sungMs),
        String(singer.rangeCount),
      ]),
    },
  ]
}

function distanceText(diagnostics: SingerDiagnostics): string {
  const distances = diagnostics.centroidDistances
  if (distances === null) return 'none (fewer than 2 groups)'
  return `${distances.min} / ${distances.median} / ${distances.max}`
}

function diagnosticFacts(diagnostics: SingerDiagnostics): PanelFact[] {
  const { settings } = diagnostics
  return [
    { label: 'Audio', value: formatSeconds(diagnostics.audioMs) },
    { label: 'Windows', value: String(diagnostics.windowCount) },
    { label: 'Frames with a singer', value: String(diagnostics.framesWithSpeech) },
    { label: 'Sung time', value: formatSeconds(diagnostics.sungMs) },
    { label: 'Voice prints (embeddings)', value: String(diagnostics.embeddingCount) },
    { label: 'Voice prints dropped (not finite)', value: String(diagnostics.droppedEmbeddings) },
    { label: 'Merge threshold', value: String(settings.threshold) },
    { label: 'Minimum group size', value: `${settings.minGroupSize} voice prints` },
    { label: 'Highest count of singers', value: String(settings.maxSingers) },
    {
      label: 'Short singer limits',
      value: `${Math.round(settings.minSingerShare * 100)}% of the sung time, ${formatSeconds(settings.minSingerMs)}`,
    },
    { label: 'Centroid distances (smallest / median / largest)', value: distanceText(diagnostics) },
    { label: 'Groups', value: String(diagnostics.rawGroupCount) },
    { label: 'Final singers', value: String(diagnostics.finalSingerCount) },
  ]
}

/** The sentence that explains each term of the details part. */
const SINGER_TERMS: PanelFact[] = [
  {
    label: 'Voice print (embedding)',
    value:
      'A list of numbers that the app computes from a short part of the vocals to describe the voice in it.',
  },
  {
    label: 'Window',
    value: 'A part of 10 seconds of the vocals that the app reads at one time.',
  },
  {
    label: 'Frame with a singer',
    value: 'A short step of a window in which one or more singers sing.',
  },
  { label: 'Sung time', value: 'The time in which one or more singers sing.' },
  {
    label: 'Group',
    value:
      'A set of voice prints that are close to each other, so the app takes them as one singer.',
  },
  {
    label: 'Merge threshold',
    value:
      'The app puts two groups together when the distance between their centres is less than this value.',
  },
  {
    label: 'Centroid distance',
    value:
      'The distance between the centres of two groups, where a small distance means that two voices sound alike.',
  },
  {
    label: 'Minimum group size',
    value: 'A group with fewer voice prints than this value joins the closest larger group.',
  },
  {
    label: 'Highest count of singers',
    value: 'The largest count of singers that the app keeps.',
  },
  {
    label: 'Short singer limits',
    value: 'A singer with less sung time than one of these limits joins another singer.',
  },
  { label: 'Singer range', value: 'A time range in which one singer sings.' },
]

function detailFacts(singers: SingerSection): PanelFact[] {
  return [
    {
      label: 'Step result',
      value:
        singers.failureKind === null
          ? singers.status
          : `${singers.status} (${singers.failureKind})`,
    },
    { label: 'Singer ranges', value: countText(singers.rangeCount) },
    { label: 'Phrase rule', value: phraseRuleText(singers.rule) },
    { label: 'Phrase division', value: divisionRuleText(singers.rule) },
  ]
}

function assignmentFacts(singers: SingerSection): PanelFact[] {
  return [
    { label: 'Singers selected', value: selectedSingersText(singers.selected) },
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
    { label: 'Voices made', value: countText(singers.voicesMade) },
  ]
}

function singerSection(singers: SingerSection): PanelSection {
  const text = singerSummary(singers).join(' ')
  if (singers.status === 'option-off' || singers.status === 'no-vocals')
    return section('Singers', { text })
  const { diagnostics } = singers
  return section('Singers', {
    text,
    facts: assignmentFacts(singers),
    details: {
      terms: diagnostics === null ? SINGER_TERMS.slice(-1) : SINGER_TERMS,
      tables: diagnostics === null ? [] : diagnosticTables(diagnostics),
      facts: [
        ...detailFacts(singers),
        ...(diagnostics === null
          ? [{ label: 'Diagnostics', value: 'none: the singer search gave no numbers' }]
          : diagnosticFacts(diagnostics)),
      ],
    },
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

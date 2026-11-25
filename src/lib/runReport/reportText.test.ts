import { describe, expect, it } from 'vitest'
import type { SingerDiagnostics } from '../singers/diagnostics.ts'
import { reportPanel } from './reportPanel.ts'
import { reportToText } from './reportText.ts'
import { buildRunReport, type RunFacts, type RunReport, type SingerSection } from './runReport.ts'

// Labels that no report line contains, so a test can find a leak of a lyrics word.
const LYRIC_WORDS = ['Zyxwvut', 'Quokkaberry', 'MBP', 'Plumbago']

const DIAGNOSTICS: SingerDiagnostics = {
  audioMs: 30_000,
  windowCount: 30,
  framesWithSpeech: 1700,
  sungMs: 28_000,
  embeddingCount: 45,
  droppedEmbeddings: 1,
  settings: {
    threshold: 0.705,
    minGroupSize: 12,
    maxSingers: 12,
    minSingerShare: 0.05,
    minSingerMs: 3000,
  },
  rawGroupCount: 3,
  rawGroups: [
    { group: 0, sungMs: 12_000, embeddingCount: 20, fate: { kind: 'kept', singer: 0 } },
    { group: 1, sungMs: 15_000, embeddingCount: 22, fate: { kind: 'kept', singer: 1 } },
    { group: 2, sungMs: 400, embeddingCount: 2, fate: { kind: 'joined', into: 0, reason: 'time' } },
  ],
  centroidDistances: { min: 0.52, median: 0.81, max: 1.1 },
  finalSingerCount: 2,
  singers: [
    { singer: 0, sungMs: 12_400, rangeCount: 5 },
    { singer: 1, sungMs: 15_000, rangeCount: 4 },
  ],
}

function singers(change: Partial<SingerSection> = {}): SingerSection {
  return {
    status: 'split',
    failureKind: null,
    diagnostics: DIAGNOSTICS,
    rangeCount: 9,
    rule: { secondSingerRatio: 0.8, secondSingerMs: 1000, partMinWords: 1, partMinMs: 1000 },
    phrasesDivided: 3,
    singersWithPhrases: 2,
    phrasesWithNoSinger: 1,
    phrasesWithMoreSingers: 0,
    voicesMade: 2,
    ...change,
  }
}

function facts(change: Partial<RunFacts> = {}): RunFacts {
  return {
    startedAt: '2026-11-25T05:34:05.734Z',
    source: 'browser',
    endpointHost: null,
    mode: 'model',
    speechModel: 'whisper-base',
    device: 'wasm',
    separationModel: 'spleeter',
    separationFallback: true,
    trackCount: 2,
    tracksKept: true,
    singers: singers(),
    voices: [
      { name: 'Lead Vocals', phraseCount: 2, made: false },
      { name: 'Singer 2', phraseCount: 1, made: true },
    ],
    marks: [
      { layer: 'phrase', label: LYRIC_WORDS[0] },
      { layer: 'phrase', label: LYRIC_WORDS[1] },
      { layer: 'word', label: LYRIC_WORDS[0], estimated: true },
      { layer: 'word', label: LYRIC_WORDS[1], unknown: true },
      { layer: 'word', label: LYRIC_WORDS[3] },
      { layer: 'phoneme', label: LYRIC_WORDS[2] },
    ] as (RunFacts['marks'][number] & { label: string })[],
    range: { startMs: 0, endMs: 28_900 },
    frameMs: 50,
    durationsMs: { prepare: 120, separation: 4000, transcribe: 9000 },
    notes: [
      {
        step: 'separation',
        kind: 'memory',
        text: 'separation failed: memory; continued with the fast model',
      },
    ],
    ...change,
  }
}

const START = 'Nov 25, 2026, 12:34:05 AM (2026-11-25 05:34:05 UTC)'

function text(report: RunReport = buildRunReport(facts())): string {
  return reportToText(report, () => START)
}

describe('reportToText', () => {
  const lines = text().trimEnd().split('\n')

  it('starts with the summary of the singer step', () => {
    expect(lines.slice(0, 7)).toEqual([
      'Transcribe run report',
      '',
      '[Summary]',
      'The app found 2 singers and put the phrases on 2 voices.',
      'The app divided 3 phrases where the singer changes.',
      '1 phrase had no singer, so it stays on the voice of the run.',
      'If a phrase is on the wrong voice, use "Move to voice" to correct it.',
    ])
  })

  it('starts each section of the panel with a heading line after an empty line', () => {
    for (const title of reportPanel(buildRunReport(facts()), () => START).map((s) => s.title)) {
      const index = lines.indexOf(`[${title}]`)
      expect(index).toBeGreaterThan(0)
      expect(lines[index - 1]).toBe('')
    }
  })

  it('writes each fact of the panel with the same label and the same unit', () => {
    const report = buildRunReport(facts())
    for (const section of reportPanel(report, () => START)) {
      for (const fact of [...section.facts, ...(section.details?.facts ?? [])])
        expect(lines).toContain(`${fact.label}: ${fact.value}`)
      for (const table of [...section.tables, ...(section.details?.tables ?? [])])
        for (const row of table.rows)
          expect(lines.some((line) => row.every((cell) => line.includes(cell)))).toBe(true)
    }
  })

  it('gives the start time as the local time and the UTC time, as the panel', () => {
    expect(lines).toContain(`Started: ${START}`)
    expect(reportToText(buildRunReport(facts()))).toMatch(
      /\nStarted: .+ \(2026-11-25 05:34:05 UTC\)\n/,
    )
  })

  it('writes the times in seconds as the panel, with each millisecond', () => {
    expect(lines).toContain('Range: 0.0 s to 28.9 s (28.9 s)')
    expect(lines).toContain('Audio: 30.0 s')
    expect(lines).toContain('Short singer limits: 5% of the sung time, 3.0 s')
    expect(lines).toContain('Phrases with no singer: 1')
    expect(lines.some((line) => /Prepare the audio\s+0\.12 s/.test(line))).toBe(true)
  })

  it('keeps each number of the details part for a bug report', () => {
    expect(lines).toContain('Details for a bug report:')
    for (const line of [
      'Windows: 30',
      'Frames with a singer: 1700',
      'Voice prints (embeddings): 45',
      'Voice prints dropped (not finite): 1',
      'Merge threshold: 0.705',
      'Minimum group size: 12 voice prints',
      'Highest count of singers: 12',
      'Centroid distances (smallest / median / largest): 0.52 / 0.81 / 1.1',
      'Groups: 3',
      'Final singers: 2',
      'Singer ranges: 9',
      'Step result: split',
    ])
      expect(lines).toContain(line)
  })

  it('writes the groups as a table with aligned columns', () => {
    const header = lines.find((line) => line.trimStart().startsWith('Group  '))
    const joined = lines.find((line) => line.includes('Joined into group 0: under 3 seconds'))
    expect(header?.indexOf('Result')).toBe(joined?.indexOf('Joined'))
  })

  it('writes the warnings and the voices', () => {
    expect(lines).toContain('separation failed: memory; continued with the fast model')
    expect(lines.some((line) => /Singer 2\s+1\s+yes/.test(line))).toBe(true)
    expect(text().endsWith('\n')).toBe(true)
  })

  it('writes the summary one time only for a step that did not run', () => {
    const off = text(buildRunReport(facts({ singers: singers({ status: 'option-off' }) })))
    expect(off.match(/did not run/g)).toHaveLength(1)
    expect(off).not.toContain('Details for a bug report')
  })

  it('writes "none" for a table with no row', () => {
    const one = text(
      buildRunReport(facts({ singers: singers({ diagnostics: { ...DIAGNOSTICS, singers: [] } }) })),
    )
    expect(one).toContain('The final singers: none\n')
  })

  it('names each voice as the panel does with the present voices of the song', () => {
    const report = buildRunReport(
      facts({
        voices: [
          { name: 'Lead Vocals', phraseCount: 2, made: false, voiceId: 'v1' },
          { name: 'Singer 2', phraseCount: 1, made: true, voiceId: 'v2' },
        ],
      }),
    )
    const voices = [{ id: 'v2', name: 'Test Alto' }]
    const panel = reportPanel(report, () => START, voices).find((s) => s.title === 'Voices')
    const copied = reportToText(report, () => START, voices)
    for (const row of panel?.tables[0]?.rows ?? []) expect(copied).toContain(row[0])
    expect(copied).toContain('Test Alto')
  })

  it('writes no lyrics word, also in the summary', () => {
    const all = text()
    for (const word of LYRIC_WORDS) expect(all).not.toContain(word)
  })
})

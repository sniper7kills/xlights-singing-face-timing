import { describe, expect, it } from 'vitest'
import type { SingerDiagnostics } from '../singers/diagnostics.ts'
import {
  formatSeconds,
  formatStartTime,
  type PanelSection,
  reportFileName,
  reportPanel,
} from './reportPanel.ts'
import type { RunReport, SingerSection } from './runReport.ts'

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
  rawGroupCount: 4,
  rawGroups: [
    { group: 0, sungMs: 12_000, embeddingCount: 20, fate: { kind: 'kept', singer: 0 } },
    { group: 1, sungMs: 15_040, embeddingCount: 22, fate: { kind: 'kept', singer: 1 } },
    { group: 2, sungMs: 400, embeddingCount: 2, fate: { kind: 'joined', into: 0, reason: 'time' } },
    { group: 3, sungMs: 90, embeddingCount: 1, fate: { kind: 'kept', singer: null } },
  ],
  centroidDistances: { min: 0.52, median: 0.81, max: 1.1 },
  finalSingerCount: 2,
  singers: [
    { singer: 0, sungMs: 12_400, rangeCount: 5 },
    { singer: 1, sungMs: 15_040, rangeCount: 4 },
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

function report(change: Partial<RunReport> = {}): RunReport {
  return {
    startedAt: '2026-11-24T10:00:00.000Z',
    build: 'abc1234',
    source: 'browser',
    endpointHost: null,
    mode: 'model',
    speechModel: 'whisper-base',
    device: 'wasm',
    separationModel: 'spleeter',
    separationFallback: false,
    singers: singers(),
    voices: [
      { name: 'Lead Vocals', phraseCount: 2, made: false },
      { name: 'Singer 2', phraseCount: 1, made: true },
    ],
    phraseCount: 3,
    wordCount: 16,
    estimatedCount: 1,
    unknownCount: 2,
    range: { startMs: 1500, endMs: 31_500 },
    frameMs: 50,
    durationsMs: { prepare: 120, separation: 4000, transcribe: 9040 },
    notes: [],
    ...change,
  }
}

function panel(change: Partial<RunReport> = {}): Map<string, PanelSection> {
  const sections = reportPanel(report(change), () => 'started')
  return new Map(sections.map((section) => [section.title, section]))
}

function fact(section: PanelSection | undefined, label: string): string | undefined {
  return section?.facts.find((item) => item.label === label)?.value
}

/** Returns the value of a fact of the details part of the section. */
function detail(section: PanelSection | undefined, label: string): string | undefined {
  return section?.details?.facts.find((item) => item.label === label)?.value
}

describe('formatSeconds', () => {
  it('writes milliseconds as seconds with each millisecond, one decimal or more and the unit', () => {
    expect(formatSeconds(12_340)).toBe('12.34 s')
    expect(formatSeconds(0)).toBe('0.0 s')
    expect(formatSeconds(95_960)).toBe('95.96 s')
    expect(formatSeconds(28_900)).toBe('28.9 s')
    expect(formatSeconds(1)).toBe('0.001 s')
  })
})

describe('formatStartTime', () => {
  it('writes the date and the time in the given locale and time zone, then the UTC time', () => {
    expect(formatStartTime('2026-11-24T10:00:05.734Z', 'en-GB', 'UTC')).toBe(
      '24 Nov 2026, 10:00:05 (2026-11-24 10:00:05 UTC)',
    )
    expect(formatStartTime('2026-11-25T05:34:05.734Z', 'en-US', 'America/New_York')).toBe(
      'Nov 25, 2026, 12:34:05 AM (2026-11-25 05:34:05 UTC)',
    )
  })
})

describe('reportFileName', () => {
  it('names the file after the song and replaces the characters that a file name cannot hold', () => {
    expect(reportFileName('Carol: live')).toBe('Carol_ live - run report.txt')
  })
})

describe('reportPanel', () => {
  it('gives the sections in the order of the panel', () => {
    expect(reportPanel(report(), () => '').map((section) => section.title)).toEqual([
      'Run',
      'Steps',
      'Vocal separation',
      'Singers',
      'Voices',
      'Marks',
      'Notes',
    ])
  })

  it('states the run facts with units, the build and the start time', () => {
    const run = panel().get('Run')
    expect(fact(run, 'Started')).toBe('started')
    expect(fact(run, 'Build')).toBe('abc1234')
    expect(fact(run, 'Source')).toBe('In this browser')
    expect(fact(run, 'Speech model')).toBe('whisper-base')
    expect(fact(run, 'Device')).toBe('WASM (CPU)')
    expect(fact(run, 'Range')).toBe('1.5 s to 31.5 s (30.0 s)')
    expect(fact(run, 'Frame size')).toBe('50 ms')
  })

  it('states the host of a remote run and no device', () => {
    const run = panel({
      source: 'remote',
      endpointHost: 'api.openai.com',
      speechModel: 'whisper-1',
      device: null,
    }).get('Run')
    expect(fact(run, 'Source')).toBe('Remote endpoint')
    expect(fact(run, 'Remote endpoint host')).toBe('api.openai.com')
    expect(fact(run, 'Device')).toBeUndefined()
  })

  it('states a lyrics-only run, a WebGPU run and a report with no build', () => {
    const lyrics = panel({ mode: 'lyrics-only', speechModel: null, device: null }).get('Run')
    expect(fact(lyrics, 'Source')).toBe('Lyrics only, with no speech model')
    expect(fact(lyrics, 'Speech model')).toBeUndefined()
    expect(fact(panel({ device: 'webgpu' }).get('Run'), 'Device')).toBe('WebGPU')
    const older = report()
    delete older.build
    expect(fact(reportPanel(older, () => '')[0], 'Build')).toBe('not known')
  })

  it('names the unknown parts of a remote run', () => {
    const run = panel({
      source: 'remote',
      endpointHost: null,
      speechModel: null,
      device: null,
    }).get('Run')
    expect(fact(run, 'Remote endpoint host')).toBe('not known')
    expect(fact(run, 'Speech model')).toBe('not known')
    expect(fact(panel({ speechModel: null }).get('Run'), 'Speech model')).toBe('not known')
  })

  it('gives each step that ran with its time, and the total', () => {
    expect(panel().get('Steps')?.tables[0]).toEqual({
      caption: 'The time of each step',
      columns: ['Step', 'Time'],
      rows: [
        ['Prepare the audio', '0.12 s'],
        ['Separate the vocals', '4.0 s'],
        ['Transcribe', '9.04 s'],
        ['Total', '13.16 s'],
      ],
    })
    expect(panel({ durationsMs: {} }).get('Steps')).toMatchObject({
      text: 'The report has no step times.',
      tables: [],
    })
  })

  it('states the separation model and the change to the fast model', () => {
    const separation = panel({ separationModel: 'demucs', separationFallback: true }).get(
      'Vocal separation',
    )
    expect(fact(separation, 'Separation model')).toBe('Demucs, experimental')
    expect(fact(separation, 'Changed to the fast model')).toBe('yes')
    expect(fact(panel().get('Vocal separation'), 'Separation model')).toBe('Fast (Spleeter)')
    expect(fact(panel().get('Vocal separation'), 'Changed to the fast model')).toBe('no')
    expect(panel({ separationModel: 'none' }).get('Vocal separation')).toMatchObject({
      text: 'The run did not separate the vocals.',
      facts: [],
    })
  })

  it('states the count of audio tracks and whether the app kept them', () => {
    const kept = panel({ trackCount: 2, tracksKept: true }).get('Vocal separation')
    expect(fact(kept, 'Audio tracks')).toBe('2')
    expect(fact(kept, 'Tracks kept')).toBe('yes')
    expect(
      fact(panel({ trackCount: 2, tracksKept: false }).get('Vocal separation'), 'Tracks kept'),
    ).toBe('no')
    const old = panel().get('Vocal separation')
    expect(fact(old, 'Audio tracks')).toBe('not known')
    expect(fact(old, 'Tracks kept')).toBe('not known')
  })

  it('gives the groups after the clustering with their sung time and result in the details part', () => {
    const groups = panel().get('Singers')?.details?.tables[0]
    expect(groups?.columns).toEqual(['Group', 'Sung time', 'Voice prints', 'Result'])
    expect(groups?.rows).toEqual([
      ['0', '12.0 s', '20', 'Kept as singer 0'],
      ['1', '15.04 s', '22', 'Kept as singer 1'],
      ['2', '0.4 s', '2', 'Joined into group 0: under 3 seconds'],
      ['3', '0.09 s', '1', 'Kept, with no range after the range limits'],
    ])
    expect(panel().get('Singers')?.tables).toEqual([])
  })

  it('explains each term of the details part with one sentence', () => {
    const details = panel().get('Singers')?.details
    const terms = details?.terms.map((term) => term.label)
    expect(terms).toEqual([
      'Voice print (embedding)',
      'Window',
      'Frame with a singer',
      'Sung time',
      'Group',
      'Merge threshold',
      'Centroid distance',
      'Minimum group size',
      'Highest count of singers',
      'Short singer limits',
      'Singer range',
    ])
    for (const term of details?.terms ?? []) {
      // One sentence: one full stop, at the end.
      expect(term.value.split('. ')).toHaveLength(1)
      expect(term.value.endsWith('.')).toBe(true)
      expect(term.value.split(' ').length).toBeLessThanOrEqual(25)
    }
  })

  it('gives the final singers, the limits and the distances', () => {
    const section = panel().get('Singers')
    expect(section?.text).toBe(
      'The app found 2 singers and put the phrases on 2 voices. The app divided 3 phrases where the singer changes. 1 phrase had no singer, so it stays on the voice of the run. If a phrase is on the wrong voice, use "Move to voice" to correct it.',
    )
    expect(section?.details?.tables[1]?.rows).toEqual([
      ['0', '12.4 s', '5'],
      ['1', '15.04 s', '4'],
    ])
    expect(detail(section, 'Windows')).toBe('30')
    expect(detail(section, 'Frames with a singer')).toBe('1700')
    expect(detail(section, 'Voice prints (embeddings)')).toBe('45')
    expect(detail(section, 'Merge threshold')).toBe('0.705')
    expect(detail(section, 'Minimum group size')).toBe('12 voice prints')
    expect(detail(section, 'Short singer limits')).toBe('5% of the sung time, 3.0 s')
    expect(detail(section, 'Centroid distances (smallest / median / largest)')).toBe(
      '0.52 / 0.81 / 1.1',
    )
    expect(detail(section, 'Groups')).toBe('4')
    expect(detail(section, 'Final singers')).toBe('2')
    expect(detail(section, 'Step result')).toBe('split')
    expect(fact(section, 'Voices made')).toBe('2')
    expect(detail(section, 'Phrase rule')).toBe(
      'the singer with the most time; a second singer with 80% of that time and 1 s or more',
    )
    expect(detail(section, 'Phrase division')).toBe(
      'at a change of singer, when each part has 1 word or more and 1 s or more',
    )
    expect(fact(section, 'Phrases divided')).toBe('3')
    expect(fact(section, 'Phrases with no singer')).toBe('1')
    expect(fact(section, 'Phrases with more than one singer (copied to each voice)')).toBe('0')
  })

  it('states that one group has no distances', () => {
    const section = panel({
      singers: singers({ diagnostics: { ...DIAGNOSTICS, centroidDistances: null } }),
    }).get('Singers')
    expect(detail(section, 'Centroid distances (smallest / median / largest)')).toBe(
      'none (fewer than 2 groups)',
    )
  })

  it('shows the summary only for a singer step that did not run', () => {
    expect(panel({ singers: singers({ status: 'option-off' }) }).get('Singers')).toMatchObject({
      text: 'The singer step did not run, because "Put each singer on its own voice" was off. To give each singer a voice, select that option and run again.',
      facts: [],
      tables: [],
      details: null,
    })
  })

  it('states a failed singer step with no diagnostics and the counts that are not known', () => {
    const section = panel({
      singers: singers({
        status: 'failed',
        failureKind: 'memory',
        diagnostics: null,
        rangeCount: null,
        singersWithPhrases: null,
        phrasesWithNoSinger: null,
        phrasesWithMoreSingers: null,
        voicesMade: null,
      }),
    }).get('Singers')
    expect(section?.text).toBe(
      'This browser did not have enough memory to find the singers. The phrases stay on the voice of the run. Run again on a shorter part of the song.',
    )
    expect(section?.details?.tables).toEqual([])
    expect(detail(section, 'Diagnostics')).toBe('none: the singer search gave no numbers')
    expect(detail(section, 'Step result')).toBe('failed (memory)')
    expect(detail(section, 'Singer ranges')).toBe('not known')
    expect(section?.details?.terms.map((term) => term.label)).toEqual(['Singer range'])
    expect(fact(section, 'Singers selected')).toBe('not recorded')
  })

  it('states the choice of "Singers" of the run', () => {
    expect(
      fact(panel({ singers: singers({ selected: 3 }) }).get('Singers'), 'Singers selected'),
    ).toBe('3')
    expect(
      fact(
        panel({ singers: singers({ selected: 'automatic' }) }).get('Singers'),
        'Singers selected',
      ),
    ).toBe('Automatic')
  })

  it('gives the voices with their phrases and the voices that the run made', () => {
    expect(panel().get('Voices')?.tables[0]?.rows).toEqual([
      ['Lead Vocals', '2', 'no'],
      ['Singer 2', '1', 'yes'],
    ])
    expect(panel({ voices: [] }).get('Voices')?.text).toBe('No voice holds phrases of the run.')
  })

  it('shows the present name of each voice of the run and marks a deleted voice', () => {
    const voices = [
      { name: 'Lead Vocals', voiceId: 'v1', phraseCount: 2, made: false },
      { name: 'Singer 2', voiceId: 'v2', phraseCount: 1, made: true },
      { name: 'Singer 3', voiceId: 'v3', phraseCount: 1, made: true },
    ]
    const present = [
      { id: 'v1', name: 'Lead Vocals' },
      { id: 'v2', name: 'Test Alto' },
    ]

    const sections = reportPanel(report({ voices }), () => 'started', present)

    expect(sections.find((item) => item.title === 'Voices')?.tables[0]?.rows).toEqual([
      ['Lead Vocals', '2', 'no'],
      ['Test Alto', '1', 'yes'],
      ['Singer 3 (deleted)', '1', 'yes'],
    ])
  })

  it('shows the names of the report for a report with no voice ids or with no present voices', () => {
    const present = [{ id: 'v1', name: 'Renamed' }]
    const withIds = report({ voices: [{ name: 'Lead Vocals', voiceId: 'v1', phraseCount: 2 }] })

    expect(
      reportPanel(report(), () => 'started', present).find((item) => item.title === 'Voices')
        ?.tables[0]?.rows[0]?.[0],
    ).toBe('Lead Vocals')
    expect(
      reportPanel(withIds, () => 'started').find((item) => item.title === 'Voices')?.tables[0]
        ?.rows[0]?.[0],
    ).toBe('Lead Vocals')
  })

  it('gives the counts of the marks', () => {
    const marks = panel().get('Marks')
    expect(marks?.facts).toEqual([
      { label: 'Phrases', value: '3' },
      { label: 'Words', value: '16' },
      { label: 'Estimated words', value: '1' },
      { label: 'Unknown words', value: '2' },
      { label: 'Lyrics lines left out', value: 'not known' },
      { label: 'Words left out', value: 'not known' },
    ])
  })

  it('gives the counts of the lyrics lines and the words that the run left out', () => {
    const marks = panel({ linesLeftOut: 115, wordsLeftOut: 3 }).get('Marks')
    expect(marks?.facts?.slice(-2)).toEqual([
      { label: 'Lyrics lines left out', value: '115' },
      { label: 'Words left out', value: '3' },
    ])
  })

  it('lists each warning and failure, or states that the run had none', () => {
    const text = 'separation failed: memory; continued with the fast model'
    expect(
      panel({ notes: [{ step: 'separation', kind: 'memory', text }] }).get('Notes')?.items,
    ).toEqual([text])
    expect(panel().get('Notes')?.text).toBe('The run had no warning and no failure.')
  })
})

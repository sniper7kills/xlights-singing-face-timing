import { describe, expect, it } from 'vitest'
import type { SingerDiagnostics } from '../singers/diagnostics.ts'
import {
  alignedTable,
  buildRunReport,
  createStepClock,
  reportToText,
  type RunFacts,
  type SingerSection,
  voicePhrases,
} from './runReport.ts'

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
    shareThreshold: 0.3,
    singersWithPhrases: 2,
    phrasesWithNoSinger: 1,
    phrasesWithMoreSingers: 0,
    voicesMade: 2,
    ...change,
  }
}

function facts(change: Partial<RunFacts> = {}): RunFacts {
  return {
    startedAt: '2026-11-24T10:00:00.000Z',
    source: 'browser',
    endpointHost: null,
    mode: 'model',
    speechModel: 'whisper-base',
    device: 'wasm',
    separationModel: 'spleeter',
    separationFallback: false,
    singers: singers(),
    voices: [
      { name: 'Lead Vocals', phraseCount: 2 },
      { name: 'Singer 2', phraseCount: 1 },
    ],
    marks: [
      { layer: 'phrase', label: LYRIC_WORDS[0] },
      { layer: 'phrase', label: LYRIC_WORDS[1] },
      { layer: 'word', label: LYRIC_WORDS[0], estimated: true },
      { layer: 'word', label: LYRIC_WORDS[1], unknown: true },
      { layer: 'word', label: LYRIC_WORDS[3] },
      { layer: 'phoneme', label: LYRIC_WORDS[2] },
    ] as (RunFacts['marks'][number] & { label: string })[],
    range: { startMs: 0, endMs: 30_000 },
    frameMs: 50,
    durationsMs: { prepare: 120, separation: 4000, transcribe: 9000 },
    notes: [],
    ...change,
  }
}

describe('buildRunReport', () => {
  it('counts the phrases, the words, the estimated words and the unknown words', () => {
    const report = buildRunReport(facts())
    expect(report.phraseCount).toBe(2)
    expect(report.wordCount).toBe(3)
    expect(report.estimatedCount).toBe(1)
    expect(report.unknownCount).toBe(1)
  })

  it('copies the singer section and the voices', () => {
    const report = buildRunReport(facts())
    expect(report.singers).toEqual(singers())
    expect(report.voices).toHaveLength(2)
  })

  it('copies the build when the facts have one, and adds no build field otherwise', () => {
    expect(buildRunReport(facts({ build: 'abc1234' })).build).toBe('abc1234')
    expect('build' in buildRunReport(facts())).toBe(false)
  })

  it('copies no label of a mark into the report', () => {
    const json = JSON.stringify(buildRunReport(facts()))
    for (const word of LYRIC_WORDS) expect(json).not.toContain(word)
    expect(json).not.toContain('marks')
  })
})

describe('reportToText', () => {
  const text = reportToText(
    buildRunReport(
      facts({
        separationFallback: true,
        notes: [
          {
            step: 'separation',
            kind: 'memory',
            text: 'separation failed: memory; continued with the fast model',
          },
        ],
      }),
    ),
  )
  const lines = text.trimEnd().split('\n')

  it('starts each section with a heading line after an empty line', () => {
    for (const heading of [
      '[Run]',
      '[Counts]',
      '[Singers]',
      '[Step times]',
      '[Warnings and failures]',
    ]) {
      const index = lines.indexOf(heading)
      expect(index).toBeGreaterThan(0)
      expect(lines[index - 1]).toBe('')
    }
  })

  it('writes one fact with its unit on each line', () => {
    expect(lines).toContain('Source: browser')
    expect(lines).toContain('Remote endpoint host: none')
    expect(lines).toContain('Speech model: whisper-base')
    expect(lines).toContain('Separation model: spleeter')
    expect(lines).toContain('Changed to the fast model: yes')
    expect(lines).toContain('Words: 3')
    expect(lines).toContain('Range: 0 ms to 30000 ms (30000 ms)')
    expect(lines).toContain('Frame size: 50 ms')
    expect(lines).toContain('Separate the vocals: 4000 ms')
    expect(lines).toContain('"Singer 2": 1 phrases')
    expect(lines).toContain('separation failed: memory; continued with the fast model')
    expect(text.endsWith('\n')).toBe(true)
  })

  it('writes the singer diagnostics and what the app did with them', () => {
    expect(lines).toContain('Step: split')
    expect(lines).toContain('Embeddings dropped (not finite): 1')
    expect(lines).toContain('Merge threshold: 0.705')
    expect(lines).toContain('Short singer limits: 5% of the sung time, 3000 ms')
    expect(lines).toContain('Centroid distances (smallest / median / largest): 0.52 / 0.81 / 1.1')
    expect(lines).toContain('Raw groups: 3')
    expect(lines).toContain('Final singers: 2')
    expect(lines).toContain('Phrase share for a singer: 30% of the phrase length')
    expect(lines).toContain('Phrases with no singer range: 1')
    expect(lines).toContain('Voices made: 2')
  })

  it('writes the raw groups as a table with aligned columns', () => {
    const header = lines.find((line) => line.trimStart().startsWith('group'))
    const joined = lines.find((line) => line.includes('joined group 0: under 3 seconds'))
    expect(header).toBeDefined()
    expect(joined).toBeDefined()
    expect(header?.indexOf('result')).toBe(joined?.indexOf('joined'))
    expect(lines.some((line) => line.includes('kept as singer 1'))).toBe(true)
  })

  it('writes the step and its cause after a failed singer step, with no diagnostics', () => {
    const failed = reportToText(
      buildRunReport(
        facts({
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
        }),
      ),
    )
    expect(failed).toContain('Step: failed (memory)\nDiagnostics: none\n')
    expect(failed).toContain('Voices made: not known\n')
  })

  it('writes only the step when the singer option is off', () => {
    const off = reportToText(buildRunReport(facts({ singers: singers({ status: 'option-off' }) })))
    expect(off).toContain('[Singers]\nStep: option-off\n\n')
  })

  it('writes a kept group with no range and no distances for one raw group', () => {
    const one = reportToText(
      buildRunReport(
        facts({
          singers: singers({
            diagnostics: {
              ...DIAGNOSTICS,
              rawGroups: [
                { group: 0, sungMs: 10, embeddingCount: 1, fate: { kind: 'kept', singer: null } },
              ],
              centroidDistances: null,
              singers: [],
            },
          }),
        }),
      ),
    )
    expect(one).toContain('kept, no range after the range limits')
    expect(one).toContain('none (fewer than 2 raw groups)')
  })

  it('names the host of a remote run, a lyrics-only run and no step times', () => {
    const remote = reportToText(
      buildRunReport(facts({ source: 'remote', endpointHost: 'api.openai.com', device: null })),
    )
    expect(remote).toContain('Remote endpoint host: api.openai.com\n')
    expect(remote).toContain('Device: none\n')
    const lyrics = reportToText(
      buildRunReport(facts({ mode: 'lyrics-only', speechModel: null, durationsMs: {} })),
    )
    expect(lyrics).toContain('Mode: lyrics only\nSpeech model: none\n')
    expect(lyrics).toContain('[Step times]\nnone\n')
  })

  it('writes the build, or "not known" for a report with no build', () => {
    expect(lines).toContain('Build: not known')
    const built = reportToText(buildRunReport(facts({ build: 'abc1234' })))
    expect(built).toContain('[Run]\nBuild: abc1234\n')
  })

  it('marks each voice that the run made', () => {
    const made = reportToText(
      buildRunReport(
        facts({
          voices: [
            { name: 'Lead Vocals', phraseCount: 2, made: false },
            { name: 'Singer 2', phraseCount: 1, made: true },
          ],
        }),
      ),
    )
    expect(made).toContain('"Lead Vocals": 2 phrases\n"Singer 2": 1 phrases, made by the run\n')
  })

  it('writes no lyrics word', () => {
    for (const word of LYRIC_WORDS) expect(text).not.toContain(word)
  })
})

describe('alignedTable', () => {
  it('pads each column but the last to its widest cell', () => {
    expect(
      alignedTable([
        ['a', 'bb', 'c'],
        ['ddd', 'e', 'ff'],
      ]),
    ).toEqual(['  a    bb  c', '  ddd  e   ff'])
  })
})

describe('createStepClock', () => {
  it('adds the time of each step, and adds both times of a step that starts two times', () => {
    let now = 0
    const clock = createStepClock(() => now)
    clock.enter('prepare')
    now = 100.4
    clock.enter('modelLoad')
    now = 300
    clock.enter('prepare')
    now = 350
    clock.enter(null)
    now = 1000
    expect(clock.durations()).toEqual({ prepare: 150, modelLoad: 200 })
  })

  it('gives no time for a step that has not ended', () => {
    const clock = createStepClock(() => 5)
    clock.enter('transcribe')
    expect(clock.durations()).toEqual({})
  })
})

describe('voicePhrases', () => {
  it('counts the phrases that start in the range on each voice', () => {
    const marks = [
      { voiceId: 'a', layer: 'phrase', startMs: 0 },
      { voiceId: 'a', layer: 'phrase', startMs: 5000 },
      { voiceId: 'a', layer: 'word', startMs: 0 },
      { voiceId: 'b', layer: 'phrase', startMs: 900 },
      { voiceId: 'b', layer: 'phrase', startMs: 2000 },
    ]
    expect(
      voicePhrases(
        [
          { id: 'a', name: 'Lead' },
          { id: 'b', name: 'Harmony' },
        ],
        marks,
        { startMs: 0, endMs: 2000 },
        ['b'],
      ),
    ).toEqual([
      { name: 'Lead', phraseCount: 1, made: false },
      { name: 'Harmony', phraseCount: 1, made: true },
    ])
  })
})

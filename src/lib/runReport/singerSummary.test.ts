import { describe, expect, it } from 'vitest'
import type { RawGroup, SingerDiagnostics } from '../singers/diagnostics.ts'
import type { SingerSection } from './runReport.ts'
import { singerSummary } from './singerSummary.ts'

const SETTINGS: SingerDiagnostics['settings'] = {
  threshold: 0.7,
  minGroupSize: 12,
  maxSingers: 12,
  minSingerShare: 0.05,
  minSingerMs: 3000,
}

function diagnostics(change: Partial<SingerDiagnostics> = {}): SingerDiagnostics {
  return {
    audioMs: 30_000,
    windowCount: 30,
    framesWithSpeech: 1700,
    sungMs: 28_000,
    embeddingCount: 45,
    droppedEmbeddings: 0,
    settings: SETTINGS,
    rawGroupCount: 2,
    rawGroups: [
      { group: 0, sungMs: 14_000, embeddingCount: 22, fate: { kind: 'kept', singer: 0 } },
      { group: 1, sungMs: 14_000, embeddingCount: 23, fate: { kind: 'kept', singer: 1 } },
    ],
    centroidDistances: { min: 0.9, median: 0.9, max: 0.9 },
    finalSingerCount: 2,
    singers: [
      { singer: 0, sungMs: 14_000, rangeCount: 3 },
      { singer: 1, sungMs: 14_000, rangeCount: 3 },
    ],
    ...change,
  }
}

function singers(change: Partial<SingerSection> = {}): SingerSection {
  return {
    status: 'split',
    failureKind: null,
    diagnostics: diagnostics(),
    rangeCount: 6,
    phrasesDivided: 0,
    singersWithPhrases: 2,
    phrasesWithNoSinger: 0,
    phrasesWithMoreSingers: 0,
    voicesMade: 2,
    selected: 'automatic',
    ...change,
  }
}

/** The one large group and the small group of a search that found one singer. */
const ONE_LARGE: RawGroup[] = [
  { group: 0, sungMs: 26_000, embeddingCount: 40, fate: { kind: 'kept', singer: 0 } },
  {
    group: 1,
    sungMs: 2000,
    embeddingCount: 5,
    fate: { kind: 'joined', into: 0, reason: 'small-group' },
  },
]

describe('singerSummary', () => {
  it('states that the step did not run with the option off, and how to turn it on', () => {
    expect(singerSummary(singers({ status: 'option-off', diagnostics: null }))).toEqual([
      'The singer step did not run, because "Put each singer on its own voice" was off.',
      'To give each singer a voice, select that option and run again.',
    ])
  })

  it('states that the step did not run with no separated vocals, and the next action', () => {
    expect(singerSummary(singers({ status: 'no-vocals', diagnostics: null }))).toEqual([
      'The singer step did not run, because the run had no separated vocals.',
      'Select "Separate the vocals first" and run again.',
    ])
  })

  it.each([
    [
      'download',
      'The app could not download the singer model. The phrases stay on the voice of the run.',
      'Check the connection and run again.',
    ],
    [
      'memory',
      'This browser did not have enough memory to find the singers. The phrases stay on the voice of the run.',
      'Run again on a shorter part of the song.',
    ],
    [
      'model',
      'The singer step failed (model). The phrases stay on the voice of the run.',
      'Run again. If the step fails again, copy this report into a bug report.',
    ],
    [
      null,
      'The singer step failed (cause not known). The phrases stay on the voice of the run.',
      'Run again. If the step fails again, copy this report into a bug report.',
    ],
  ])(
    'states a failed step of the kind %s with its cause and the next action',
    (kind, cause, next) => {
      expect(
        singerSummary(singers({ status: 'failed', failureKind: kind, diagnostics: null })),
      ).toEqual([cause, next])
    },
  )

  it('states a cancelled step', () => {
    expect(singerSummary(singers({ status: 'cancelled', diagnostics: null }))).toEqual([
      'You stopped the singer step. The phrases stay on the voice of the run.',
      'Run again to find the singers.',
    ])
  })

  it('states a step that found more singers than the free voices of the song', () => {
    const capped = singers({
      status: 'capped',
      diagnostics: diagnostics({ finalSingerCount: 5 }),
      voicesMade: 3,
    })
    expect(singerSummary(capped)).toEqual([
      'The app found 5 singers, more than the song has free voices. A song has 12 voices at most.',
      'The singers with no free voice stay on the voice of the run.',
      'Delete the voices that you do not use, and run again.',
    ])
  })

  it('states one singer with "Automatic", because the parts of the other singers were short', () => {
    const one = singers({
      status: 'one-singer',
      diagnostics: diagnostics({
        rawGroups: ONE_LARGE,
        centroidDistances: { min: 0.95, median: 0.95, max: 0.95 },
        finalSingerCount: 1,
      }),
      voicesMade: 1,
    })
    expect(singerSummary(one)).toEqual([
      'The app found 1 singer, so all phrases stay on one voice.',
      'The app found 2 groups of voice prints, but the parts of other singers were short. So the app joined them with the first singer.',
      'If the song has more singers, select the count in "Singers" and run again.',
    ])
  })

  it('states one singer with "Automatic", because the singers sound alike', () => {
    const alike = singers({
      status: 'one-singer',
      diagnostics: diagnostics({
        rawGroups: [
          { group: 0, sungMs: 14_000, embeddingCount: 22, fate: { kind: 'kept', singer: 0 } },
          {
            group: 1,
            sungMs: 14_000,
            embeddingCount: 23,
            fate: { kind: 'joined', into: 0, reason: 'cap' },
          },
        ],
        centroidDistances: { min: 0.4, median: 0.4, max: 0.4 },
        finalSingerCount: 1,
      }),
    })
    expect(singerSummary(alike)[1]).toBe(
      'The singers sound alike to the app, so the app joined them into one singer.',
    )
  })

  it('states one singer with one group of voice prints, and with no diagnostics', () => {
    const oneGroup = singers({
      status: 'one-singer',
      diagnostics: diagnostics({
        rawGroupCount: 1,
        rawGroups: [ONE_LARGE[0] as RawGroup],
        centroidDistances: null,
        finalSingerCount: 1,
      }),
    })
    expect(singerSummary(oneGroup)[1]).toBe(
      'All voice prints of the song are close to each other. If the song has more singers, they sound alike to the app.',
    )
    expect(singerSummary(singers({ status: 'one-singer', diagnostics: null }))).toEqual([
      'The app found 1 singer, so all phrases stay on one voice.',
      'If the song has more singers, select the count in "Singers" and run again.',
    ])
  })

  it('states one singer with a selected count, and names "Move to voice"', () => {
    const one = singers({ status: 'one-singer', selected: 2, diagnostics: null })
    expect(singerSummary(one)).toEqual([
      'The app found 1 singer, and you selected 2. All phrases stay on one voice.',
      'If a phrase is on the wrong voice, use "Move to voice" to correct it.',
    ])
  })

  it('states more groups than the count that the person selected', () => {
    const cut = singers({
      selected: 2,
      diagnostics: diagnostics({ rawGroupCount: 3 }),
    })
    expect(singerSummary(cut)).toEqual([
      'The app found 2 singers and put the phrases on 2 voices.',
      'The app found 3 groups of voice prints, and you selected 2. The app joined the groups that sound most alike.',
      'If a phrase is on the wrong voice, use "Move to voice" to correct it.',
    ])
  })

  it('states a clean split', () => {
    expect(singerSummary(singers())).toEqual([
      'The app found 2 singers and put the phrases on 2 voices.',
      'If a phrase is on the wrong voice, use "Move to voice" to correct it.',
    ])
  })

  it('states the divided phrases, the copied phrases and the phrases with no singer', () => {
    const divided = singers({
      phrasesDivided: 1,
      phrasesWithMoreSingers: 2,
      phrasesWithNoSinger: 3,
    })
    expect(singerSummary(divided)).toEqual([
      'The app found 2 singers and put the phrases on 2 voices.',
      'The app divided 1 phrase where the singer changes.',
      '2 phrases had more than one singer, so each voice of those singers got a copy.',
      '3 phrases had no singer, so they stay on the voice of the run.',
      'If a phrase is on the wrong voice, use "Move to voice" to correct it.',
    ])
  })

  it('states a split of a report with no counts', () => {
    const old = singers({ diagnostics: null, singersWithPhrases: null, voicesMade: null })
    expect(singerSummary(old)[0]).toBe('The app put the phrases on the voices of the singers.')
    const capped = singers({ status: 'capped', diagnostics: null, singersWithPhrases: null })
    expect(singerSummary(capped)[0]).toBe(
      'The app found more singers than the song has free voices.',
    )
  })

  it('keeps each sentence to 25 words or fewer', () => {
    const reports = [
      singers({ phrasesDivided: 1, phrasesWithMoreSingers: 2, phrasesWithNoSinger: 3 }),
      singers({ status: 'one-singer', diagnostics: diagnostics({ rawGroups: ONE_LARGE }) }),
      singers({ selected: 2, diagnostics: diagnostics({ rawGroupCount: 3 }) }),
    ]
    for (const report of reports)
      for (const sentence of singerSummary(report).flatMap((line) => line.split('. ')))
        expect(sentence.split(' ').length).toBeLessThanOrEqual(25)
  })
})

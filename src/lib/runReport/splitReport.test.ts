import { describe, expect, it } from 'vitest'
import { runArchiveFiles } from '../songArchive/runFiles.ts'
import { makeReport, makeTrack } from './report.test-helpers.ts'
import { reportPanel, SPLIT_SINGERS_TEXT, SPLIT_SUMMARY } from './reportPanel.ts'
import { reportToText } from './reportText.ts'
import { stepTimes } from './runReport.ts'

const SPLIT_REPORT = makeReport({
  split: {
    mode: 'male-female',
    tracks: [
      { label: 'female', voiceName: 'Female', wordCount: 9 },
      { label: 'male', voiceName: 'Male', wordCount: 7 },
    ],
  },
})

describe('the run report of a singer split', () => {
  it('shows the mode, and each singer track with its voice and its count of words', () => {
    const section = reportPanel(SPLIT_REPORT).find((item) => item.title === 'Singer split')

    expect(section?.facts).toEqual([{ label: 'Split mode', value: 'Male and female' }])
    expect(section?.tables[0]?.rows).toEqual([
      ['1', 'Female', '9', 'not known'],
      ['2', 'Male', '7', 'not known'],
    ])
  })

  it('shows the removed words of each singer track, and "Silent track" for a silent track', () => {
    const report = makeReport({
      split: {
        mode: 'male-female',
        tracks: [
          { label: 'female', voiceName: '', wordCount: 0, removedCount: null },
          { label: 'male', voiceName: 'Male', wordCount: 16, removedCount: 3 },
        ],
      },
    })

    const section = reportPanel(report).find((item) => item.title === 'Singer split')

    expect(section?.tables[0]?.columns).toEqual(['Track', 'Voice', 'Words', 'Removed words'])
    expect(section?.tables[0]?.rows).toEqual([
      ['1', 'No voice', '0', 'Silent track'],
      ['2', 'Male', '16', '3'],
    ])
  })

  it('shows "No voice" and 0 words for a singer track with no words', () => {
    const report = makeReport({
      split: {
        mode: 'male-female',
        tracks: [
          { label: 'female', voiceName: 'Female', wordCount: 9 },
          { label: 'male', voiceName: '', wordCount: 0 },
        ],
      },
    })

    const section = reportPanel(report).find((item) => item.title === 'Singer split')

    expect(section?.tables[0]?.rows).toEqual([
      ['1', 'Female', '9', 'not known'],
      ['2', 'No voice', '0', 'not known'],
    ])
  })

  it('puts the section in the copied text', () => {
    const text = reportToText(SPLIT_REPORT, () => 'now')

    expect(text).toContain(`[Summary]\n${SPLIT_SUMMARY}\n`)
    expect(text).toContain('Split mode: Male and female')
    expect(text).toContain(`[Singers]\n${SPLIT_SINGERS_TEXT}`)
  })

  it('has no split section for a run with no split', () => {
    expect(reportPanel(makeReport()).map((item) => item.title)).not.toContain('Singer split')
  })

  it('names the two steps of the split in the step times, after the vocal separation', () => {
    const steps = stepTimes({ separation: 1, splitDownload: 2, split: 3, modelLoad: 4 })

    expect(steps.map((step) => step.text)).toEqual([
      'Separate the vocals',
      'Load the singer split model',
      'Split the singers',
      'Load the speech model',
    ])
  })

  it('adds the singer tracks to the zip file', () => {
    const tracks = {
      vocals: makeTrack(2),
      instruments: makeTrack(2),
      split: [makeTrack(3), makeTrack(4)],
    }

    const files = runArchiveFiles({ songId: 's', tracks, singerSegments: [], report: SPLIT_REPORT })

    expect(files.map((file) => file.fileName)).toEqual([
      'vocals.wav',
      'instruments.wav',
      'singer-1.wav',
      'singer-2.wav',
      'report.txt',
    ])
    expect(files[3]?.data).toHaveLength(44 + 8)
  })
})

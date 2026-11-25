import { describe, expect, it } from 'vitest'
import { emptyUnselectedVoices, selectedExportVoices } from './voiceSelection.ts'

const ALL = ['lead', 'backing']

describe('selectedExportVoices', () => {
  it('does not select a new voice with no marks, and the export stores it as empty', () => {
    expect(selectedExportVoices(['lead'], { voiceIds: ['lead'], knownVoiceIds: ['lead'] })).toEqual(
      ['lead'],
    )
    expect(emptyUnselectedVoices(ALL, ['lead'], ['lead'])).toEqual(['backing'])
  })

  it('selects the same voice again after it gets marks', () => {
    const stored = { voiceIds: ['lead'], knownVoiceIds: ALL, emptyVoiceIds: ['backing'] }

    expect(selectedExportVoices(ALL, stored)).toEqual(ALL)
  })

  it('keeps a voice with marks cleared when the person cleared it', () => {
    const stored = { voiceIds: ['lead'], knownVoiceIds: ALL, emptyVoiceIds: [] }

    expect(selectedExportVoices(ALL, stored)).toEqual(['lead'])
    expect(emptyUnselectedVoices(ALL, ALL, ['lead'])).toEqual([])
  })

  it('reads stored options of the old shape, with no empty voices, by the earlier rule', () => {
    expect(selectedExportVoices(ALL, { voiceIds: ['lead'], knownVoiceIds: ALL })).toEqual(['lead'])
    expect(selectedExportVoices(ALL, { voiceIds: ['lead'], knownVoiceIds: ['lead'] })).toEqual(ALL)
  })

  it('selects no voice with marks when the person cleared every voice', () => {
    expect(
      selectedExportVoices(ALL, { voiceIds: [], knownVoiceIds: ALL, emptyVoiceIds: [] }),
    ).toEqual([])
  })

  it('never selects a voice with no marks, also when the previous export selected it', () => {
    expect(selectedExportVoices(['lead'], { voiceIds: ALL, knownVoiceIds: ALL })).toEqual(['lead'])
  })
})

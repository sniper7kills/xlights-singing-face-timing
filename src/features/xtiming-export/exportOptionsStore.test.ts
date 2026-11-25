import { describe, expect, it } from 'vitest'
import { saveExportOptions } from '../../store/db.ts'
import { loadSongExportOptions, storedExportOptions } from './exportOptionsStore.ts'
import {
  makeContent,
  makeSection,
  makeSungPhrase,
  makeVoice,
} from './exportFixtures.test-helpers.ts'

const lead = makeVoice('v1', 'Lead Vocals', 0)
const santa = makeVoice('v2', 'Santa', 1)
const elf = makeVoice('v3', 'Elf Choir', 2)
const defaults = {
  voiceIds: [],
  grouping: 'voice',
  packaging: 'one-file',
  writeRest: false,
  trackNames: {},
} as const

/** One phrase for each of the voices, so each voice has marks. */
function sung(...voiceIds: string[]) {
  return voiceIds.flatMap((id, index) => makeSungPhrase(id, index * 2000))
}

describe('loadSongExportOptions', () => {
  it('selects every voice with one timing track for each voice in one file for a first export', async () => {
    expect(await loadSongExportOptions(makeContent([lead, santa], sung('v1', 'v2')))).toEqual({
      voiceIds: ['v1', 'v2'],
      grouping: 'voice',
      packaging: 'one-file',
      writeRest: false,
      trackNames: {},
    })
  })

  it('opens with the options of the previous export of the song', async () => {
    const previous = {
      voiceIds: ['v2'],
      grouping: 'voice-section',
      packaging: 'file-per-track',
      writeRest: true,
      trackNames: { v2: 'Elf' },
    } as const
    await saveExportOptions('song-1', {
      ...previous,
      voiceIds: ['v2'],
      knownVoiceIds: ['v1', 'v2'],
    })

    const content = makeContent([lead, santa], sung('v1', 'v2'), [
      makeSection('s1', 'Verse', 0, 5000),
    ])
    expect(await loadSongExportOptions(content)).toEqual(previous)
  })

  it('removes a deleted voice and uses grouping by voice when the song has no sections', async () => {
    await saveExportOptions('song-1', {
      voiceIds: ['v1', 'gone'],
      grouping: 'voice-section',
      packaging: 'one-file',
      writeRest: false,
      trackNames: {},
      knownVoiceIds: ['v1', 'gone'],
    })

    const options = await loadSongExportOptions(makeContent([lead], sung('v1')))

    expect(options.voiceIds).toEqual(['v1'])
    expect(options.grouping).toBe('voice')
  })

  it('selects a voice that the person added after the previous export', async () => {
    await saveExportOptions('song-1', {
      voiceIds: ['v1'],
      grouping: 'voice',
      packaging: 'one-file',
      writeRest: false,
      trackNames: {},
      knownVoiceIds: ['v1', 'v2'],
    })

    const options = await loadSongExportOptions(
      makeContent([lead, santa, elf], sung('v1', 'v2', 'v3')),
    )

    expect(options.voiceIds).toEqual(['v1', 'v3'])
  })

  it('selects a voice that the last export left out with no marks after the voice gets marks', async () => {
    const before = makeContent([lead, santa], sung('v1'))
    const first = await loadSongExportOptions(before)
    await saveExportOptions('song-1', storedExportOptions(before, first))

    const options = await loadSongExportOptions(makeContent([lead, santa], sung('v1', 'v2')))

    expect(options.voiceIds).toEqual(['v1', 'v2'])
  })

  it('keeps a voice with marks cleared after the person cleared it', async () => {
    const content = makeContent([lead, santa], sung('v1', 'v2'))
    await saveExportOptions(
      'song-1',
      storedExportOptions(content, { ...defaults, voiceIds: ['v1'] }),
    )

    expect((await loadSongExportOptions(content)).voiceIds).toEqual(['v1'])
  })

  it('does not select a voice with no marks for a first export', async () => {
    const options = await loadSongExportOptions(makeContent([lead, santa], sung('v1')))

    expect(options.voiceIds).toEqual(['v1'])
  })

  it('does not select a new voice with no marks or a stored voice that has no marks now', async () => {
    await saveExportOptions('song-1', {
      voiceIds: ['v1', 'v2'],
      grouping: 'voice',
      packaging: 'one-file',
      writeRest: false,
      trackNames: {},
      knownVoiceIds: ['v1', 'v2'],
    })

    const options = await loadSongExportOptions(makeContent([lead, santa, elf], sung('v1')))

    expect(options.voiceIds).toEqual(['v1'])
  })

  it('removes the names of the timing tracks of a deleted voice and of a deleted section', async () => {
    await saveExportOptions('song-1', {
      voiceIds: ['v1'],
      grouping: 'voice-section',
      packaging: 'one-file',
      writeRest: false,
      trackNames: {
        v1: 'Soloist',
        'v1:s1': 'Soloist verse',
        'v1:Unsectioned': 'Soloist other',
        'v1:gone': 'Soloist bridge',
        gone: 'Elf',
        'gone:s1': 'Elf verse',
      },
      knownVoiceIds: ['v1', 'gone'],
    })

    const content = makeContent([lead], [], [makeSection('s1', 'Verse', 0, 5000)])
    const options = await loadSongExportOptions(content)

    expect(options.trackNames).toEqual({
      v1: 'Soloist',
      'v1:s1': 'Soloist verse',
      'v1:Unsectioned': 'Soloist other',
    })
  })
})

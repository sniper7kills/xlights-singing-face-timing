import { describe, expect, it } from 'vitest'
import { saveExportOptions } from '../../store/db.ts'
import { loadSongExportOptions } from './exportOptionsStore.ts'
import { makeContent, makeSection, makeVoice } from './exportFixtures.test-helpers.ts'

const lead = makeVoice('v1', 'Lead Vocals', 0)
const santa = makeVoice('v2', 'Santa', 1)

describe('loadSongExportOptions', () => {
  it('selects every voice with one timing track for each voice in one file for a first export', async () => {
    expect(await loadSongExportOptions(makeContent([lead, santa], []))).toEqual({
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
    await saveExportOptions('song-1', { ...previous, voiceIds: ['v2'] })

    const content = makeContent([lead, santa], [], [makeSection('s1', 'Verse', 0, 5000)])
    expect(await loadSongExportOptions(content)).toEqual(previous)
  })

  it('removes a deleted voice and uses grouping by voice when the song has no sections', async () => {
    await saveExportOptions('song-1', {
      voiceIds: ['v1', 'gone'],
      grouping: 'voice-section',
      packaging: 'one-file',
      writeRest: false,
      trackNames: {},
    })

    const options = await loadSongExportOptions(makeContent([lead], []))

    expect(options.voiceIds).toEqual(['v1'])
    expect(options.grouping).toBe('voice')
  })
})

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WaveSurfer from 'wavesurfer.js'
import * as db from '../../store/db.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { Waveform } from './Waveform.tsx'

// This file keeps the real waveformPlayer.ts and replaces only wavesurfer.js.
vi.mock('wavesurfer.js', () => ({ default: { create: vi.fn() } }))

const audio = {
  data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' }),
  fileName: 'carol.ogg',
  mimeType: 'audio/ogg',
}

let destroy: ReturnType<typeof vi.fn>

beforeEach(() => {
  // jsdom has no Web Audio. This decode passes, so a later failure comes from wavesurfer.js.
  vi.stubGlobal(
    'AudioContext',
    class {
      decodeAudioData = () =>
        Promise.resolve({
          duration: 3,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array([0, 0.5, -0.5]),
        })
      close = () => Promise.resolve()
    },
  )
  destroy = vi.fn()
  vi.mocked(WaveSurfer.create).mockReturnValue({
    on: vi.fn(),
    loadBlob: vi.fn(() => Promise.reject(new DOMException('bad media', 'NotSupportedError'))),
    destroy,
  } as unknown as WaveSurfer)
})

afterEach(() => {
  vi.mocked(WaveSurfer.create).mockReset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Waveform with a wavesurfer.js load failure', () => {
  it('shows the decode message when wavesurfer.js cannot load the decoded audio', async () => {
    const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
    // The IndexedDB fake of the tests returns a copy of the Blob without its methods.
    vi.spyOn(db, 'getAudioFile').mockResolvedValue({
      songId: song.id,
      ...audio,
      byteLength: audio.data.size,
    })

    render(<Waveform songId={song.id} durationMs={3000} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This browser cannot decode this file. Convert it to MP3 or WAV and try again.',
    )
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(destroy).toHaveBeenCalled()
  })
})

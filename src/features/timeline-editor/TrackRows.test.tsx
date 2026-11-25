import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunReport } from '../../lib/runReport/runReport.ts'
import { saveRunData } from '../../store/db.ts'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useTrackMixStore } from '../../store/trackMixStore.ts'
import type { KeptTracks, RunData } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { storeNewSong } from '../audio-import/storeNewSong.ts'
import { attachPlayer, detachPlayer } from './playerStore.ts'
import { Waveform } from './Waveform.tsx'
import { createWaveformPlayer, type WaveformPlayer } from './waveformPlayer.ts'

vi.mock('./waveformPlayer.ts', () => ({ createWaveformPlayer: vi.fn() }))

const audio = {
  data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' }),
  fileName: 'carol.ogg',
  mimeType: 'audio/ogg',
}

const TRACKS: KeptTracks = {
  vocals: { startMs: 0, sampleRate: 100, samples: Int16Array.from({ length: 300 }, (_, i) => i) },
  instruments: { startMs: 1000, sampleRate: 100, samples: new Int16Array(100) },
}

/** The media element of the song audio. jsdom has no media, so the test sets its play state. */
let leader: HTMLAudioElement
/** The row of each audio element that got a `play` call, in call order. */
let played: string[]
let blobs: Blob[]

function setMedia(
  media: HTMLMediaElement,
  values: { paused?: boolean; currentTime?: number; preservesPitch?: boolean },
) {
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(media, key, { value, configurable: true, writable: true })
}

function report(change: Partial<RunReport> = {}): RunReport {
  return {
    singers: { status: 'option-off' },
    voices: [{ name: 'Lead Vocals', phraseCount: 1 }],
    range: { startMs: 0, endMs: 3000 },
    ...change,
  } as RunReport
}

beforeEach(() => {
  played = []
  blobs = []
  leader = document.createElement('audio')
  setMedia(leader, { paused: true, currentTime: 0, preservesPitch: true })
  vi.mocked(createWaveformPlayer).mockImplementation(async () => {
    const player: WaveformPlayer = {
      media: leader,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      loop: vi.fn(async () => undefined),
      setPlayRate: vi.fn(),
      isPlaying: () => false,
      setColors: vi.fn(),
      setView: vi.fn(),
      seek: vi.fn(),
      destroy: vi.fn(() => detachPlayer(player)),
    }
    // The real player adds itself to the player store, and the track rows find the song audio there.
    attachPlayer(player)
    return player
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    played.push(this.dataset.audioRow ?? '')
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  // jsdom draws no canvas.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  // jsdom has no Blob URLs.
  URL.createObjectURL = (blob: Blob) => {
    blobs.push(blob)
    return `blob:track-${blobs.length}`
  }
  URL.revokeObjectURL = vi.fn()
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(300)
})

afterEach(() => {
  vi.mocked(createWaveformPlayer).mockReset()
  vi.restoreAllMocks()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
  localStorage.clear()
  useSongStore.setState({ current: null })
})

async function renderSong(run: Omit<RunData, 'songId'> | null) {
  const song = await storeNewSong({ name: 'carol', durationMs: 3000, audio })
  if (run !== null) await saveRunData({ songId: song.id, ...run })
  const view = render(<Waveform songId={song.id} durationMs={3000} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled())
  return { song, view }
}

function followerOf(rowId: string): HTMLAudioElement {
  const element = document.querySelector<HTMLAudioElement>(`audio[data-audio-row="${rowId}"]`)
  if (element === null) throw new Error(`No audio element for ${rowId}`)
  return element
}

const WITH_TRACKS = { tracks: TRACKS, singerSegments: [], report: report() }

describe('TrackRows', () => {
  it('shows no "Audio tracks" group and no "Song" controls for a song with no kept tracks', async () => {
    await renderSong({ singerSegments: [], report: report() })
    // The run data loads after the audio, so the test waits one more read.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByRole('group', { name: 'Audio tracks' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mute Song' })).toBeNull()
    expect(document.querySelectorAll('audio[data-audio-row]')).toHaveLength(0)
    expect(leader.muted).toBe(false)
  })

  it('shows no "Audio tracks" group for a song with no run', async () => {
    await renderSong(null)
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByRole('group', { name: 'Audio tracks' })).toBeNull()
  })

  it('shows the rows "Vocals" and "Instruments" with a waveform each, and the "Song" controls', async () => {
    await renderSong(WITH_TRACKS)
    const group = await screen.findByRole('group', { name: 'Audio tracks' })
    expect(within(group).getByText('Vocals')).toBeVisible()
    expect(within(group).getByText('Instruments')).toBeVisible()
    expect(within(group).getAllByTestId('track-wave')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Mute Song' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Solo Song' })).toBeVisible()
  })

  it('plays each track from a WAV file of its stored samples', async () => {
    await renderSong(WITH_TRACKS)
    await screen.findByRole('group', { name: 'Audio tracks' })
    await waitFor(() => expect(followerOf('vocals').getAttribute('src')).toBe('blob:track-1'))
    expect(followerOf('instruments').getAttribute('src')).toBe('blob:track-2')
    expect(blobs.map((blob) => [blob.type, blob.size])).toEqual([
      ['audio/wav', 44 + 600],
      ['audio/wav', 44 + 200],
    ])
  })

  it('sounds only "Song" by default', async () => {
    await renderSong(WITH_TRACKS)
    await screen.findByRole('group', { name: 'Audio tracks' })
    for (const [name, pressed] of [
      ['Mute Song', 'false'],
      ['Mute Vocals', 'true'],
      ['Mute Instruments', 'true'],
      ['Solo Song', 'false'],
      ['Solo Vocals', 'false'],
    ])
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', pressed)
    expect(leader.muted).toBe(false)
  })

  it('plays only the vocals and mutes the song audio with "Solo" on "Vocals"', async () => {
    await renderSong(WITH_TRACKS)
    await waitFor(() =>
      expect(document.querySelector('audio[data-audio-row="vocals"]')).not.toBeNull(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Solo Vocals' }))
    expect(screen.getByRole('button', { name: 'Solo Vocals' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => expect(leader.muted).toBe(true))
    setMedia(leader, { paused: false })
    leader.dispatchEvent(new Event('play'))
    expect(played).toEqual(['vocals'])
  })

  it('plays the instruments with the song after "Mute" on "Instruments" is off', async () => {
    await renderSong(WITH_TRACKS)
    await waitFor(() =>
      expect(document.querySelector('audio[data-audio-row="instruments"]')).not.toBeNull(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mute Instruments' }))
    setMedia(followerOf('instruments'), { currentTime: 0 })
    setMedia(leader, { paused: false, currentTime: 1.5 })
    leader.dispatchEvent(new Event('play'))
    expect(leader.muted).toBe(false)
    expect(played).toEqual(['instruments'])
    // The instruments start at 1 000 ms, so the song time 1.5 s is 0.5 s of the track.
    expect(followerOf('instruments').currentTime).toBe(0.5)
  })

  it('moves a playing track after a seek and a loop jump of the song audio', async () => {
    await renderSong(WITH_TRACKS)
    await waitFor(() =>
      expect(document.querySelector('audio[data-audio-row="vocals"]')).not.toBeNull(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mute Vocals' }))
    const vocals = followerOf('vocals')
    setMedia(vocals, { paused: false, currentTime: 0 })
    setMedia(leader, { paused: false, currentTime: 2 })
    leader.dispatchEvent(new Event('seeking'))
    expect(vocals.currentTime).toBe(2)
    setMedia(leader, { currentTime: 0.5 })
    leader.dispatchEvent(new Event('seeking'))
    expect(vocals.currentTime).toBe(0.5)
  })

  it('gives each track the play speed of the song audio', async () => {
    await renderSong(WITH_TRACKS)
    await waitFor(() =>
      expect(document.querySelector('audio[data-audio-row="vocals"]')).not.toBeNull(),
    )
    leader.playbackRate = 0.5
    leader.dispatchEvent(new Event('ratechange'))
    await waitFor(() => expect(followerOf('vocals').playbackRate).toBe(0.5))
    expect(followerOf('instruments').playbackRate).toBe(0.5)
    expect(followerOf('vocals').preservesPitch).toBe(true)
  })

  it('folds the rows and keeps the fold, the mute and the solo after a remount', async () => {
    const { song, view } = await renderSong(WITH_TRACKS)
    const fold = await screen.findByRole('button', { name: 'Audio tracks' })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Solo Vocals' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mute Song' }))
    await userEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Vocals')).not.toBeVisible()

    view.unmount()
    useTrackMixStore.setState({ muted: {}, soloed: [], folded: false, songId: null })
    render(<Waveform songId={song.id} durationMs={3000} />)
    const again = await screen.findByRole('button', { name: 'Audio tracks' })
    expect(again).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Solo Vocals', hidden: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Mute Song' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reaches each control with the keyboard', async () => {
    await renderSong(WITH_TRACKS)
    await screen.findByRole('group', { name: 'Audio tracks' })
    screen.getByRole('button', { name: 'Solo Instruments' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Solo Instruments' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows one vocals row for each singer voice, with its tooltip', async () => {
    const content = makeSongContent('song-1')
    const lead = content.voices[0]
    if (lead === undefined) throw new Error('The fixture has no voice.')
    const second = { ...lead, id: 'v2', name: 'Singer 2', order: 1, color: '#4dd0ff' }
    useSongStore.setState({
      current: {
        ...content,
        voices: [lead, second],
        marks: [
          ...content.marks,
          {
            ...content.marks[0],
            id: 'p2',
            voiceId: 'v2',
            startMs: 2000,
            endMs: 3000,
          } as (typeof content.marks)[0],
        ],
      },
    })
    await renderSong({
      tracks: TRACKS,
      singerSegments: [
        { startMs: 0, endMs: 1800, singer: 1 },
        { startMs: 2100, endMs: 2900, singer: 0 },
      ],
      report: report({
        singers: { status: 'split' } as RunReport['singers'],
        voices: [
          { name: 'Lead Vocals', phraseCount: 1 },
          { name: 'Singer 2', phraseCount: 1, made: true },
        ],
      }),
    })
    const group = await screen.findByRole('group', { name: 'Audio tracks' })
    for (const name of ['Lead Vocals', 'Singer 2']) {
      const label = within(group).getByText(name)
      expect(label).toHaveAttribute(
        'title',
        'This row is the vocals track, limited to the times of this singer.',
      )
      expect(within(group).getByRole('button', { name: `Mute ${name}` })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
    expect(within(group).getAllByTestId('track-wave')).toHaveLength(4)
    await waitFor(() => expect(document.querySelectorAll('audio[data-audio-row]')).toHaveLength(4))
  })
})

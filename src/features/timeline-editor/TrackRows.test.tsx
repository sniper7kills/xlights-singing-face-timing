import { readFileSync } from 'node:fs'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunReport } from '../../lib/runReport/runReport.ts'
import * as db from '../../store/db.ts'
import { saveRunData } from '../../store/db.ts'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
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
/** The row of each audio element that got a `pause` call, in call order. */
let paused: string[]
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
  paused = []
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused.push(this.dataset.audioRow ?? '')
  })
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

/** Waits until the first read of the run data ends and the rows render its result, so an absence is not only a slow read. */
async function runDataRead(read: { mock: { results: { value: unknown }[] } }) {
  await waitFor(() => expect(read.mock.results).toHaveLength(1))
  await act(async () => {
    await read.mock.results[0]?.value
  })
}

const WITH_TRACKS = { tracks: TRACKS, singerSegments: [], report: report() }

describe('TrackRows', () => {
  it('shows no "Audio tracks" group and no "Song" controls for a song with no kept tracks', async () => {
    const read = vi.spyOn(db, 'loadRunData')
    await renderSong({ singerSegments: [], report: report() })
    await runDataRead(read)
    expect(screen.queryByRole('group', { name: 'Audio tracks' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mute Song' })).toBeNull()
    expect(document.querySelectorAll('audio[data-audio-row]')).toHaveLength(0)
    expect(leader.muted).toBe(false)
  })

  it('shows no "Audio tracks" group for a song with no run', async () => {
    const read = vi.spyOn(db, 'loadRunData')
    await renderSong(null)
    await runDataRead(read)
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
    // The click primes the vocals element, and the play of the song audio starts it.
    expect(played).toEqual(['vocals', 'vocals'])
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
    expect(played).toEqual(['instruments', 'instruments'])
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
    expect(screen.getByRole('button', { name: 'Mute Song', hidden: true })).toHaveAttribute(
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

  it('keeps "Song" muted and the singer track playing when a phrase edit changes the singer ranges', async () => {
    setSingerSong()
    await renderSong({
      tracks: TRACKS,
      singerSegments: [
        { startMs: 0, endMs: 1800, singer: 1 },
        { startMs: 2100, endMs: 2900, singer: 0 },
        { startMs: 1850, endMs: 2050, singer: 2 },
      ],
      report: SINGER_REPORT,
    })
    await waitFor(() => expect(document.querySelectorAll('audio[data-audio-row]')).toHaveLength(4))
    await userEvent.click(screen.getByRole('button', { name: 'Solo Singer 2' }))
    await waitFor(() => expect(leader.muted).toBe(true))
    const singer = followerOf('singer:v2')
    setMedia(singer, { paused: false, currentTime: 1.9 })
    setMedia(leader, { paused: false, currentTime: 1.9 })
    leader.dispatchEvent(new Event('play'))
    // 1.9 s is outside the ranges of "Singer 2" before the edit.
    expect(singer.muted).toBe(true)
    const mutes: boolean[] = []
    let muted = true
    Object.defineProperty(leader, 'muted', {
      configurable: true,
      get: () => muted,
      set: (value: boolean) => {
        mutes.push(value)
        muted = value
      },
    })
    paused = []

    // The phrase of "Singer 2" now shares more time than "Lead Vocals" with the range from 1 850 ms to 2 050 ms.
    act(() => {
      const current = useSongStore.getState().current
      if (current === null) throw new Error('No song.')
      useSongStore.setState({
        current: {
          ...current,
          marks: current.marks.map((mark) =>
            mark.id === 'p2' ? { ...mark, startMs: 1800 } : mark,
          ),
        },
      })
    })
    leader.dispatchEvent(new Event('timeupdate'))

    await waitFor(() => expect(singer.muted).toBe(false))
    expect(mutes).not.toContain(false)
    expect(paused).toEqual([])
    expect(followerOf('singer:v2')).toBe(singer)
  })

  it('keeps "Song" muted while new tracks of a late run load, and unmutes it when the tracks go', async () => {
    const { song } = await renderSong(WITH_TRACKS)
    await waitFor(() =>
      expect(document.querySelector('audio[data-audio-row="vocals"]')).not.toBeNull(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Solo Vocals' }))
    await waitFor(() => expect(leader.muted).toBe(true))
    const mutes: boolean[] = []
    let muted = true
    Object.defineProperty(leader, 'muted', {
      configurable: true,
      get: () => muted,
      set: (value: boolean) => {
        mutes.push(value)
        muted = value
      },
    })

    await act(() => saveRunData({ songId: song.id, ...WITH_TRACKS, tracks: { ...TRACKS } }))
    await waitFor(() => expect(followerOf('vocals').getAttribute('src')).toBe('blob:track-3'))
    expect(mutes).not.toContain(false)

    await act(() => saveRunData({ songId: song.id, singerSegments: [], report: report() }))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Audio tracks' })).toBeNull())
    expect(leader.muted).toBe(false)
  })

  it('unmutes the song audio and pauses each track when the rows unmount', async () => {
    const { view } = await renderSong(WITH_TRACKS)
    await waitFor(() =>
      expect(document.querySelector('audio[data-audio-row="vocals"]')).not.toBeNull(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Solo Vocals' }))
    await waitFor(() => expect(leader.muted).toBe(true))
    paused = []
    view.unmount()
    expect(leader.muted).toBe(false)
    expect(paused).toEqual(expect.arrayContaining(['vocals', 'instruments']))
  })

  it('shows one message for a track whose play the browser refuses, and tries again after a click on its row', async () => {
    await renderSong(WITH_TRACKS)
    await waitFor(() =>
      expect(document.querySelector('audio[data-audio-row="vocals"]')).not.toBeNull(),
    )
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (
      this: HTMLMediaElement,
    ) {
      played.push(this.dataset.audioRow ?? '')
      return Promise.reject(new DOMException('refused', 'NotAllowedError'))
    })
    await userEvent.click(screen.getByRole('button', { name: 'Solo Vocals' }))
    const message = await screen.findByRole('alert')
    expect(message).toHaveTextContent(
      'The browser did not start the sound of Vocals. Select "Mute" and then "Solo" on the row again.',
    )
    expect(played).toEqual(['vocals'])

    setMedia(leader, { paused: false })
    leader.dispatchEvent(new Event('play'))
    leader.dispatchEvent(new Event('timeupdate'))
    expect(played).toEqual(['vocals'])

    setMedia(leader, { paused: true })
    await userEvent.click(screen.getByRole('button', { name: 'Mute Vocals' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Solo Vocals' }))
    expect(played).toEqual(['vocals', 'vocals'])
  })

  it('puts the rows in a list that shows at most four rows and scrolls', async () => {
    await renderSong(WITH_TRACKS)
    const group = await screen.findByRole('group', { name: 'Audio tracks' })
    const list = group.querySelector('.track-list')
    expect(list?.querySelectorAll('.track-row')).toHaveLength(3)
    // Vitest does not load the style sheet, so the test reads its rule.
    const appCss = readFileSync('src/app/app.css', 'utf8')
    const rule = /\.track-list\s*\{([^}]*)\}/.exec(appCss)?.[1] ?? ''
    expect(rule).toMatch(/max-height:\s*calc\(21px \+ 3 \* 53px\)/)
    expect(rule).toMatch(/overflow-y:\s*auto/)
  })
})

describe('TrackRows sound state', () => {
  it('shows that "Song" is silent and why, with "Solo" on "Vocals", and no row with both buttons pressed', async () => {
    await renderSong(WITH_TRACKS)
    const group = await screen.findByRole('group', { name: 'Audio tracks' })
    await userEvent.click(within(group).getByRole('button', { name: 'Solo Vocals' }))

    const song = group.querySelector('.track-row[data-row="song"] .row-sound')
    expect(song).toHaveTextContent('silent')
    expect(song).toHaveAttribute('title', 'Silent, because "Solo" is on for Vocals.')
    const vocals = group.querySelector('.track-row[data-row="vocals"] .row-sound')
    expect(vocals).toHaveTextContent('plays')
    expect(within(group).getByRole('button', { name: 'Mute Vocals' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(group).getByRole('button', { name: 'Solo Vocals' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute(
      'title',
      'The song audio is muted. See "Audio tracks".',
    )
  })

  it('names the rows that sound in the heading, also when the group is folded', async () => {
    await renderSong(WITH_TRACKS)
    await screen.findByRole('group', { name: 'Audio tracks' })
    expect(screen.getByTestId('track-plays')).toHaveTextContent('— plays: Song')
    expect(screen.getByRole('button', { name: 'Play' })).not.toHaveAttribute('title')
    await userEvent.click(screen.getByRole('button', { name: 'Solo Vocals' }))
    await userEvent.click(screen.getByRole('button', { name: 'Audio tracks' }))
    expect(screen.getByTestId('track-plays')).toBeVisible()
    expect(screen.getByTestId('track-plays')).toHaveTextContent('— plays: Vocals')
  })

  it('shows the start note until the person changes a mute or a solo', async () => {
    await renderSong(WITH_TRACKS)
    const group = await screen.findByRole('group', { name: 'Audio tracks' })
    expect(
      within(group).getByText('The tracks start muted. Select "Solo" on a track to hear it alone.'),
    ).toBeVisible()
    await userEvent.click(within(group).getByRole('button', { name: 'Mute Instruments' }))
    expect(within(group).queryByText(/The tracks start muted/)).toBeNull()
  })

  it('gives each button a tooltip that says what it does, and keeps the short names', async () => {
    await renderSong(WITH_TRACKS)
    const group = await screen.findByRole('group', { name: 'Audio tracks' })
    expect(within(group).getByRole('button', { name: 'Mute Vocals' })).toHaveAttribute(
      'title',
      'Mute: do not play this track.',
    )
    expect(within(group).getByRole('button', { name: 'Solo Vocals' })).toHaveAttribute(
      'title',
      'Solo: play only this track.',
    )
  })

  it('puts the name of each row on a line above its waveform, not on the waveform', async () => {
    await renderSong(WITH_TRACKS)
    const group = await screen.findByRole('group', { name: 'Audio tracks' })
    for (const row of group.querySelectorAll('.track-row:not([data-row="song"])')) {
      const [controls, wave] = [...row.children]
      expect(controls).toHaveClass('row-controls')
      expect(wave).toBe(within(row as HTMLElement).getByTestId('track-wave'))
    }
    const appCss = readFileSync('src/app/app.css', 'utf8')
    const rule = /\.row-controls\s*\{([^}]*)\}/.exec(appCss)?.[1] ?? ''
    expect(rule).not.toMatch(/position:\s*absolute/)
  })

  it('shows the cause in the place of the rows when the read of the run data fails', async () => {
    const get = IDBObjectStore.prototype.get
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === 'runs') throw new DOMException('read failed', 'UnknownError')
      return get.call(this, key)
    })
    await renderSong(null)
    expect(
      await screen.findByText(
        'The app could not read the run report and the separated tracks of this song. Reload the page.',
      ),
    ).toBeVisible()
  })
})

const SINGER_REPORT = report({
  singers: { status: 'split' } as RunReport['singers'],
  voices: [
    { name: 'Lead Vocals', phraseCount: 1 },
    { name: 'Singer 2', phraseCount: 1, made: true },
  ],
})

/** Opens a song with "Lead Vocals" (a phrase from 0 to 2 000 ms) and "Singer 2" (a phrase from 2 000 to 3 000 ms). */
function setSingerSong() {
  const content = makeSongContent('song-1')
  const lead = content.voices[0]
  const phrase = content.marks[0]
  if (lead === undefined || phrase === undefined) throw new Error('The fixture has no voice.')
  const second = { ...lead, id: 'v2', name: 'Singer 2', order: 1, color: '#4dd0ff' }
  const p2: Mark = { ...phrase, id: 'p2', voiceId: 'v2', startMs: 2000, endMs: 3000 }
  useSongStore.setState({
    current: { ...content, voices: [lead, second], marks: [...content.marks, p2] },
  })
}

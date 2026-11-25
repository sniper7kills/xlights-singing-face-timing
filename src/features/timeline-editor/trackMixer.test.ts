import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRIFT_LIMIT_MS, SONG_ROW } from '../../lib/audio/trackMix.ts'
import {
  createTrackMixer,
  type FollowerTrack,
  HIDDEN_CHECK_MS,
  type MixerDocument,
  type MixerMedia,
} from './trackMixer.ts'

/** A media element with no audio. `advance` moves its time like play does. */
class FakeMedia extends EventTarget implements MixerMedia {
  currentTime = 0
  playbackRate = 1
  preservesPitch = true
  muted = false
  paused = true
  seeking = false
  /** The name of the error with which `play` rejects, or null for a play that the browser accepts. */
  refuse: string | null = null
  /** Like a browser, `play` clears `paused` at once and rejects with `AbortError` after a pause before its end. */
  play = vi.fn(() => {
    if (this.refuse !== null) return Promise.reject(new DOMException('refused', this.refuse))
    this.paused = false
    this.dispatchEvent(new Event('play'))
    return Promise.resolve().then(() => {
      if (this.paused) throw new DOMException('paused', 'AbortError')
    })
  })
  pause = vi.fn(() => {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  seek(seconds: number) {
    this.currentTime = seconds
    this.dispatchEvent(new Event('seeking'))
  }
  setRate(rate: number) {
    this.playbackRate = rate
    this.dispatchEvent(new Event('ratechange'))
  }
}

let leader: FakeMedia
let vocals: FakeMedia
let instruments: FakeMedia
let singer: FakeMedia
let page: FakeDocument
let blocked: string[][]

/** A document whose visibility the test sets. */
class FakeDocument extends EventTarget implements MixerDocument {
  hidden = false
  setHidden(hidden: boolean) {
    this.hidden = hidden
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

/** Returns a mixer of the three followers with the given rows that sound. */
function mixer(audible: readonly string[]) {
  const created = createTrackMixer(leader, {
    songRowId: SONG_ROW,
    onBlockedChange: (rowIds) => blocked.push([...rowIds]),
    document: page,
  })
  created.update(followers(), new Set(audible))
  return created
}

function followers(): FollowerTrack[] {
  return [
    { rowId: 'vocals', media: vocals, startMs: 0, durationMs: 60_000, gate: null },
    { rowId: 'instruments', media: instruments, startMs: 10_000, durationMs: 20_000, gate: null },
    {
      rowId: 'singer:v2',
      media: singer,
      startMs: 0,
      durationMs: 60_000,
      gate: [{ startMs: 5000, endMs: 8000 }],
    },
  ]
}

beforeEach(() => {
  leader = new FakeMedia()
  vocals = new FakeMedia()
  instruments = new FakeMedia()
  singer = new FakeMedia()
  page = new FakeDocument()
  blocked = []
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createTrackMixer', () => {
  it('plays only the followers of the rows that sound, and mutes the song audio when "Song" does not sound', async () => {
    mixer(['vocals'])
    await leader.play()
    expect(leader.muted).toBe(true)
    expect(vocals.paused).toBe(false)
    expect(instruments.paused).toBe(true)
    expect(singer.paused).toBe(true)
  })

  it('keeps the song audio unmuted while "Song" sounds', () => {
    mixer([SONG_ROW])
    expect(leader.muted).toBe(false)
  })

  it('starts a follower that the person unmutes during play, at the song time', async () => {
    const mix = mixer([SONG_ROW])
    await leader.play()
    leader.currentTime = 3
    mix.update(followers(), new Set([SONG_ROW, 'vocals']))
    expect(vocals.paused).toBe(false)
    expect(vocals.currentTime).toBe(3)
  })

  it('pauses each follower when the song audio pauses', async () => {
    mixer(['vocals', 'singer:v2'])
    await leader.play()
    leader.pause()
    expect(vocals.paused).toBe(true)
    expect(singer.paused).toBe(true)
  })

  it('moves each playing follower after a seek and after a loop jump', async () => {
    mixer(['vocals', 'instruments'])
    await leader.play()
    leader.seek(12)
    expect(vocals.currentTime).toBe(12)
    expect(instruments.currentTime).toBe(2)
    // A loop jump is a seek back to the loop start during play.
    leader.seek(11.5)
    expect(vocals.currentTime).toBe(11.5)
    expect(instruments.currentTime).toBe(1.5)
  })

  it('moves a follower back after a drift of more than the limit, and leaves a smaller drift', async () => {
    mixer(['vocals'])
    await leader.play()
    leader.currentTime = 20
    vocals.currentTime = 20 - DRIFT_LIMIT_MS / 2000
    leader.dispatchEvent(new Event('timeupdate'))
    expect(vocals.currentTime).toBe(20 - DRIFT_LIMIT_MS / 2000)
    vocals.currentTime = 20 - (DRIFT_LIMIT_MS * 2) / 1000
    leader.dispatchEvent(new Event('timeupdate'))
    expect(vocals.currentTime).toBe(20)
  })

  it('gives each follower the play speed and the pitch setting of the song audio', () => {
    leader.playbackRate = 0.75
    mixer([SONG_ROW])
    expect([vocals, instruments, singer].map((media) => media.playbackRate)).toEqual([
      0.75, 0.75, 0.75,
    ])
    leader.preservesPitch = true
    leader.setRate(0.5)
    expect([vocals, instruments, singer].map((media) => media.playbackRate)).toEqual([
      0.5, 0.5, 0.5,
    ])
    expect(vocals.preservesPitch).toBe(true)
  })

  it('keeps a range follower silent outside its range', async () => {
    mixer(['instruments'])
    await leader.play()
    expect(instruments.paused).toBe(true)
    leader.seek(15)
    expect(instruments.paused).toBe(false)
    expect(instruments.currentTime).toBe(5)
    leader.seek(31)
    expect(instruments.paused).toBe(true)
  })

  it('mutes a singer follower outside the ranges of its singer', async () => {
    mixer(['singer:v2'])
    await leader.play()
    expect(singer.muted).toBe(true)
    leader.seek(6)
    expect(singer.muted).toBe(false)
    expect(singer.paused).toBe(false)
  })

  it('checks the followers on each animation frame during play', async () => {
    mixer([SONG_ROW])
    await leader.play()
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('leaves a follower paused when the browser refuses its play', async () => {
    vocals.refuse = 'NotAllowedError'
    mixer(['vocals'])
    await leader.play()
    await Promise.resolve()
    expect(vocals.paused).toBe(true)
  })

  it('stops each follower and unmutes the song audio on destroy', async () => {
    const mix = mixer(['vocals'])
    await leader.play()
    mix.destroy()
    expect(leader.muted).toBe(false)
    expect(vocals.paused).toBe(true)
    leader.seek(9)
    expect(vocals.currentTime).not.toBe(9)
  })

  it('keeps the song audio muted and the followers playing when the gate of a singer row changes', async () => {
    const mutes: boolean[] = []
    let muted = false
    Object.defineProperty(leader, 'muted', {
      get: () => muted,
      set: (value: boolean) => {
        mutes.push(value)
        muted = value
      },
    })
    const mix = mixer(['vocals', 'singer:v2'])
    await leader.play()
    leader.seek(9)
    expect(singer.muted).toBe(true)
    vocals.pause.mockClear()
    singer.pause.mockClear()

    const moved = followers().map((entry) =>
      entry.rowId === 'singer:v2' ? { ...entry, gate: [{ startMs: 8500, endMs: 9500 }] } : entry,
    )
    mix.update(moved, new Set(['vocals', 'singer:v2']))

    expect(mutes).not.toContain(false)
    expect(vocals.pause).not.toHaveBeenCalled()
    expect(singer.pause).not.toHaveBeenCalled()
    expect(singer.muted).toBe(false)
    expect(singer.paused).toBe(false)
  })

  it('pauses the follower of a row that the update removes', async () => {
    const mix = mixer(['vocals', 'instruments'])
    await leader.play()
    leader.seek(12)
    mix.update(
      followers().filter((entry) => entry.rowId !== 'instruments'),
      new Set(['vocals', 'instruments']),
    )
    expect(instruments.paused).toBe(true)
    expect(vocals.paused).toBe(false)
  })

  it('unmutes the song audio when no follower is left', () => {
    const mix = mixer(['vocals'])
    expect(leader.muted).toBe(true)
    mix.update([], new Set())
    expect(leader.muted).toBe(false)
  })

  it('starts the follower in the click when the song audio plays', async () => {
    const mix = mixer([SONG_ROW])
    await leader.play()
    vocals.play.mockClear()
    mix.activate('vocals', new Set([SONG_ROW, 'vocals']))
    expect(vocals.play).toHaveBeenCalledTimes(1)
    expect(vocals.paused).toBe(false)
  })

  it('primes a follower with a muted play and a pause in the click when the song audio is paused', async () => {
    const mix = mixer([SONG_ROW])
    const mutedAtPlay: boolean[] = []
    vocals.play.mockImplementationOnce(() => {
      mutedAtPlay.push(vocals.muted)
      vocals.paused = false
      return Promise.reject(new DOMException('paused', 'AbortError'))
    })
    mix.activate('vocals', new Set([SONG_ROW, 'vocals']))
    expect(vocals.play).toHaveBeenCalledTimes(1)
    expect(mutedAtPlay).toEqual([true])
    expect(vocals.paused).toBe(true)
    expect(vocals.muted).toBe(false)
    await Promise.resolve()
    expect(blocked).toEqual([])
  })

  it('does not prime a follower whose row does not sound after the click', () => {
    const mix = mixer([SONG_ROW, 'vocals'])
    mix.activate('vocals', new Set([SONG_ROW]))
    expect(vocals.play).not.toHaveBeenCalled()
  })

  it('stops the tries of a follower after NotAllowedError, and tries again after a click on its row', async () => {
    vocals.refuse = 'NotAllowedError'
    const mix = mixer(['vocals'])
    await leader.play()
    await vi.waitFor(() => expect(blocked).toEqual([['vocals']]))
    vocals.play.mockClear()
    leader.dispatchEvent(new Event('timeupdate'))
    leader.seek(4)
    expect(vocals.play).not.toHaveBeenCalled()

    vocals.refuse = null
    mix.activate('vocals', new Set(['vocals']))
    expect(blocked).toEqual([['vocals'], []])
    expect(vocals.play).toHaveBeenCalledTimes(1)
    expect(vocals.paused).toBe(false)
  })

  it.each(['AbortError', 'NotSupportedError'])(
    'keeps trying a follower after %s and reports no blocked row',
    async (name) => {
      vocals.refuse = name
      mixer(['vocals'])
      await leader.play()
      await Promise.resolve()
      leader.dispatchEvent(new Event('timeupdate'))
      await Promise.resolve()
      expect(vocals.play.mock.calls.length).toBeGreaterThan(1)
      expect(blocked).toEqual([])
    },
  )

  it('checks the followers with a 50 ms timer while the page is hidden, and with frames again when it shows', async () => {
    // The test keeps the animation frame stubs, so the fake timers replace only the timeouts.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const mix = mixer(['singer:v2'])
      await leader.play()
      page.setHidden(true)
      expect(cancelAnimationFrame).toHaveBeenCalled()
      vi.mocked(requestAnimationFrame).mockClear()
      leader.currentTime = 6
      vi.advanceTimersByTime(HIDDEN_CHECK_MS)
      expect(HIDDEN_CHECK_MS).toBe(50)
      expect(singer.muted).toBe(false)
      leader.currentTime = 8.2
      vi.advanceTimersByTime(HIDDEN_CHECK_MS)
      expect(singer.muted).toBe(true)
      expect(requestAnimationFrame).not.toHaveBeenCalled()

      page.setHidden(false)
      expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)

      page.setHidden(true)
      mix.destroy()
      expect(vi.getTimerCount()).toBe(0)
      page.setHidden(false)
      expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

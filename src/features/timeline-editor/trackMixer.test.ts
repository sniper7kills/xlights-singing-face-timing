import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRIFT_LIMIT_MS, SONG_ROW } from '../../lib/audio/trackMix.ts'
import { createTrackMixer, type FollowerTrack, type MixerMedia } from './trackMixer.ts'

/** A media element with no audio. `advance` moves its time like play does. */
class FakeMedia extends EventTarget implements MixerMedia {
  currentTime = 0
  playbackRate = 1
  preservesPitch = true
  muted = false
  paused = true
  seeking = false
  refuse = false
  play = vi.fn(async () => {
    if (this.refuse) throw new DOMException('refused', 'NotAllowedError')
    this.paused = false
    this.dispatchEvent(new Event('play'))
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
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set(['vocals']), SONG_ROW)
    await leader.play()
    expect(leader.muted).toBe(true)
    expect(vocals.paused).toBe(false)
    expect(instruments.paused).toBe(true)
    expect(singer.paused).toBe(true)
  })

  it('keeps the song audio unmuted while "Song" sounds', () => {
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set([SONG_ROW]), SONG_ROW)
    expect(leader.muted).toBe(false)
  })

  it('starts a follower that the person unmutes during play, at the song time', async () => {
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set([SONG_ROW]), SONG_ROW)
    await leader.play()
    leader.currentTime = 3
    mixer.setAudible(new Set([SONG_ROW, 'vocals']), SONG_ROW)
    expect(vocals.paused).toBe(false)
    expect(vocals.currentTime).toBe(3)
  })

  it('pauses each follower when the song audio pauses', async () => {
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set(['vocals', 'singer:v2']), SONG_ROW)
    await leader.play()
    leader.pause()
    expect(vocals.paused).toBe(true)
    expect(singer.paused).toBe(true)
  })

  it('moves each playing follower after a seek and after a loop jump', async () => {
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set(['vocals', 'instruments']), SONG_ROW)
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
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set(['vocals']), SONG_ROW)
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
    createTrackMixer(leader, followers())
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
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set(['instruments']), SONG_ROW)
    await leader.play()
    expect(instruments.paused).toBe(true)
    leader.seek(15)
    expect(instruments.paused).toBe(false)
    expect(instruments.currentTime).toBe(5)
    leader.seek(31)
    expect(instruments.paused).toBe(true)
  })

  it('mutes a singer follower outside the ranges of its singer', async () => {
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set(['singer:v2']), SONG_ROW)
    await leader.play()
    expect(singer.muted).toBe(true)
    leader.seek(6)
    expect(singer.muted).toBe(false)
    expect(singer.paused).toBe(false)
  })

  it('checks the followers on each animation frame during play', async () => {
    createTrackMixer(leader, followers())
    await leader.play()
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('leaves a follower paused when the browser refuses its play', async () => {
    vocals.refuse = true
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set(['vocals']), SONG_ROW)
    await leader.play()
    await Promise.resolve()
    expect(vocals.paused).toBe(true)
  })

  it('stops each follower and unmutes the song audio on destroy', async () => {
    const mixer = createTrackMixer(leader, followers())
    mixer.setAudible(new Set(['vocals']), SONG_ROW)
    await leader.play()
    mixer.destroy()
    expect(leader.muted).toBe(false)
    expect(vocals.paused).toBe(true)
    leader.seek(9)
    expect(vocals.currentTime).not.toBe(9)
  })
})

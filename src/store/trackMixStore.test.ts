import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  openTrackMix,
  readTrackMix,
  setFolded,
  setBlockedRows,
  setShownRows,
  toggleMute,
  toggleSolo,
  useTrackMixStore,
} from './trackMixStore.ts'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  useTrackMixStore.setState({
    muted: {},
    soloed: [],
    folded: false,
    songId: null,
    rows: [],
    blocked: [],
  })
})

describe('track mix store', () => {
  it('opens a song with no saved state in the default state', () => {
    openTrackMix('song-1')
    expect(useTrackMixStore.getState()).toMatchObject({
      songId: 'song-1',
      muted: {},
      soloed: [],
      folded: false,
      rows: [],
      blocked: [],
    })
  })

  it('unmutes a row that is muted by default, and mutes it again', () => {
    openTrackMix('song-1')
    toggleMute('vocals')
    expect(useTrackMixStore.getState().muted).toEqual({ vocals: false })
    toggleMute('vocals')
    expect(useTrackMixStore.getState().muted).toEqual({ vocals: true })
  })

  it('mutes the "Song" row, which sounds by default', () => {
    openTrackMix('song-1')
    toggleMute('song')
    expect(useTrackMixStore.getState().muted).toEqual({ song: true })
  })

  it('soloes a row and ends the solo with a second toggle', () => {
    openTrackMix('song-1')
    toggleSolo('vocals')
    toggleSolo('instruments')
    expect(useTrackMixStore.getState().soloed).toEqual(['vocals', 'instruments'])
    expect(useTrackMixStore.getState().muted).toEqual({ vocals: false, instruments: false })
    toggleSolo('vocals')
    expect(useTrackMixStore.getState().soloed).toEqual(['instruments'])
  })

  it('keeps mute, solo and fold for each song after a new open', () => {
    openTrackMix('song-1')
    toggleMute('song')
    toggleSolo('vocals')
    setFolded(true)
    openTrackMix('song-2')
    expect(useTrackMixStore.getState()).toMatchObject({ muted: {}, soloed: [], folded: false })
    openTrackMix('song-1')
    expect(useTrackMixStore.getState()).toMatchObject({
      muted: { song: true },
      soloed: ['vocals'],
      folded: true,
    })
  })

  it('saves nothing before the editor opens a song', () => {
    toggleSolo('vocals')
    expect(localStorage.length).toBe(0)
  })

  it('records the shown rows and the blocked rows, and clears them when a song opens', () => {
    setShownRows([{ id: 'song', name: 'Song' }])
    setBlockedRows(['vocals'])
    expect(useTrackMixStore.getState()).toMatchObject({
      rows: [{ id: 'song', name: 'Song' }],
      blocked: ['vocals'],
    })
    openTrackMix('song-1')
    expect(useTrackMixStore.getState()).toMatchObject({ rows: [], blocked: [] })
  })

  it('clears the mute of a muted row with one click on "Solo"', () => {
    openTrackMix('song-1')
    toggleSolo('vocals')
    expect(useTrackMixStore.getState()).toMatchObject({
      muted: { vocals: false },
      soloed: ['vocals'],
    })
  })

  it('ends the solo and mutes the row with one click on "Mute" of a soloed row', () => {
    openTrackMix('song-1')
    toggleSolo('song')
    toggleMute('song')
    expect(useTrackMixStore.getState()).toMatchObject({ muted: { song: true }, soloed: [] })
    expect(JSON.parse(localStorage.getItem('sft.tracks.song-1') ?? 'null')).toMatchObject({
      muted: { song: true },
      soloed: [],
    })
  })
})

describe('readTrackMix', () => {
  it('gives the default state for a value with a wrong shape', () => {
    for (const value of [
      '5',
      'null',
      '{"muted":{"song":1},"soloed":[],"folded":false}',
      '{"muted":{},"soloed":[2],"folded":false}',
      '{"muted":{},"soloed":[],"folded":"no"}',
      '{"muted":null,"soloed":[],"folded":false}',
    ]) {
      localStorage.setItem('sft.tracks.song-1', value)
      expect(readTrackMix('song-1')).toEqual({ muted: {}, soloed: [], folded: false })
    }
  })

  it('gives the default state when localStorage refuses the read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readTrackMix('song-1')).toEqual({ muted: {}, soloed: [], folded: false })
  })

  it('keeps the state in memory when localStorage refuses the write', () => {
    openTrackMix('song-1')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    setFolded(true)
    expect(useTrackMixStore.getState().folded).toBe(true)
  })
})

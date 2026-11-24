import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSavedView, saveView } from './savedView.ts'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('savedView', () => {
  it('reads back the zoom and the scroll offset that it keeps for a song', () => {
    saveView('song-1', { pxPerSecond: 250, scrollMs: 4200 })
    saveView('song-2', { pxPerSecond: null, scrollMs: 0 })

    expect(readSavedView('song-1')).toEqual({ pxPerSecond: 250, scrollMs: 4200 })
    expect(readSavedView('song-2')).toEqual({ pxPerSecond: null, scrollMs: 0 })
  })

  it('returns null for a song with no kept view', () => {
    expect(readSavedView('song-3')).toBeNull()
  })

  it('returns null for a kept value that is not a view', () => {
    localStorage.setItem('sft.view.song-1', '{"pxPerSecond":"wide","scrollMs":1}')
    localStorage.setItem('sft.view.song-2', 'not json')
    localStorage.setItem('sft.view.song-3', '7')

    expect(readSavedView('song-1')).toBeNull()
    expect(readSavedView('song-2')).toBeNull()
    expect(readSavedView('song-3')).toBeNull()
  })

  it('works when the browser refuses localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    expect(() => saveView('song-1', { pxPerSecond: 100, scrollMs: 0 })).not.toThrow()
    expect(readSavedView('song-1')).toBeNull()
  })
})

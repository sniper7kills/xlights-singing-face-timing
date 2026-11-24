import { describe, expect, it } from 'vitest'
import { makeSongContent } from './fixtures.test-helpers.ts'
import { useSongStore } from './songStore.ts'
import { selectedVoice, useViewStore } from './viewStore.ts'

describe('useViewStore', () => {
  it('sets the zoom, the scroll offset and the play time, and resets them', () => {
    const view = useViewStore.getState()
    view.setZoom(200)
    view.setScroll(1500)
    view.setPlayTime(2750)
    expect(useViewStore.getState()).toMatchObject({
      pxPerSecond: 200,
      scrollMs: 1500,
      playTimeMs: 2750,
    })

    useViewStore.getState().resetView()

    expect(useViewStore.getState()).toMatchObject({ pxPerSecond: null, scrollMs: 0, playTimeMs: 0 })
  })

  it('selects a voice, and the reset selects the first voice again', () => {
    useViewStore.getState().selectVoice('voice-2')
    expect(useViewStore.getState().selectedVoiceId).toBe('voice-2')

    useViewStore.getState().resetView()

    expect(useViewStore.getState().selectedVoiceId).toBeNull()
  })

  it('records no undo step for a zoom change', () => {
    useSongStore.setState({ current: makeSongContent() })

    useViewStore.getState().setZoom(400)

    expect(useSongStore.getState().history.past).toHaveLength(0)
    useSongStore.getState().closeSong()
  })
})

describe('selectedVoice', () => {
  const [first] = makeSongContent().voices
  const voices = first ? [first, { ...first, id: 'voice-2', order: 1 }] : []

  it('returns the voice with the selected id', () => {
    expect(selectedVoice(voices, 'voice-2')?.id).toBe('voice-2')
  })

  it('returns the first voice when no voice is selected', () => {
    expect(selectedVoice(voices, null)).toBe(first)
  })

  it('returns the first voice when the selected voice is not in the song', () => {
    expect(selectedVoice(voices, 'gone')).toBe(first)
  })

  it('returns undefined for a song with no voice', () => {
    expect(selectedVoice([], null)).toBeUndefined()
  })
})

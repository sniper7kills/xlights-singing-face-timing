import { describe, expect, it } from 'vitest'
import { makeSongContent } from './fixtures.test-helpers.ts'
import { useSongStore } from './songStore.ts'
import { useViewStore } from './viewStore.ts'

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

  it('records no undo step for a zoom change', () => {
    useSongStore.setState({ current: makeSongContent() })

    useViewStore.getState().setZoom(400)

    expect(useSongStore.getState().history.past).toHaveLength(0)
    useSongStore.getState().closeSong()
  })
})

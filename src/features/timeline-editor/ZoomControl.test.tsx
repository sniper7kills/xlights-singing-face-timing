import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { EditorToolbar } from './EditorToolbar.tsx'
import { SHORTCUT_KEYS } from './editorShortcuts.ts'
import { useEditorKeys } from './useEditorKeys.ts'
import { ZoomControl } from './ZoomControl.tsx'

// 1000 px for a song of 20 000 ms fits the song at 50 px for each second.
const DURATION_MS = 20_000

beforeEach(() => {
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(1000)
})

function renderToolbar() {
  return render(
    <EditorToolbar>
      <ZoomControl durationMs={DURATION_MS} />
    </EditorToolbar>,
  )
}

function slider() {
  return screen.getByRole('slider', { name: 'Zoom' })
}

describe('EditorToolbar', () => {
  it('is a labelled toolbar with the class editor-toolbar that holds its children', () => {
    renderToolbar()

    const toolbar = screen.getByRole('toolbar', { name: 'Editor tools' })
    expect(toolbar).toHaveClass('editor-toolbar')
    expect(toolbar).toContainElement(slider())
  })
})

describe('ZoomControl', () => {
  it('stops the zoom slider at 10 and at 1000 pixels for each second', () => {
    renderToolbar()

    expect(slider()).toHaveAttribute('min', '10')
    expect(slider()).toHaveAttribute('max', '1000')
    fireEvent.change(slider(), { target: { value: '5000' } })
    expect(useViewStore.getState().pxPerSecond).toBe(1000)
    fireEvent.change(slider(), { target: { value: '1' } })
    expect(useViewStore.getState().pxPerSecond).toBe(10)
  })

  it('shows the zoom that fits the full song at the default zoom', () => {
    renderToolbar()

    expect(slider()).toHaveValue('50')
    expect(slider()).toHaveAttribute('aria-valuetext', '50 pixels for each second')
  })

  it('keeps the time at the centre of the stage when the slider moves', () => {
    useViewStore.setState({ pxPerSecond: 100, scrollMs: 5000 })
    renderToolbar()

    // The centre at 500 px shows 10 000 ms. At 200 px for each second, 500 px is 2500 ms.
    fireEvent.change(slider(), { target: { value: '200' } })

    expect(useViewStore.getState()).toMatchObject({ pxPerSecond: 200, scrollMs: 7500 })
  })

  it('zooms in for + and = and out for -', async () => {
    useViewStore.setState({ pxPerSecond: 100, scrollMs: 0 })
    renderToolbar()
    const user = userEvent.setup()

    await user.keyboard('+')
    expect(useViewStore.getState().pxPerSecond).toBe(150)
    await user.keyboard('=')
    expect(useViewStore.getState().pxPerSecond).toBe(225)
    await user.keyboard('-')
    expect(useViewStore.getState().pxPerSecond).toBe(150)
    expect(slider()).toHaveValue('150')
  })

  it('stops the keys at 1000 pixels for each second', async () => {
    useViewStore.setState({ pxPerSecond: 900, scrollMs: 0 })
    renderToolbar()

    await userEvent.keyboard('++')

    expect(useViewStore.getState().pxPerSecond).toBe(1000)
  })

  it('ignores + and - inside a text field and inside a dialog', async () => {
    useViewStore.setState({ pxPerSecond: 100, scrollMs: 0 })
    render(
      <>
        <ZoomControl durationMs={DURATION_MS} />
        <input aria-label="Name" />
        <div role="dialog" aria-label="Dialog">
          <button type="button">OK</button>
        </div>
      </>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('textbox', { name: 'Name' }))
    await user.keyboard('+-+')
    await user.click(screen.getByRole('button', { name: 'OK' }))
    await user.keyboard('+')

    expect(useViewStore.getState().pxPerSecond).toBe(100)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('+-+')
  })

  it('stops the key listener when the last control unmounts', async () => {
    useViewStore.setState({ pxPerSecond: 100, scrollMs: 0 })
    const view = renderToolbar()
    view.unmount()

    await userEvent.keyboard('+')

    expect(useViewStore.getState().pxPerSecond).toBe(100)
  })

  describe('with an open song', () => {
    // The test song has the word `song-1-word` from 0 to 1000 ms.
    beforeEach(() => {
      const content = makeSongContent()
      useSongStore.setState({
        current: { ...content, song: { ...content.song, durationMs: DURATION_MS } },
      })
    })

    afterEach(() => {
      useSongStore.setState({ current: null })
    })

    it('changes the zoom by 40% or more after 5 arrow keys on the slider', async () => {
      useViewStore.setState({ pxPerSecond: 31, scrollMs: 0 })
      renderToolbar()
      const user = userEvent.setup()

      await user.click(slider())
      useViewStore.setState({ pxPerSecond: 31, scrollMs: 0 })
      await user.keyboard('{ArrowRight>5/}')

      expect(useViewStore.getState().pxPerSecond).toBeGreaterThanOrEqual(31 * 1.4)
    })

    it('keeps the selected mark in place when the slider moves', () => {
      // At 100 px for each second, the middle of the word (500 ms) is at 500 px with the scroll at 0.
      useViewStore.setState({ pxPerSecond: 100, scrollMs: 0, playTimeMs: 15_000 })
      useViewStore.getState().selectMarks(['song-1-word'])
      renderToolbar()

      fireEvent.change(slider(), { target: { value: '150' } })

      const { pxPerSecond, scrollMs } = useViewStore.getState()
      expect((500 - scrollMs) * ((pxPerSecond ?? 0) / 1000)).toBeCloseTo(50)
    })

    it('shows the selected word in the middle of the stage after "Zoom to selection"', async () => {
      useViewStore.getState().selectMarks(['song-1-word'])
      renderToolbar()

      await userEvent.click(screen.getByRole('button', { name: 'Zoom to selection' }))

      // 1000 ms with a margin of 10% on each side fills 1000 px at 833 px for each second.
      expect(useViewStore.getState().pxPerSecond).toBeCloseTo(833.3, 0)
    })

    it('runs "Zoom to selection" with the Z key', async () => {
      useViewStore.getState().setSelection({ startMs: 4000, endMs: 6000 })
      render(<EditorShortcutsHost />)
      renderToolbar()

      await userEvent.keyboard('z')

      expect(useViewStore.getState().pxPerSecond).toBeCloseTo(416.7, 0)
    })

    it('states the reason on "Zoom to selection" with nothing selected', () => {
      renderToolbar()

      expect(screen.getByRole('button', { name: 'Zoom to selection' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
      expect(screen.getByRole('button', { name: 'Zoom to selection' })).toHaveAccessibleDescription(
        'Select a mark or a time range first.',
      )
    })

    it('shows the full song after "Fit song"', async () => {
      useViewStore.setState({ pxPerSecond: 400, scrollMs: 3000 })
      renderToolbar()

      await userEvent.click(screen.getByRole('button', { name: 'Fit song' }))

      expect(useViewStore.getState()).toMatchObject({ pxPerSecond: null, scrollMs: 0 })
    })
  })
})

/** Registers the shortcut table, the same as the editor page. */
function EditorShortcutsHost() {
  useEditorKeys(SHORTCUT_KEYS)
  return null
}

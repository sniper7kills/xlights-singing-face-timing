import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useViewStore } from '../../store/viewStore.ts'
import { EditorToolbar } from './EditorToolbar.tsx'
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
})

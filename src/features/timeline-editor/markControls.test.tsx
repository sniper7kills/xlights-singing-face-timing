import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { PointerEvent } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { PHONEME_LABELS } from '../../lib/dictionary/cmuSymbols.ts'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { Layers } from './Layers.tsx'
import { resetMarkUi, useMarkUiStore } from './markUiStore.ts'
import { useMarkDrag } from './useMarkDrag.ts'

// A song of 20 000 ms in a stage of 1000 px, so 1 px is 20 ms. The frame size is 50 ms.
const WIDTH_PX = 1000
const VOICE = 'song-1-voice'

function mark(id: string, fields: Partial<Mark> & Pick<Mark, 'layer' | 'startMs' | 'endMs'>): Mark {
  return { id, voiceId: VOICE, label: id, parentId: null, edited: false, ...fields }
}

const MARKS: Mark[] = [
  mark('p1', { layer: 'phrase', label: 'silent night', startMs: 0, endMs: 8000 }),
  mark('w1', { layer: 'word', label: 'silent', startMs: 2000, endMs: 4000, parentId: 'p1' }),
  mark('w2', { layer: 'word', label: 'night', startMs: 4000, endMs: 8000, parentId: 'p1' }),
  mark('f1', { layer: 'phoneme', label: 'etc', startMs: 2000, endMs: 3000, parentId: 'w1' }),
  mark('f2', { layer: 'phoneme', label: 'AI', startMs: 3000, endMs: 4000, parentId: 'w1' }),
  mark('f3', { layer: 'phoneme', label: 'etc', startMs: 4000, endMs: 8000, parentId: 'w2' }),
  mark('p2', { layer: 'phrase', label: 'holy night', startMs: 10_000, endMs: 14_000 }),
  mark('w3', { layer: 'word', label: 'holy', startMs: 10_000, endMs: 12_000, parentId: 'p2' }),
]

function openSong() {
  const content = makeSongContent()
  useSongStore.setState({
    current: { ...content, song: { ...content.song, durationMs: 20_000 }, marks: MARKS },
    history: emptyHistory(),
  })
}

/** Draws the layers of the open song again after each change, the same as the editor page. */
function OpenSongLayers() {
  const content = useSongStore((state) => state.current)
  return content && <Layers content={content} />
}

function renderLayers() {
  return render(<OpenSongLayers />)
}

function stored(id: string): Mark | undefined {
  return useSongStore.getState().current?.marks.find((item) => item.id === id)
}

/** Removes the mark from the open song with no undo step, as a change from outside the layers. */
function removeFromSong(id: string) {
  act(() =>
    useSongStore.setState((state) => ({
      current: state.current && {
        ...state.current,
        marks: state.current.marks.filter((item) => item.id !== id),
      },
    })),
  )
}

/** Returns a pointer event for the handlers of `useMarkDrag`, with no element under the pointer. */
function pointer(clientX: number) {
  const element = document.createElement('li')
  element.setPointerCapture = () => {}
  return {
    button: 0,
    pointerId: 1,
    clientX,
    shiftKey: false,
    target: element,
    currentTarget: element,
  } as unknown as PointerEvent<HTMLElement>
}

function undoSteps(): number {
  return useSongStore.getState().history.past.length
}

function layer(name: string) {
  return within(screen.getByRole('list', { name }))
}

function markItem(name: string, label: string): HTMLElement {
  const item = layer(name).getByText(label).closest('li')
  if (item === null) throw new Error(`No mark "${label}" on ${name}.`)
  return item
}

function handle(item: HTMLElement, edge: 'start' | 'end'): HTMLElement {
  const found = item.querySelector<HTMLElement>(`[data-edge="${edge}"]`)
  if (found === null) throw new Error(`The mark has no ${edge} handle.`)
  return found
}

/** Presses the pointer on `target`, moves it by `dx` pixels in steps, and releases it unless `release` is false. */
function drag(target: HTMLElement, fromX: number, dx: number, release = true) {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: fromX })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: fromX + dx / 2 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: fromX + dx })
  if (release) fireEvent.pointerUp(target, { button: 0, pointerId: 1, clientX: fromX + dx })
}

beforeEach(() => {
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(WIDTH_PX)
  resetMarkUi()
  openSong()
})

describe('mark selection', () => {
  it('selects a mark with a click', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.click(markItem('Words', 'night'))

    expect(useViewStore.getState().selectedMarkIds).toEqual(['w2'])
    expect(markItem('Words', 'night')).toHaveAttribute('aria-current', 'true')
  })

  it('selects the marks between two clicks on one layer with Shift', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.click(markItem('Words', 'silent'))
    await user.keyboard('{Shift>}')
    await user.click(markItem('Words', 'holy'))
    await user.keyboard('{/Shift}')

    expect(useViewStore.getState().selectedMarkIds).toEqual(['w1', 'w2', 'w3'])
  })

  it('keeps the anchor of the first click for each later Shift+click', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.click(markItem('Phonemes', 'AI'))
    await user.keyboard('{Shift>}')
    await user.click(layer('Phonemes').getAllByText('etc')[1] as HTMLElement)
    await user.click(layer('Phonemes').getAllByText('etc')[0] as HTMLElement)
    await user.keyboard('{/Shift}')

    expect(useViewStore.getState().selectedMarkIds).toEqual(['f1', 'f2'])
  })

  it('clears the selection with a click in an empty range of a layer', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.click(markItem('Words', 'night'))

    await user.click(screen.getByRole('list', { name: 'Words' }))

    expect(useViewStore.getState().selectedMarkIds).toEqual([])
  })

  it('selects a mark and changes nothing when the pointer moves less than the drag threshold', () => {
    renderLayers()

    drag(markItem('Words', 'holy'), 510, 2)

    expect(useViewStore.getState().selectedMarkIds).toEqual(['w3'])
    expect(stored('w3')).toMatchObject({ startMs: 10_000, endMs: 12_000 })
    expect(undoSteps()).toBe(0)
  })

  it('shows edge handles on the selected mark only', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.click(markItem('Words', 'night'))

    expect(markItem('Words', 'night').querySelectorAll('[data-edge]')).toHaveLength(2)
    expect(markItem('Words', 'silent').querySelectorAll('[data-edge]')).toHaveLength(0)
  })
})

describe('mark drag', () => {
  it('shows the clamped resize during the drag and moves the shared boundary on release as one undo step', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.click(markItem('Words', 'night'))

    // 31 px earlier is 620 ms, so the edge snaps to 3400 ms.
    drag(handle(markItem('Words', 'night'), 'start'), 200, -31, false)

    expect(markItem('Words', 'night')).toHaveStyle({ left: '170px', width: '230px' })
    expect(markItem('Words', 'silent')).toHaveStyle({ width: '70px' })
    expect(stored('w2')?.startMs).toBe(4000)

    fireEvent.pointerUp(handle(markItem('Words', 'night'), 'start'), {
      button: 0,
      pointerId: 1,
      clientX: 169,
    })

    expect(stored('w2')).toMatchObject({ startMs: 3400, endMs: 8000 })
    expect(stored('w1')).toMatchObject({ startMs: 2000, endMs: 3400 })
    expect(undoSteps()).toBe(1)
  })

  it('ends a dragged edge on a multiple of the frame size', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.click(markItem('Words', 'holy'))

    // 7 px later is 140 ms, so the end edge snaps from 12 140 ms to 12 150 ms.
    drag(handle(markItem('Words', 'holy'), 'end'), 600, 7)

    expect((stored('w3')?.endMs ?? 0) % 50).toBe(0)
    expect(stored('w3')?.endMs).toBe(12_150)
  })

  it('moves a dragged word body and keeps its length', () => {
    renderLayers()

    drag(markItem('Words', 'holy'), 520, 20)

    expect(stored('w3')).toMatchObject({ startMs: 10_400, endMs: 12_400 })
    expect(useViewStore.getState().selectedMarkIds).toEqual(['w3'])
    expect(undoSteps()).toBe(1)
  })

  it('stops a dragged word body at the parent edge', () => {
    renderLayers()

    drag(markItem('Words', 'holy'), 520, 200)

    expect(stored('w3')).toMatchObject({ startMs: 12_000, endMs: 14_000 })
  })

  it('cancels the drag with Escape and changes nothing', () => {
    renderLayers()
    const item = markItem('Words', 'holy')

    drag(item, 520, 20, false)
    expect(item).toHaveStyle({ left: '520px' })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(item, { button: 0, pointerId: 1, clientX: 540 })

    expect(markItem('Words', 'holy')).toHaveStyle({ left: '500px' })
    expect(stored('w3')).toMatchObject({ startMs: 10_000, endMs: 12_000 })
    expect(undoSteps()).toBe(0)
  })

  it('ends the drag with no change when the pointer is cancelled', () => {
    renderLayers()
    const item = markItem('Words', 'holy')

    drag(item, 520, 20, false)
    fireEvent.pointerCancel(item, { pointerId: 1 })

    expect(item).toHaveStyle({ left: '500px' })
    expect(undoSteps()).toBe(0)
  })
})

describe('drag hook', () => {
  it('keeps the preview of an active drag when another mark unmounts', () => {
    const dragged = renderHook(() => useMarkDrag('w1'))
    const other = renderHook(() => useMarkDrag('w3'))

    act(() => {
      dragged.result.current.onPointerDown(pointer(150))
      dragged.result.current.onPointerMove(pointer(130))
    })
    expect(useMarkUiStore.getState().preview.size).toBeGreaterThan(0)
    other.unmount()

    expect(useMarkUiStore.getState().preview.size).toBeGreaterThan(0)
    dragged.unmount()
    expect(useMarkUiStore.getState().preview.size).toBe(0)
  })

  it('selects no mark after a drag when the song no longer has the mark', () => {
    const dragged = renderHook(() => useMarkDrag('w1'))

    act(() => {
      dragged.result.current.onPointerDown(pointer(150))
      dragged.result.current.onPointerMove(pointer(130))
    })
    removeFromSong('w1')
    act(() => dragged.result.current.onPointerUp(pointer(130)))

    expect(useViewStore.getState().selectedMarkIds).toEqual([])
  })

  it('selects no mark after a click when the song no longer has the mark', () => {
    const clicked = renderHook(() => useMarkDrag('w1'))

    act(() => clicked.result.current.onPointerDown(pointer(150)))
    removeFromSong('w1')
    act(() => clicked.result.current.onPointerUp(pointer(150)))

    expect(useViewStore.getState().selectedMarkIds).toEqual([])
  })
})

describe('label editor', () => {
  it('changes the label and the phonemes of a word after a double-click, new text and Enter', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Words', 'silent'))
    const field = screen.getByRole('textbox', { name: 'Word label' })
    expect(field).toHaveValue('silent')
    await user.clear(field)
    await user.type(field, 'mild{Enter}')

    expect(stored('w1')?.label).toBe('mild')
    expect(stored('f1')).toBeUndefined()
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(layer('Words').getByText('mild')).toBeInTheDocument()
  })

  it('keeps the old label after Escape', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Words', 'silent'))
    await user.type(screen.getByRole('textbox', { name: 'Word label' }), 'xyz{Escape}')

    expect(stored('w1')?.label).toBe('silent')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(undoSteps()).toBe(0)
  })

  it('keeps the old label when the new label is empty', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Words', 'silent'))
    await user.clear(screen.getByRole('textbox', { name: 'Word label' }))
    await user.keyboard('{Enter}')

    expect(stored('w1')?.label).toBe('silent')
    expect(undoSteps()).toBe(0)
  })

  it('saves the label when the field loses the focus', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Words', 'silent'))
    await user.keyboard('{End}s')
    act(() => screen.getByRole('textbox', { name: 'Word label' }).blur())

    expect(stored('w1')?.label).toBe('silents')
  })

  it('saves the label and leaves the focus on the next mark that the person clicks', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Words', 'silent'))
    await user.keyboard('{End}s')
    await user.click(markItem('Words', 'night'))

    expect(stored('w1')?.label).toBe('silents')
    expect(useViewStore.getState().selectedMarkIds).toEqual(['w2'])
    await waitFor(() => expect(markItem('Words', 'night')).toHaveFocus())
  })

  it('changes a phrase label with the same words and shows no confirm dialog', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Phrases', 'silent night'))
    await user.keyboard('{End}!{Enter}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stored('p1')?.label).toBe('silent night!')
  })

  it('shows the confirm dialog for a phrase label that changes the words, and Continue rebuilds the words', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Phrases', 'holy night'))
    const field = screen.getByRole('textbox', { name: 'Phrase label' })
    await user.clear(field)
    await user.type(field, 'holy quiet night{Enter}')

    const dialog = await screen.findByRole('dialog', {
      name: 'The app rebuilds the words and phonemes of this phrase.',
    })
    expect(stored('p2')?.label).toBe('holy night')
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))

    expect(stored('p2')?.label).toBe('holy quiet night')
    const words = useSongStore
      .getState()
      .current?.marks.filter((item) => item.parentId === 'p2')
      .map((item) => item.label)
    expect(words).toEqual(['holy', 'quiet', 'night'])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the old phrase label and its words after Cancel in the confirm dialog', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Phrases', 'holy night'))
    const field = screen.getByRole('textbox', { name: 'Phrase label' })
    await user.clear(field)
    await user.type(field, 'holy quiet night{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stored('p2')?.label).toBe('holy night')
    expect(markItem('Phrases', 'holy night')).toBeInTheDocument()
    expect(undoSteps()).toBe(0)
  })

  it('closes the confirm dialog with Escape and keeps the old label', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.dblClick(markItem('Phrases', 'holy night'))
    const field = screen.getByRole('textbox', { name: 'Phrase label' })
    await user.clear(field)
    await user.type(field, 'holy quiet night{Enter}')
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stored('p2')?.label).toBe('holy night')
  })
})

describe('phoneme label list', () => {
  it('opens with exactly the ten phoneme labels from a click on the selected phoneme', async () => {
    const user = userEvent.setup()
    renderLayers()

    await user.click(markItem('Phonemes', 'AI'))
    await user.click(markItem('Phonemes', 'AI'))

    const list = screen.getByRole('listbox', { name: 'Phoneme label' })
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([...PHONEME_LABELS])
    expect(within(list).getByRole('option', { selected: true })).toHaveTextContent('AI')
  })

  it('sets the label that the person chooses with the arrow keys and Enter', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.click(markItem('Phonemes', 'AI'))

    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(stored('f2')?.label).toBe('etc')
    expect(stored('f2')?.edited).toBe(true)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('sets the label that the person clicks', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.dblClick(markItem('Phonemes', 'AI'))

    await user.click(screen.getByRole('option', { name: 'MBP' }))

    expect(stored('f2')?.label).toBe('MBP')
  })

  it('closes with Escape and changes nothing', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.dblClick(markItem('Phonemes', 'AI'))

    await user.keyboard('{End}{Escape}')

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(stored('f2')?.label).toBe('AI')
  })
})

describe('add by double-click', () => {
  it('adds a word in an empty range of the word layer after the person types its label', async () => {
    const user = userEvent.setup()
    renderLayers()

    // 450 px is 9000 ms, between the two phrases.
    fireEvent.doubleClick(screen.getByRole('list', { name: 'Words' }), { clientX: 450 })
    await user.type(screen.getByRole('textbox', { name: 'Word label' }), 'gloria{Enter}')

    const added = useSongStore
      .getState()
      .current?.marks.find((item) => item.layer === 'word' && item.label === 'gloria')
    expect(added).toMatchObject({ startMs: 9000, endMs: 9500 })
    expect(undoSteps()).toBe(1)
    expect(useViewStore.getState().selectedMarkIds).toEqual([added?.id])
    await waitFor(() => expect(markItem('Words', 'gloria')).toHaveFocus())
  })

  it('gives the focus back to the layer after a cancelled add', async () => {
    const user = userEvent.setup()
    renderLayers()

    fireEvent.doubleClick(screen.getByRole('list', { name: 'Words' }), { clientX: 450 })
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.getByRole('list', { name: 'Words' })).toHaveFocus())
    expect(useViewStore.getState().selectedMarkIds).toEqual([])
  })

  it('adds a phoneme in a word with the label that the person chooses', async () => {
    const user = userEvent.setup()
    renderLayers()

    // 525 px is 10 500 ms, inside the word "holy", which has no phonemes.
    fireEvent.doubleClick(screen.getByRole('list', { name: 'Phonemes' }), { clientX: 525 })
    await user.click(screen.getByRole('option', { name: 'O' }))

    const added = useSongStore
      .getState()
      .current?.marks.find((item) => item.layer === 'phoneme' && item.parentId === 'w3')
    expect(added).toMatchObject({ label: 'O', startMs: 10_500, endMs: 11_000 })
    expect(useViewStore.getState().selectedMarkIds).toEqual([added?.id])
    await waitFor(() => expect(markItem('Phonemes', 'O')).toHaveFocus())
  })

  it('opens no control where the add is not possible', () => {
    renderLayers()

    // 450 px is 9000 ms, where no word holds a new phoneme.
    fireEvent.doubleClick(screen.getByRole('list', { name: 'Phonemes' }), { clientX: 450 })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('adds no word when the person leaves the label empty', async () => {
    const user = userEvent.setup()
    renderLayers()

    fireEvent.doubleClick(screen.getByRole('list', { name: 'Words' }), { clientX: 450 })
    await user.keyboard('{Enter}')

    expect(undoSteps()).toBe(0)
  })
})

describe('mark keys', () => {
  it('moves the selection and the focus to the next and the previous mark of the layer with Tab and Shift+Tab', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.click(markItem('Words', 'silent'))

    await user.keyboard('{Tab}')
    expect(useViewStore.getState().selectedMarkIds).toEqual(['w2'])
    await waitFor(() => expect(markItem('Words', 'night')).toHaveFocus())

    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(useViewStore.getState().selectedMarkIds).toEqual(['w1'])
    await waitFor(() => expect(markItem('Words', 'silent')).toHaveFocus())
  })

  it('lets Tab leave the layer from the last mark', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.click(markItem('Words', 'holy'))

    await user.keyboard('{Tab}')

    expect(useViewStore.getState().selectedMarkIds).toEqual(['w3'])
    expect(markItem('Words', 'holy')).not.toHaveFocus()
  })

  it('makes one mark of each layer a Tab stop', () => {
    renderLayers()

    const stops = screen.getAllByRole('listitem').filter((item) => item.tabIndex === 0)

    expect(stops.map((item) => item.textContent)).toEqual(['silent night', 'silent', 'etc'])
  })

  it.each(['{Enter}', '{F2}'])(
    'opens the label field of the selected word with %s',
    async (key) => {
      const user = userEvent.setup()
      renderLayers()
      await user.click(markItem('Words', 'night'))

      await user.keyboard(key)

      expect(screen.getByRole('textbox', { name: 'Word label' })).toHaveValue('night')
    },
  )

  it('clears the selection with Escape', async () => {
    const user = userEvent.setup()
    renderLayers()
    await user.click(markItem('Words', 'night'))

    await user.keyboard('{Escape}')

    expect(useViewStore.getState().selectedMarkIds).toEqual([])
  })
})

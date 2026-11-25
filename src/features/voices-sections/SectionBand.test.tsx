import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Section } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { resetMarkUi } from '../timeline-editor/markUiStore.ts'
import { SectionBand } from './SectionBand.tsx'
import { TransferConfirmDialog } from './TransferConfirmDialog.tsx'
import { useTransferStore } from './transferCommands.ts'

// The test song is 10 000 ms long, so 1 px is 10 ms at the default zoom in 1000 px.
const DURATION_MS = 10_000

function section(id: string, startMs: number, endMs: number, name = id): Section {
  return { id, songId: 'song-1', name, startMs, endMs }
}

function open(sections: Section[]) {
  useSongStore.setState({ current: { ...testContent(), sections }, history: emptyHistory() })
  // The phrase menu renders the confirm dialog of a transfer in the editor.
  render(
    <>
      <SectionBand durationMs={DURATION_MS} />
      <TransferConfirmDialog />
    </>,
  )
}

const sections = () => useSongStore.getState().current?.sections ?? []

function block(name: string) {
  const button = screen.getByRole('button', { name })
  const element = button.closest<HTMLElement>('.section-block')
  if (element === null) throw new Error('The button is not in a section block.')
  return element
}

async function openMenu(name: string) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  return screen.getByRole('menu', { name: `Actions for ${name}` })
}

beforeEach(() => {
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(1000)
  useTransferStore.setState({ pending: null })
  resetMarkUi()
})

describe('SectionBand', () => {
  it('shows the hint with no section', () => {
    open([])

    expect(screen.getByRole('group', { name: 'Sections' })).toHaveTextContent(
      'Drag on the waveform, then Add section',
    )
  })

  it('shows one block for each section at its time range', () => {
    open([section('a', 1000, 3000, 'Verse'), section('b', 5000, 9000, 'Chorus')])

    expect(block('Verse')).toHaveStyle({ left: '100px', width: '200px' })
    expect(block('Chorus')).toHaveStyle({ left: '500px', width: '400px' })
    expect(screen.getByRole('button', { name: 'Verse' })).toHaveAccessibleDescription(
      '0:01.000 – 0:03.000',
    )
  })

  it('selects the time range of a section and scrolls to its start on a click', async () => {
    useViewStore.getState().setZoom(400)
    open([section('a', 4000, 6000, 'Verse')])

    await userEvent.click(screen.getByRole('button', { name: 'Verse' }))

    expect(useViewStore.getState().selection).toEqual({ startMs: 4000, endMs: 6000 })
    expect(useViewStore.getState().scrollMs).toBe(4000)
  })

  it('stops a dragged end at the next section as one undo step', () => {
    open([section('a', 1000, 3000, 'Verse'), section('b', 5000, 9000, 'Chorus')])
    const handle = screen.getByRole('slider', { name: 'End of Verse' })

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 300 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 452 })
    expect(block('Verse')).toHaveStyle({ width: '350px' })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700 })
    expect(block('Verse')).toHaveStyle({ width: '400px' })
    fireEvent.pointerUp(handle, { button: 0, pointerId: 1, clientX: 700 })

    expect(sections()[0]).toMatchObject({ startMs: 1000, endMs: 5000 })
    expect(useSongStore.getState().history.past).toHaveLength(1)
  })

  it('moves an edge by one frame size for each arrow key', async () => {
    open([section('a', 1000, 3000, 'Verse')])
    const handle = screen.getByRole('slider', { name: 'Start of Verse' })

    handle.focus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowRight}')

    expect(sections()[0]?.startMs).toBe(950)
    expect(handle).toHaveAttribute('aria-valuetext', '0:00.950')
  })

  it('shows the new name after a rename', async () => {
    open([section('a', 1000, 3000, 'Verse')])

    await userEvent.click(within(await openMenu('Verse')).getByRole('menuitem', { name: 'Rename' }))
    const field = screen.getByRole('textbox', { name: 'Section name' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Bridge{Enter}')

    expect(screen.getByRole('button', { name: 'Bridge' })).toHaveFocus()
    expect(sections()[0]?.name).toBe('Bridge')
  })

  it('deletes a section and leaves every mark the same', async () => {
    open([section('a', 1000, 3000, 'Verse')])
    const marks = useSongStore.getState().current?.marks

    await userEvent.click(within(await openMenu('Verse')).getByRole('menuitem', { name: 'Delete' }))

    expect(sections()).toEqual([])
    expect(useSongStore.getState().current?.marks).toBe(marks)
    expect(screen.getByRole('group', { name: 'Sections' })).toHaveFocus()
  })

  it('moves each phrase of the shown voice in the section to the chosen voice', async () => {
    open([section('a', 0, 5000, 'Verse')])

    await userEvent.click(
      within(await openMenu('Verse')).getByRole('menuitem', { name: 'Move section to voice' }),
    )
    const list = screen.getByRole('menu', { name: 'Move section to voice' })
    await userEvent.click(within(list).getByRole('menuitem', { name: 'Backing' }))
    // The backing voice has a phrase from 0 to 2000 ms, so the move asks first.
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

    const marks = useSongStore.getState().current?.marks ?? []
    expect(marks.find((mark) => mark.id === 'p1')?.voiceId).toBe(OTHER_VOICE)
    expect(marks.find((mark) => mark.id === 'p2')?.voiceId).toBe(OTHER_VOICE)
    expect(marks.find((mark) => mark.id === 'p3')?.voiceId).not.toBe(OTHER_VOICE)
  })

  it('disables "Move section to voice" when the shown voice has no phrase in the section', async () => {
    open([section('a', 8000, 9500, 'Outro')])

    const menu = await openMenu('Outro')

    expect(within(menu).getByRole('menuitem', { name: 'Move section to voice' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

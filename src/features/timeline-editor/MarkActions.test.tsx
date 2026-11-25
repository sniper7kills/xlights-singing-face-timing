import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { HELP_TEXTS, HelpLine } from './HelpLine.tsx'
import { Layers } from './Layers.tsx'
import { MarkActions } from './MarkActions.tsx'
import { resetMarkUi } from './markUiStore.ts'

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
]

function Editor() {
  const content = useSongStore((state) => state.current)
  return (
    content && (
      <>
        <Layers content={content} />
        <HelpLine />
        <MarkActions />
      </>
    )
  )
}

const marks = () => useSongStore.getState().current?.marks ?? []
const onLayer = (layer: Mark['layer']) => marks().filter((item) => item.layer === layer)
const button = (name: string) =>
  within(screen.getByRole('group', { name: 'Mark' })).getByRole('button', { name })

function select(...ids: string[]) {
  act(() => useViewStore.getState().selectMarks(ids))
}

beforeEach(() => {
  useViewStore.getState().resetView()
  useViewStore.getState().setStageWidth(1000)
  resetMarkUi()
  const content = makeSongContent()
  useSongStore.setState({
    current: { ...content, song: { ...content.song, durationMs: 20_000 }, marks: MARKS },
    history: emptyHistory(),
  })
  render(<Editor />)
})

describe('MarkActions', () => {
  it('splits the selected word at the play cursor with a click on "Split"', async () => {
    select('w1')
    act(() => useViewStore.getState().setPlayTime(3000))

    await userEvent.click(button('Split'))

    expect(onLayer('word')).toHaveLength(3)
    expect(useSongStore.getState().history.past).toHaveLength(1)
  })

  it('merges the selected word with the next word with a click on "Merge with next"', async () => {
    select('w1')

    await userEvent.click(button('Merge with next'))

    expect(onLayer('word')).toHaveLength(1)
  })

  it('deletes the selected word with a click on "Delete"', async () => {
    select('w2')

    await userEvent.click(button('Delete'))

    expect(onLayer('word').map((item) => item.id)).toEqual(['w1'])
  })

  it('opens the label field of the selected word with a click on "Edit label"', async () => {
    select('w1')

    await userEvent.click(button('Edit label'))

    expect(await screen.findByRole('textbox', { name: 'Word label' })).toHaveValue('silent')
  })

  it('keeps the focus on the mark after a click on a button', async () => {
    const word = screen.getByText('silent').closest('li')
    act(() => word?.focus())
    select('w1')

    await userEvent.click(button('Merge with next'))

    expect(document.activeElement).toBe(screen.getByText('silentnight').closest('li'))
  })

  it('names the shortcut in each tooltip', () => {
    select('w1')
    act(() => useViewStore.getState().setPlayTime(3000))

    expect(button('Split')).toHaveAttribute(
      'title',
      'Split the selected mark at the play cursor (S)',
    )
    expect(button('Merge with next')).toHaveAttribute(
      'title',
      'Merge the selected mark with the next mark (M)',
    )
    expect(button('Delete')).toHaveAttribute('title', 'Delete the selected marks (Delete)')
    expect(button('Edit label')).toHaveAttribute('title', 'Edit the label (Enter or F2)')
  })

  it('states the reason for the play cursor outside the mark, and does not split', async () => {
    select('w1')
    act(() => useViewStore.getState().setPlayTime(0))

    await userEvent.click(button('Split'))

    expect(button('Split')).toHaveAttribute('aria-disabled', 'true')
    expect(button('Split')).toHaveAttribute(
      'title',
      'Move the play cursor into the mark. Then press S. (S)',
    )
    expect(button('Split')).toHaveAccessibleDescription(
      'Move the play cursor into the mark. Then press S.',
    )
    expect(onLayer('word')).toHaveLength(2)
  })

  it('states the reason for the last mark of a layer', () => {
    select('w2')

    expect(button('Merge with next')).toHaveAccessibleDescription(
      'This is the last mark of the layer.',
    )
  })

  it('states the reason for the last phoneme of a word', () => {
    select('f3')

    expect(button('Delete')).toHaveAccessibleDescription(
      'A word needs one phoneme or more. Delete the word.',
    )
  })

  it('asks for one mark when no mark is selected', () => {
    expect(button('Edit label')).toHaveAccessibleDescription('Select one mark first.')
    expect(button('Delete')).toHaveAccessibleDescription('Select a mark first.')
  })
})

describe('HelpLine', () => {
  const line = () => document.querySelector('.help-line')

  it('tells how to select, edit and add a mark when no mark is selected', () => {
    expect(line()).toHaveTextContent(`${HELP_TEXTS.none} ${HELP_TEXTS.shift}`)
  })

  it('tells how to drag a selected word', () => {
    select('w1')

    expect(line()).toHaveTextContent(`${HELP_TEXTS.mark} ${HELP_TEXTS.shift}`)
  })

  it('tells how to choose a mouth shape for a selected phoneme', () => {
    select('f1')

    expect(line()).toHaveTextContent(`${HELP_TEXTS.phoneme} ${HELP_TEXTS.shift}`)
  })

  it('drops the Shift text when more than one mark is selected', () => {
    select('w1', 'w2')

    expect(line()).toHaveTextContent(HELP_TEXTS.mark)
    expect(line()).not.toHaveTextContent(HELP_TEXTS.shift)
  })

  it('offers the zoom for a selected phoneme narrower than 12 px', () => {
    // At 0.05 px for each ms, the phoneme f1 of 1000 ms is 50 px. At 0.01 px it is 10 px.
    select('f1')
    expect(line()).not.toHaveTextContent(HELP_TEXTS.zoom)

    act(() => useViewStore.getState().setZoom(10))

    expect(line()).toHaveTextContent(HELP_TEXTS.zoom)
  })
})

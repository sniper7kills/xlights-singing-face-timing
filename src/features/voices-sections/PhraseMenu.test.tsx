import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { addVoice } from '../../store/actions/voices.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { Layers } from '../timeline-editor/Layers.tsx'
import { resetMarkUi } from '../timeline-editor/markUiStore.ts'
import { PhraseMenu } from './PhraseMenu.tsx'
import { useTransferStore } from './transferCommands.ts'

function phraseButton() {
  return screen.getByRole('button', { name: 'Phrase' })
}

function voiceOf(id: string) {
  return useSongStore.getState().current?.marks.find((mark) => mark.id === id)?.voiceId
}

/** Shows the layers of the open song with the phrase menu, so a test can follow the focus to a track. */
function EditorPart() {
  const content = useSongStore((state) => state.current)
  if (!content) return null
  return (
    <>
      <Layers content={content} />
      <PhraseMenu />
    </>
  )
}

function steps() {
  return useSongStore.getState().history.past.length
}

/** Opens the menu, selects the mode and returns the list of the target voices. */
async function openTargets(mode: 'Move to voice' | 'Copy to voice') {
  await userEvent.click(phraseButton())
  await userEvent.click(screen.getByRole('menuitem', { name: mode }))
  return screen.getByRole('menu', { name: mode })
}

beforeEach(() => {
  useSongStore.setState({ current: testContent(), history: emptyHistory() })
  useViewStore.getState().resetView()
  useTransferStore.setState({ pending: null })
  resetMarkUi()
})

describe('PhraseMenu', () => {
  it('disables the button with no selection or with a selected word', () => {
    render(<PhraseMenu />)
    expect(phraseButton()).toHaveAttribute('aria-disabled', 'true')
    expect(phraseButton()).toHaveAttribute('title', 'Select a phrase first.')
    expect(phraseButton()).toHaveAccessibleDescription('Select a phrase first.')

    act(() => useViewStore.getState().selectMarks(['p1', 'w1']))
    expect(phraseButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(phraseButton())
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('lists the other voices and "New voice", with no source voice', async () => {
    useViewStore.getState().selectMarks(['p2'])
    render(<PhraseMenu />)

    const list = await openTargets('Move to voice')

    expect(
      within(list)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Backing', 'New voice'])
  })

  it('moves the phrase to the chosen voice at once and clears the selection', async () => {
    useViewStore.getState().selectMarks(['p2'])
    render(<PhraseMenu />)

    const list = await openTargets('Move to voice')
    await userEvent.click(within(list).getByRole('menuitem', { name: 'Backing' }))

    expect(voiceOf('p2')).toBe(OTHER_VOICE)
    expect(useViewStore.getState().selectedMarkIds).toEqual([])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('gives the focus to the phrase track after a move', async () => {
    useViewStore.getState().setStageWidth(1000)
    useViewStore.getState().selectMarks(['p2'])
    render(<EditorPart />)

    const list = await openTargets('Move to voice')
    await userEvent.click(within(list).getByRole('menuitem', { name: 'Backing' }))

    await waitFor(() => expect(screen.getByRole('list', { name: 'Phrases' })).toHaveFocus())
  })

  it('copies the phrase to a new voice with the keyboard and keeps the selection', async () => {
    useViewStore.getState().selectMarks(['p2'])
    render(<PhraseMenu />)

    phraseButton().focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await userEvent.keyboard('{End}{Enter}')

    const voices = useSongStore.getState().current?.voices ?? []
    expect(voices.map((voice) => voice.name)).toEqual(['Lead', 'Backing', 'Voice 2'])
    expect(voiceOf('p2')).toBe(VOICE)
    expect(useViewStore.getState().selectedMarkIds).toEqual(['p2'])
    await waitFor(() => expect(phraseButton()).toHaveFocus())
  })

  it('shows the count in the confirm dialog, and "Cancel" changes nothing', async () => {
    useViewStore.getState().selectMarks(['p1'])
    render(<PhraseMenu />)

    const list = await openTargets('Copy to voice')
    await userEvent.click(within(list).getByRole('menuitem', { name: 'Backing' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Backing has 1 phrase in this range. Replace it?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('replaces the phrase in the range after "Continue" as one undo step', async () => {
    useViewStore.getState().selectMarks(['p1'])
    render(<PhraseMenu />)

    const list = await openTargets('Move to voice')
    await userEvent.click(within(list).getByRole('menuitem', { name: 'Backing' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(voiceOf('p1')).toBe(OTHER_VOICE)
    expect(voiceOf('q1')).toBeUndefined()
    expect(steps()).toBe(1)
  })

  it('closes the menu for Escape and gives the focus back to the button', async () => {
    useViewStore.getState().selectMarks(['p1'])
    render(<PhraseMenu />)

    await userEvent.click(phraseButton())
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(phraseButton()).toHaveFocus()
  })

  it('disables "New voice" at 12 voices with a tooltip', async () => {
    while ((useSongStore.getState().current?.voices.length ?? 0) < MAX_VOICES) addVoice('song-1')
    useViewStore.getState().selectMarks(['p2'])
    render(<PhraseMenu />)

    const list = await openTargets('Copy to voice')
    const item = within(list).getByRole('menuitem', { name: 'New voice' })
    await userEvent.click(item)

    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveAccessibleDescription('A song has 12 voices at most.')
    expect(useSongStore.getState().current?.voices).toHaveLength(MAX_VOICES)
  })
})

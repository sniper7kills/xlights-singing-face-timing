import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { OTHER_VOICE, testContent, VOICE } from '../../lib/marks/fixtures.test-helpers.ts'
import { addVoice } from '../../store/actions/voices.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { VoiceRail } from './VoiceRail.tsx'

function rows() {
  return within(screen.getByRole('list')).getAllByRole('listitem')
}

function selectButton(name: string) {
  return screen.getByRole('button', { name })
}

function voiceNames() {
  return useSongStore.getState().current?.voices.map((voice) => voice.name)
}

async function openMenu(name: string) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  return screen.getByRole('menu', { name: `Actions for ${name}` })
}

beforeEach(() => {
  useSongStore.setState({ current: testContent(), history: emptyHistory() })
  useViewStore.getState().resetView()
})

describe('VoiceRail', () => {
  it('lists the voices in order with the phrase count, and marks the shown voice', () => {
    render(<VoiceRail />)

    expect(screen.getByRole('complementary', { name: 'Voices' })).toBeInTheDocument()
    expect(rows().map((row) => row.textContent)).toEqual(['Lead3 phrases☺⋯', 'Backing1 phrase☺⋯'])
    expect(selectButton('Lead')).toHaveAccessibleDescription('3 phrases')
    expect(selectButton('Lead')).toHaveAttribute('aria-pressed', 'true')
    expect(selectButton('Backing')).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows a voice on the layers after a click and clears the mark selection', async () => {
    useViewStore.getState().selectMarks(['p1'])
    render(<VoiceRail />)

    await userEvent.click(selectButton('Backing'))

    expect(useViewStore.getState()).toMatchObject({
      selectedVoiceId: OTHER_VOICE,
      selectedMarkIds: [],
    })
    expect(selectButton('Backing')).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds "Voice 2" with no change of the shown voice', async () => {
    const content = testContent()
    useSongStore.setState({ current: { ...content, voices: content.voices.slice(0, 1) } })
    render(<VoiceRail />)

    await userEvent.click(screen.getByRole('button', { name: 'Add voice' }))

    expect(await screen.findByRole('button', { name: 'Voice 2' })).toBeInTheDocument()
    expect(selectButton('Lead')).toHaveAttribute('aria-pressed', 'true')
  })

  it('disables "Add voice" at 12 voices and states the limit', () => {
    for (let n = 0; n < 10; n += 1) addVoice('song-1')
    render(<VoiceRail />)

    const add = screen.getByRole('button', { name: 'Add voice' })
    expect(add).toBeDisabled()
    expect(add).toHaveAttribute('title', 'A song has 12 voices at most.')
    expect(add).toHaveAccessibleDescription('A song has 12 voices at most.')
  })

  it('has no "Delete" in the menu of the only voice', async () => {
    const content = testContent()
    useSongStore.setState({ current: { ...content, voices: content.voices.slice(0, 1) } })
    render(<VoiceRail />)

    const menu = await openMenu('Lead')

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Rename', 'Colour', 'Move up', 'Move down'])
    expect(within(menu).getByRole('menuitem', { name: 'Move up' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('VoiceRail rename', () => {
  it('shows the field error for a duplicate name and keeps the old name', async () => {
    render(<VoiceRail />)
    await userEvent.click(
      within(await openMenu('Backing')).getByRole('menuitem', { name: 'Rename' }),
    )

    const field = screen.getByRole('textbox', { name: 'Voice name' })
    await userEvent.clear(field)
    await userEvent.type(field, 'LEAD{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('A voice with this name exists.')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(voiceNames()).toEqual(['Lead', 'Backing'])
  })

  it('stores a new name with Enter as one undo step', async () => {
    render(<VoiceRail />)
    await userEvent.click(
      within(await openMenu('Backing')).getByRole('menuitem', { name: 'Rename' }),
    )

    // The field opens with its text selected, so the typed name replaces it.
    await userEvent.keyboard('Santa{Enter}')

    expect(await screen.findByRole('button', { name: 'Santa' })).toHaveFocus()
    expect(voiceNames()).toEqual(['Lead', 'Santa'])
    expect(useSongStore.getState().history.past).toHaveLength(1)
  })

  it('keeps the old name after Escape', async () => {
    render(<VoiceRail />)
    await userEvent.click(
      within(await openMenu('Backing')).getByRole('menuitem', { name: 'Rename' }),
    )

    await userEvent.type(screen.getByRole('textbox', { name: 'Voice name' }), 'Santa{Escape}')

    expect(await screen.findByRole('button', { name: 'Backing' })).toHaveFocus()
    expect(voiceNames()).toEqual(['Lead', 'Backing'])
  })
})

describe('VoiceRail menu', () => {
  it('sets a colour from the colour list and shows it on the chip', async () => {
    render(<VoiceRail />)
    await userEvent.click(within(await openMenu('Lead')).getByRole('menuitem', { name: 'Colour' }))

    const colours = screen.getByRole('menu', { name: 'Colour of Lead' })
    expect(within(colours).getAllByRole('menuitemradio')).toHaveLength(8)
    await userEvent.click(within(colours).getByRole('menuitemradio', { name: 'Sky' }))

    expect(useSongStore.getState().current?.voices[0]?.color).toBe('#4cc9f0')
    const chip = selectButton('Lead').querySelector('.voice-chip')
    expect(chip).toHaveStyle({ background: '#4cc9f0' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for Lead' })).toHaveFocus(),
    )
  })

  it('moves the second voice up with the keyboard', async () => {
    render(<VoiceRail />)
    screen.getByRole('button', { name: 'Actions for Backing' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(voiceNames()).toEqual(['Backing', 'Lead'])
    expect(rows()[0]).toHaveTextContent('Backing')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for Backing' })).toHaveFocus(),
    )
  })

  it('closes the menu with Escape and gives the focus back to the menu button', async () => {
    render(<VoiceRail />)
    await openMenu('Lead')

    await userEvent.keyboard('{End}{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for Lead' })).toHaveFocus(),
    )
  })

  it('closes the menu on a press outside the row', async () => {
    render(<VoiceRail />)
    await openMenu('Lead')

    await userEvent.click(screen.getByRole('heading', { name: 'Voices' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('VoiceRail mute', () => {
  it('mutes the face preview of a voice as one undo step, and a second click unmutes it', async () => {
    render(<VoiceRail />)
    const mute = screen.getByRole('button', { name: 'Mute face preview of Backing' })
    expect(mute).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(mute)

    expect(mute).toHaveAttribute('aria-pressed', 'true')
    expect(mute).toHaveTextContent('⊘')
    expect(useSongStore.getState().current?.voices.at(1)?.previewMuted).toBe(true)
    expect(useSongStore.getState().history.past).toHaveLength(1)
    expect(selectButton('Lead')).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(mute)
    expect(mute).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('VoiceRail delete', () => {
  it('deletes a voice with its marks after the confirm dialog, and one undo restores both', async () => {
    render(<VoiceRail />)
    await userEvent.click(within(await openMenu('Lead')).getByRole('menuitem', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog', { name: 'The app deletes “Lead” and its marks.' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(voiceNames()).toEqual(['Backing'])
    expect(useSongStore.getState().current?.marks.some((mark) => mark.voiceId === VOICE)).toBe(
      false,
    )
    expect(screen.getByRole('button', { name: 'Add voice' })).toHaveFocus()

    act(() => useSongStore.getState().undo())
    expect(useSongStore.getState().current).toEqual(testContent())
  })

  it('keeps the voice after Cancel and gives the focus back to the menu button', async () => {
    render(<VoiceRail />)
    await userEvent.click(within(await openMenu('Lead')).getByRole('menuitem', { name: 'Delete' }))

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(voiceNames()).toEqual(['Lead', 'Backing'])
    expect(screen.getByRole('button', { name: 'Actions for Lead' })).toHaveFocus()
  })
})

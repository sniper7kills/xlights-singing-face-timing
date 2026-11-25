import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { testContent } from '../../lib/marks/fixtures.test-helpers.ts'
import { emptyHistory } from '../../store/history.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { AddSectionAction } from './AddSectionAction.tsx'

const sections = () => useSongStore.getState().current?.sections ?? []

function addButton() {
  return screen.getByRole('button', { name: 'Add section' })
}

beforeEach(() => {
  useSongStore.setState({ current: testContent(), history: emptyHistory() })
  useViewStore.getState().resetView()
})

describe('AddSectionAction', () => {
  it('is disabled with no time selection', () => {
    render(<AddSectionAction />)

    expect(addButton()).toBeDisabled()
  })

  it('adds a section from the time selection with the default name', async () => {
    useViewStore.getState().setSelection({ startMs: 1000, endMs: 2500 })
    render(<AddSectionAction />)

    await userEvent.click(addButton())
    const field = screen.getByRole('textbox', { name: 'Section name' })
    expect(field).toHaveValue('Section 1')
    expect(field).toHaveAttribute('maxLength', '40')
    await userEvent.keyboard('{Enter}')

    expect(sections()).toMatchObject([{ name: 'Section 1', startMs: 1000, endMs: 2500 }])
    expect(useSongStore.getState().history.past).toHaveLength(1)
    expect(addButton()).toHaveFocus()
  })

  it('uses the typed name', async () => {
    useViewStore.getState().setSelection({ startMs: 1000, endMs: 2500 })
    render(<AddSectionAction />)

    await userEvent.click(addButton())
    await userEvent.keyboard('Verse 1{Enter}')

    expect(sections()[0]?.name).toBe('Verse 1')
  })

  it('shows the message and adds nothing for a range under 1 second', async () => {
    useViewStore.getState().setSelection({ startMs: 1000, endMs: 1500 })
    render(<AddSectionAction />)

    await userEvent.click(addButton())
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No room for a section here. Select a free range of 1 second or more.',
    )
    expect(sections()).toEqual([])
  })

  it('closes the field for Escape and adds nothing', async () => {
    useViewStore.getState().setSelection({ startMs: 1000, endMs: 2500 })
    render(<AddSectionAction />)

    await userEvent.click(addButton())
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(addButton()).toHaveFocus()
    expect(sections()).toEqual([])
  })

  it('keeps the field open for a name with only spaces', async () => {
    useViewStore.getState().setSelection({ startMs: 1000, endMs: 2500 })
    render(<AddSectionAction />)

    await userEvent.click(addButton())
    await userEvent.keyboard('{Backspace}   {Enter}')

    expect(screen.getByRole('textbox', { name: 'Section name' })).toBeInTheDocument()
    expect(sections()).toEqual([])
  })
})

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveExportOptions } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import { ExportAction } from './ExportAction.tsx'
import { makeContent, makeSungPhrase, makeVoice } from './exportFixtures.test-helpers.ts'

const content = makeContent(
  [makeVoice('v1', 'Lead Vocals', 0), makeVoice('v2', 'Santa', 1)],
  [...makeSungPhrase('v1', 1000), ...makeSungPhrase('v2', 3000)],
)

afterEach(() => {
  act(() => useSongStore.getState().closeSong())
})

describe('ExportAction', () => {
  it('shows nothing when no song is open', () => {
    const { container } = render(<ExportAction />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the export dialog and gives the focus back to "Export" on close', async () => {
    const user = userEvent.setup()
    useSongStore.setState({ current: content })
    render(<ExportAction />)

    await user.click(screen.getByRole('button', { name: 'Export' }))
    expect(await screen.findByRole('dialog', { name: 'Export to xLights' })).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus()
  })

  it('opens the dialog with the options of the previous export of the song', async () => {
    const user = userEvent.setup()
    await saveExportOptions('song-1', {
      voiceIds: ['v2'],
      grouping: 'voice',
      packaging: 'file-per-track',
      writeRest: true,
      trackNames: { v2: 'Elf' },
    })
    useSongStore.setState({ current: content })
    render(<ExportAction />)

    await user.click(screen.getByRole('button', { name: 'Export' }))

    await screen.findByRole('dialog')
    expect(screen.getByRole('checkbox', { name: 'Lead Vocals' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Santa' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'One file for each timing track' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Write rest phonemes in gaps' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Timing track name 1' })).toHaveValue('Elf')
  })

  it('remembers the options of a download for the next export', async () => {
    const user = userEvent.setup()
    useSongStore.setState({ current: content })
    render(<ExportAction />)
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByRole('radio', { name: 'One file for each timing track' }))

    await user.click(screen.getByRole('button', { name: 'Download' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(
      await screen.findByRole('radio', { name: 'One file for each timing track' }),
    ).toBeChecked()
  })
})

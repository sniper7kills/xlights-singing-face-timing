import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as db from '../../store/db.ts'
import { saveExportOptions } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import { downloadFiles } from './download.ts'
import { ExportAction } from './ExportAction.tsx'
import { makeContent, makeSungPhrase, makeVoice } from './exportFixtures.test-helpers.ts'

// jsdom has no object URL support, so the tests check the files that reach the download.
vi.mock('./download.ts', () => ({ downloadFiles: vi.fn() }))

const content = makeContent(
  [makeVoice('v1', 'Lead Vocals', 0), makeVoice('v2', 'Santa', 1)],
  [...makeSungPhrase('v1', 1000), ...makeSungPhrase('v2', 3000)],
)

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(downloadFiles).mockClear()
  act(() => useSongStore.getState().closeSong())
})

describe('ExportAction', () => {
  it('gives the files to the browser as downloads and keeps the dialog open', async () => {
    const user = userEvent.setup()
    useSongStore.setState({ current: content })
    render(<ExportAction />)
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByRole('radio', { name: 'One file for each timing track' }))

    await user.click(screen.getByRole('button', { name: 'Download' }))

    await vi.waitFor(() => expect(downloadFiles).toHaveBeenCalled())
    expect(vi.mocked(downloadFiles).mock.calls[0]?.[0].map((file) => file.name)).toEqual([
      'Carol - Lead Vocals.xtiming',
      'Carol - Santa.xtiming',
    ])
    expect(screen.getByRole('dialog', { name: 'Export to xLights' })).toBeInTheDocument()
  })

  it('shows nothing when no song is open', () => {
    const { container } = render(<ExportAction />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the export dialog and gives the focus back to "Export" on close', async () => {
    const user = userEvent.setup()
    useSongStore.setState({ current: content })
    render(<ExportAction />)

    await user.click(screen.getByRole('button', { name: 'Export' }))
    // The dialog opens after a read of the stored options from IndexedDB and a full build of the checks.
    // A loaded machine that runs the full parallel suite can need more than the default 1000 ms for this path.
    const dialog = await screen.findByRole(
      'dialog',
      { name: 'Export to xLights' },
      { timeout: 5000 },
    )
    // The dialog takes the focus in an effect after it mounts, so the focus can arrive one render later.
    await waitFor(() => expect(dialog).toHaveFocus(), { timeout: 5000 })
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus(), {
      timeout: 5000,
    })
  })

  it('opens the dialog with the options of the previous export of the song', async () => {
    const user = userEvent.setup()
    await saveExportOptions('song-1', {
      voiceIds: ['v2'],
      grouping: 'voice',
      packaging: 'file-per-track',
      writeRest: true,
      trackNames: { v2: 'Elf' },
      knownVoiceIds: ['v1', 'v2'],
    })
    useSongStore.setState({ current: content })
    render(<ExportAction />)

    await user.click(screen.getByRole('button', { name: 'Export' }))

    await screen.findByRole('dialog')
    expect(screen.getByRole('checkbox', { name: 'Lead Vocals' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Santa' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'One file for each timing track' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Write rest phonemes in gaps' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Name of the timing track for Santa' })).toHaveValue(
      'Elf',
    )
  })

  it('opens the dialog with the default options when the stored options do not load', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'loadExportOptions').mockRejectedValue(new Error('The database is closed.'))
    useSongStore.setState({ current: content })
    render(<ExportAction />)

    await user.click(screen.getByRole('button', { name: 'Export' }))

    await screen.findByRole('dialog', { name: 'Export to xLights' })
    expect(screen.getByRole('checkbox', { name: 'Lead Vocals' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Santa' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'One file with all timing tracks' })).toBeChecked()
  })

  it('remembers the options of a download for the next export', async () => {
    const user = userEvent.setup()
    useSongStore.setState({ current: content })
    render(<ExportAction />)
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByRole('radio', { name: 'One file for each timing track' }))

    await user.click(screen.getByRole('button', { name: 'Download' }))
    await vi.waitFor(() => expect(screen.getByRole('status')).not.toBeEmptyDOMElement())
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(
      await screen.findByRole('radio', { name: 'One file for each timing track' }),
    ).toBeChecked()
  })
})

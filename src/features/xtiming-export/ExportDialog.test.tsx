import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportOptions } from '../../lib/xtiming/types.ts'
import * as db from '../../store/db.ts'
import { loadExportOptions, StorageFullError } from '../../store/db.ts'
import type { SongContent } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { Layers } from '../timeline-editor/Layers.tsx'
import { ExportDialog } from './ExportDialog.tsx'
import {
  makeContent,
  makeOptions,
  makeSection,
  makeSungPhrase,
  makeVoice,
} from './exportFixtures.test-helpers.ts'

const lead = makeVoice('v1', 'Lead Vocals', 0)
const santa = makeVoice('v2', 'Santa', 1)
const elf = makeVoice('v3', 'Elf Choir', 2)

function renderDialog(content: SongContent, options: ExportOptions = makeOptions(content)) {
  const onClose = vi.fn()
  const onDownload = vi.fn()
  render(
    <ExportDialog
      content={content}
      initialOptions={options}
      onClose={onClose}
      onDownload={onDownload}
    />,
  )
  return { onClose, onDownload }
}

function download() {
  return screen.getByRole('button', { name: 'Download' })
}

function trackNames() {
  return screen
    .queryAllByRole('textbox', { name: /^Name of the timing track for / })
    .map((input) => {
      return (input as HTMLInputElement).value
    })
}

function preview() {
  return screen.getByLabelText('File preview').textContent ?? ''
}

const twoVoices = makeContent(
  [lead, santa],
  [...makeSungPhrase('v1', 1000), ...makeSungPhrase('v2', 3000)],
)

afterEach(() => {
  vi.restoreAllMocks()
  useViewStore.getState().resetView()
})

describe('ExportDialog', () => {
  it('opens as a labelled modal dialog with the focus inside', () => {
    renderDialog(twoVoices)

    const dialog = screen.getByRole('dialog', { name: 'Export to xLights' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
  })

  it('shows the frame size of the song', () => {
    renderDialog(twoVoices)

    expect(screen.getByText('Carol · Frame size: 50 ms')).toBeInTheDocument()
  })

  it('shows a checked check box for each of 3 voices', () => {
    renderDialog(makeContent([lead, santa, elf], makeSungPhrase('v1', 0)))

    const voices = within(screen.getByRole('group', { name: 'Voices' })).getAllByRole('checkbox')
    expect(voices).toHaveLength(3)
    for (const voice of voices) expect(voice).toBeChecked()
  })

  it('is ready with "Download" enabled when no finding exists', () => {
    renderDialog(twoVoices)

    expect(download()).toBeEnabled()
    expect(screen.getByText('Checks · 0 errors · 0 warnings')).toBeInTheDocument()
  })

  it('is blocked with "Download" disabled and the checks open when an error exists', () => {
    renderDialog(makeContent([lead, santa], makeSungPhrase('v1', 1000)))

    expect(download()).toBeDisabled()
    const checks = screen.getByText('Checks · 1 error · 0 warnings').closest('details')
    expect(checks).toHaveAttribute('open')
  })

  it('shows the warning count and keeps "Download" enabled for warnings only', () => {
    const marks = makeSungPhrase('v1', 1000).filter((mark) => mark.layer !== 'phoneme')
    renderDialog(makeContent([lead], marks))

    expect(download()).toBeEnabled()
    expect(screen.getByText('Checks · 0 errors · 1 warning')).toBeInTheDocument()
  })

  it('shows the empty state and disables "Download" when the song has no marks', () => {
    renderDialog(makeContent([lead], []))

    expect(screen.getByText('No marks to export. Transcribe the song first.')).toBeInTheDocument()
    expect(download()).toBeDisabled()
    expect(screen.queryByLabelText('File preview')).not.toBeInTheDocument()
  })

  it('lists 2 timing tracks for 2 voices and updates the list when a voice is cleared', async () => {
    const user = userEvent.setup()
    renderDialog(twoVoices)
    expect(trackNames()).toEqual(['Lead Vocals', 'Santa'])

    await user.click(screen.getByRole('checkbox', { name: 'Santa' }))

    expect(trackNames()).toEqual(['Lead Vocals'])
    await user.click(screen.getByRole('checkbox', { name: 'Santa' }))
    expect(trackNames()).toEqual(['Lead Vocals', 'Santa'])
  })

  it('lists 6 timing tracks for 2 voices and 3 sections with grouping by voice and section', async () => {
    const user = userEvent.setup()
    const sections = [
      makeSection('s1', 'Verse 1', 0, 2000),
      makeSection('s2', 'Chorus', 2000, 4000),
      makeSection('s3', 'Verse 2', 4000, 6000),
    ]
    const marks = [500, 2500, 4500].flatMap((ms) => [
      ...makeSungPhrase('v1', ms),
      ...makeSungPhrase('v2', ms),
    ])
    renderDialog(makeContent([lead, santa], marks, sections))

    await user.click(
      screen.getByRole('radio', { name: 'One timing track for each voice and section' }),
    )

    expect(trackNames()).toEqual([
      'Lead Vocals - Verse 1',
      'Lead Vocals - Chorus',
      'Lead Vocals - Verse 2',
      'Santa - Verse 1',
      'Santa - Chorus',
      'Santa - Verse 2',
    ])
  })

  it('labels each name input with the default name of its timing track', async () => {
    const user = userEvent.setup()
    const sections = [makeSection('s1', 'Chorus', 0, 2000)]
    const marks = [...makeSungPhrase('v1', 500), ...makeSungPhrase('v1', 5000)]
    const content = makeContent([lead], marks, sections)
    renderDialog(content, { ...makeOptions(content), trackNames: { v1: 'Soloist' } })
    expect(
      screen.getByRole('textbox', { name: 'Name of the timing track for Lead Vocals' }),
    ).toHaveValue('Soloist')

    await user.click(
      screen.getByRole('radio', { name: 'One timing track for each voice and section' }),
    )

    expect(
      screen.getByRole('textbox', { name: 'Name of the timing track for Lead Vocals - Chorus' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', {
        name: 'Name of the timing track for Lead Vocals - Unsectioned',
      }),
    ).toBeInTheDocument()
  })

  it('gives the file preview the role of a named region', () => {
    renderDialog(twoVoices)

    expect(screen.getByRole('region', { name: 'File preview' }).tagName).toBe('PRE')
  })

  it('shows "Select one voice or more." beside the disabled "Download" when no voice is selected', async () => {
    const user = userEvent.setup()
    renderDialog(makeContent([lead], makeSungPhrase('v1', 1000)))
    expect(screen.queryByText('Select one voice or more.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Lead Vocals' }))

    expect(download()).toBeDisabled()
    expect(download()).toHaveAccessibleDescription('Select one voice or more.')
  })

  it('disables grouping by section with a hint when the song has no sections', () => {
    renderDialog(twoVoices)

    const grouping = screen.getByRole('radio', {
      name: 'One timing track for each voice and section',
    })
    expect(grouping).toBeDisabled()
    expect(grouping).toHaveAccessibleDescription('This song has no sections.')
  })

  it('previews the file of each timing track with one file for each timing track', async () => {
    const user = userEvent.setup()
    renderDialog(twoVoices)
    expect(screen.getByRole('heading', { name: 'Preview · Carol.xtiming' })).toBeInTheDocument()
    expect(screen.getByText('2 timing tracks · 1 file')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'One file for each timing track' }))

    expect(
      screen.getByRole('heading', { name: 'Preview · Carol - Lead Vocals.xtiming' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2 timing tracks · 2 files')).toBeInTheDocument()
  })

  it('writes rest phonemes into the preview when the option is on', async () => {
    const user = userEvent.setup()
    renderDialog(
      makeContent([lead], [...makeSungPhrase('v1', 1000), ...makeSungPhrase('v1', 3000)]),
    )
    const restOption = screen.getByRole('checkbox', { name: 'Write rest phonemes in gaps' })
    expect(restOption).not.toBeChecked()

    await user.click(restOption)

    expect(preview()).toContain('<Effect label="rest" starttime="2000" endtime="3000" />')
  })

  it('shows the first 40 lines of the file in the preview', () => {
    const marks = Array.from({ length: 30 }, (_, i) => makeSungPhrase('v1', i * 1000)).flat()
    renderDialog(makeContent([lead], marks))

    const lines = preview().split('\n')
    expect(lines).toHaveLength(40)
    expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>')
  })

  it('writes an edited timing track name into the preview', async () => {
    const user = userEvent.setup()
    renderDialog(twoVoices)

    const name = screen.getByRole('textbox', { name: 'Name of the timing track for Santa' })
    await user.clear(name)
    await user.type(name, 'Soloist')

    expect(preview()).toContain('<timing name="Soloist"')
  })

  it('disables "Download" when two timing tracks have one name', async () => {
    const user = userEvent.setup()
    renderDialog(twoVoices)

    const name = screen.getByRole('textbox', { name: 'Name of the timing track for Santa' })
    await user.clear(name)
    await user.type(name, 'Lead Vocals')

    expect(download()).toBeDisabled()
    expect(screen.getByText(/Checks · 1 error/)).toBeInTheDocument()
  })

  it('closes and selects the mark of a finding that the person clicks', async () => {
    const user = userEvent.setup()
    const marks = makeSungPhrase('v1', 1000).filter((mark) => mark.layer !== 'phoneme')
    const { onClose } = renderDialog(makeContent([lead], marks))

    await user.click(screen.getByText('Checks · 0 errors · 1 warning'))
    await user.click(screen.getByRole('button', { name: /warning/ }))

    expect(onClose).toHaveBeenCalled()
    expect(useViewStore.getState().selectedMarkIds).toEqual(['v1-1000-word'])
  })

  it('shows the voice of a finding in the layers with its mark selected', async () => {
    const user = userEvent.setup()
    useViewStore.getState().setStageWidth(1000)
    const santaMarks = makeSungPhrase('v2', 3000)
      .filter((mark) => mark.layer !== 'phoneme')
      .map((mark) => (mark.layer === 'word' ? { ...mark, label: 'Ho' } : mark))
    const content = makeContent([lead, santa], [...makeSungPhrase('v1', 1000), ...santaMarks])
    render(<Layers content={content} />)
    const words = () => within(screen.getByRole('list', { name: 'Words' })).getAllByRole('listitem')
    expect(words().map((word) => word.textContent)).toEqual(['Noel'])
    expect(words()[0]).not.toHaveAttribute('aria-current')
    renderDialog(content)

    await user.click(screen.getByText('Checks · 0 errors · 1 warning'))
    await user.click(screen.getByRole('button', { name: /“Ho” at 0:03.000 has no phoneme/ }))

    expect(words().map((word) => word.textContent)).toEqual(['Ho'])
    expect(words()[0]).toHaveAttribute('aria-current', 'true')
    const phrase = within(screen.getByRole('list', { name: 'Phrases' })).getByRole('listitem')
    expect(phrase).not.toHaveAttribute('aria-current')
  })

  it('scrolls a zoomed editor to the mark of a finding', async () => {
    const user = userEvent.setup()
    useViewStore.getState().setZoom(200)
    const marks = makeSungPhrase('v1', 1000).filter((mark) => mark.layer !== 'phoneme')
    renderDialog(makeContent([lead], marks))

    await user.click(screen.getByText('Checks · 0 errors · 1 warning'))
    await user.click(screen.getByRole('button', { name: /warning/ }))

    expect(useViewStore.getState().scrollMs).toBe(1000)
  })

  it('shows a finding without a mark as text and not as a button', () => {
    renderDialog(makeContent([lead, santa], makeSungPhrase('v1', 1000)))

    expect(screen.getByText(/Santa/, { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /error/ })).not.toBeInTheDocument()
  })

  it('closes on Escape and on "Close"', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog(twoVoices)

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps a key press inside the dialog away from the editor shortcuts', async () => {
    const user = userEvent.setup()
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    renderDialog(twoVoices)

    await user.keyboard(' ')

    window.removeEventListener('keydown', onWindowKey)
    expect(onWindowKey).not.toHaveBeenCalled()
  })

  it('keeps the focus inside the dialog with Tab and Shift+Tab', async () => {
    const user = userEvent.setup()
    renderDialog(twoVoices)

    await user.tab({ shift: true })
    expect(download()).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'Lead Vocals' })).toHaveFocus()
  })

  it('stores the options and gives the files to the download on "Download"', async () => {
    const user = userEvent.setup()
    const { onDownload } = renderDialog(twoVoices)
    await user.click(screen.getByRole('radio', { name: 'One file for each timing track' }))

    await user.click(download())

    await vi.waitFor(() => expect(onDownload).toHaveBeenCalled())
    const files = onDownload.mock.calls[0]?.[0] as { name: string; text: string }[]
    expect(files.map((file) => file.name)).toEqual([
      'Carol - Lead Vocals.xtiming',
      'Carol - Santa.xtiming',
    ])
    expect((await loadExportOptions('song-1'))?.packaging).toBe('file-per-track')
  })

  it('stays open after a download with the done line and the import steps expanded', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog(twoVoices)
    const steps = screen.getByText('Next, in xLights').closest('details')
    expect(steps).not.toHaveAttribute('open')

    await user.click(download())

    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '2 timing tracks written to Carol.xtiming',
      ),
    )
    expect(steps).toHaveAttribute('open')
    expect(within(steps as HTMLElement).getAllByRole('listitem')).toHaveLength(7)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('names the count of files in the done line for one file for each timing track', async () => {
    const user = userEvent.setup()
    renderDialog(twoVoices, { ...makeOptions(twoVoices), packaging: 'file-per-track' })

    await user.click(download())

    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('2 timing tracks written to 2 files'),
    )
  })

  it('removes the done line when the person changes an option', async () => {
    const user = userEvent.setup()
    renderDialog(twoVoices)
    await user.click(download())
    await vi.waitFor(() => expect(screen.getByRole('status')).not.toBeEmptyDOMElement())

    await user.click(screen.getByRole('checkbox', { name: 'Write rest phonemes in gaps' }))

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows the hint about blocked downloads only when several files download', async () => {
    const user = userEvent.setup()
    const hint =
      'The browser can block several downloads. If files are missing, allow downloads for this site, or select One file.'
    renderDialog(twoVoices)
    expect(screen.queryByText(hint)).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'One file for each timing track' }))

    expect(screen.getByText(hint)).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: 'One file for each timing track' }),
    ).toHaveAccessibleDescription(hint)
  })

  it('shows no hint about blocked downloads for one file for each timing track with one file', () => {
    const oneVoice = makeContent([lead], makeSungPhrase('v1', 1000))
    renderDialog(oneVoice, { ...makeOptions(oneVoice), packaging: 'file-per-track' })

    expect(screen.queryByText(/The browser can block several downloads/)).not.toBeInTheDocument()
  })

  it('shows the storage-full message and keeps the dialog when the options do not save', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'saveExportOptions').mockRejectedValue(new StorageFullError())
    const { onDownload } = renderDialog(twoVoices)

    await user.click(download())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Browser storage is full. Delete a song and try again.',
    )
    expect(onDownload).not.toHaveBeenCalled()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as db from '../../store/db.ts'
import { loadExportOptions, putCustomEntryRecords } from '../../store/db.ts'
import type { AudioFile, SongContent } from '../../store/types.ts'
import { ExportDialog } from './ExportDialog.tsx'
import type { DialogExportOptions } from './exportOptionsStore.ts'
import {
  makeContent,
  makeOptions,
  makeSungPhrase,
  makeVoice,
} from './exportFixtures.test-helpers.ts'
import type { ZipDownload } from './songZip.ts'
import { makeReport, makeTrack } from '../../lib/runReport/report.test-helpers.ts'

const lead = makeVoice('v1', 'Lead Vocals', 0)
const santa = makeVoice('v2', 'Santa', 1)
const oneVoice = makeContent([lead], makeSungPhrase('v1', 1000))
const twoVoices = makeContent(
  [lead, santa],
  [...makeSungPhrase('v1', 1000), ...makeSungPhrase('v2', 3000)],
)
const AUDIO_MESSAGE =
  'The app could not read the audio file of this song. Download the timing files without the zip.'

function audioFile(data: Blob = new Blob([new Uint8Array([1, 2, 3])])): AudioFile {
  return { songId: 'song-1', data, fileName: 'carol.ogg', mimeType: 'audio/ogg', byteLength: 3 }
}

function renderDialog(content: SongContent, options: DialogExportOptions = makeOptions(content)) {
  const onDownload = vi.fn()
  const onDownloadZip = vi.fn<(zip: ZipDownload) => void>()
  render(
    <ExportDialog
      content={content}
      initialOptions={options}
      onClose={vi.fn()}
      onDownload={onDownload}
      onDownloadZip={onDownloadZip}
    />,
  )
  return { onDownload, onDownloadZip }
}

function zipChoice() {
  return screen.getByRole('checkbox', { name: 'Everything as one zip file' })
}

// The reader parses the central directory, so the test does not trust the order of the writer.
async function entryNames(blob: Blob): Promise<string[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const end = bytes.length - 22
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const names: string[] = []
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    names.push(new TextDecoder().decode(bytes.slice(at + 46, at + 46 + nameLength)))
    at += 46 + nameLength + extraLength + commentLength
  }
  return names
}

afterEach(() => {
  vi.restoreAllMocks()
})

// The zip is built from an audio file after two storage reads. The default limit of 1 second is too short on a busy machine.
const WAIT = { timeout: 5000 }

describe('ExportDialog with the zip file', () => {
  it('offers "Everything as one zip file", not selected for a first export', () => {
    renderDialog(oneVoice)

    expect(zipChoice()).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled()
  })

  it('lists the entries and the size of the zip file under the choice and renames the button', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(audioFile())
    renderDialog(oneVoice)

    await user.click(zipChoice())

    expect(
      await screen.findByText(
        /^The zip file holds 5 files: timing\/Carol\.xtiming, audio\/carol\.ogg, song\.json, lyrics\.txt, README\.txt\. Size: 3 KB\.$/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download zip' })).toBeEnabled()
    expect(screen.getByText('1 timing track · 1 file')).toBeInTheDocument()
  })

  it('adds the kept tracks and the run report to the list, the size and the zip file', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(audioFile())
    // 1 MB for each track, so the size shows the bytes of the tracks.
    const tracks = { vocals: makeTrack(524_288), instruments: makeTrack(524_288) }
    vi.spyOn(db, 'loadRunData').mockResolvedValue({
      songId: 'song-1',
      tracks,
      singerSegments: [],
      report: makeReport(),
    })
    const { onDownloadZip } = renderDialog(oneVoice)

    await user.click(zipChoice())
    await screen.findByText(
      /^The zip file holds 8 files: timing\/Carol\.xtiming, audio\/carol\.ogg, song\.json, lyrics\.txt, tracks\/vocals\.wav, tracks\/instruments\.wav, report\.txt, README\.txt\. Size: 2\.0 MB\.$/,
    )
    await user.click(await screen.findByRole('button', { name: 'Download zip' }))

    await vi.waitFor(() => expect(onDownloadZip).toHaveBeenCalledOnce(), WAIT)
    const blob = onDownloadZip.mock.calls[0]?.[0].blob ?? new Blob()
    expect(await entryNames(blob)).toEqual([
      'timing/Carol.xtiming',
      'audio/carol.ogg',
      'song.json',
      'lyrics.txt',
      'tracks/vocals.wav',
      'tracks/instruments.wav',
      'report.txt',
      'README.txt',
    ])
  })

  it('gives <song name>.zip with the entries to the download and stores the choice', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(audioFile())
    const { onDownload, onDownloadZip } = renderDialog(oneVoice)

    await user.click(zipChoice())
    // The dialog reads the audio from storage first. A click before that read ends starts no zip.
    await screen.findByText(/^The zip file holds/)
    await user.click(await screen.findByRole('button', { name: 'Download zip' }))

    await vi.waitFor(() => expect(onDownloadZip).toHaveBeenCalledOnce(), WAIT)
    const zip = onDownloadZip.mock.calls[0]?.[0]
    expect(zip?.name).toBe('Carol.zip')
    expect(await entryNames(zip?.blob ?? new Blob())).toEqual([
      'timing/Carol.xtiming',
      'audio/carol.ogg',
      'song.json',
      'lyrics.txt',
      'README.txt',
    ])
    expect(onDownload).not.toHaveBeenCalled()
    expect(await screen.findByText('1 timing track written to Carol.zip')).toBeInTheDocument()
    expect((await loadExportOptions('song-1'))?.zip).toBe(true)
  })

  it('adds the file with all timing tracks and shows no hint about blocked downloads', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(audioFile())
    const { onDownloadZip } = renderDialog(twoVoices, {
      ...makeOptions(twoVoices),
      packaging: 'file-per-track',
      zip: true,
    })

    expect(zipChoice()).toBeChecked()
    // The dialog reads the audio from storage first. A click before that read ends starts no zip.
    await screen.findByText(/^The zip file holds/)
    await user.click(await screen.findByRole('button', { name: 'Download zip' }))

    await vi.waitFor(() => expect(onDownloadZip).toHaveBeenCalledOnce(), WAIT)
    const names = await entryNames(onDownloadZip.mock.calls[0]?.[0].blob ?? new Blob())
    expect(names.slice(0, 3)).toEqual([
      'timing/Carol - Lead Vocals.xtiming',
      'timing/Carol - Santa.xtiming',
      'timing/Carol - all.xtiming',
    ])
    expect(screen.queryByText(/The browser can block several downloads/)).not.toBeInTheDocument()
  })

  it('adds custom-dictionary.txt when the custom dictionary has an entry', async () => {
    const user = userEvent.setup()
    await putCustomEntryRecords([{ word: 'NOEL', symbols: 'N OW0 EH1 L', updatedAt: '' }])
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(audioFile())
    renderDialog(oneVoice)

    await user.click(zipChoice())

    expect(await screen.findByText(/custom-dictionary\.txt, README\.txt\./)).toBeInTheDocument()
  })

  it('disables "Download zip" while an error finding exists', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(audioFile())
    renderDialog(makeContent([lead, santa], makeSungPhrase('v1', 1000)))

    await user.click(zipChoice())

    await screen.findByText(/^The zip file holds/)
    expect(screen.getByRole('button', { name: 'Download zip' })).toBeDisabled()
  })

  it('shows the audio read message and disables "Download zip" when the song has no audio file', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(undefined)
    renderDialog(oneVoice)

    await user.click(zipChoice())

    expect(await screen.findByText(AUDIO_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download zip' })).toBeDisabled()
  })

  it('shows the audio read message and stays open when the audio bytes cannot be read', async () => {
    const user = userEvent.setup()
    const broken = new Blob([])
    vi.spyOn(broken, 'arrayBuffer').mockRejectedValue(new DOMException('gone', 'NotReadableError'))
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(audioFile(broken))
    const { onDownloadZip } = renderDialog(oneVoice)

    await user.click(zipChoice())
    // The dialog reads the audio from storage first. A click before that read ends starts no zip.
    await screen.findByText(/^The zip file holds/)
    await user.click(await screen.findByRole('button', { name: 'Download zip' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(AUDIO_MESSAGE)
    expect(onDownloadZip).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Export to xLights' })).toBeInTheDocument()
  })

  it('gives the timing files without the zip file after the person clears the choice', async () => {
    const user = userEvent.setup()
    vi.spyOn(db, 'getAudioFile').mockResolvedValue(audioFile())
    const { onDownload, onDownloadZip } = renderDialog(oneVoice, {
      ...makeOptions(oneVoice),
      zip: true,
    })

    await screen.findByText(/^The zip file holds/)
    await user.click(zipChoice())
    await user.click(screen.getByRole('button', { name: 'Download' }))

    await vi.waitFor(() => expect(onDownload).toHaveBeenCalledOnce(), WAIT)
    expect(onDownloadZip).not.toHaveBeenCalled()
  })
})

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SingerDiagnostics } from '../../lib/singers/diagnostics.ts'
import { reportToText, type RunReport } from '../../lib/runReport/runReport.ts'
import { saveRunData } from '../../store/db.ts'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { useSongStore } from '../../store/songStore.ts'
import { downloadFiles } from '../xtiming-export/download.ts'
import { NO_RUN_NOTE, RunReportAction } from './RunReportAction.tsx'
import { closeRunReport, openRunReport } from './runReportPanelStore.ts'

vi.mock('../xtiming-export/download.ts', () => ({ downloadFiles: vi.fn() }))

const CONTENT = makeSongContent()

const DIAGNOSTICS: SingerDiagnostics = {
  audioMs: 30_000,
  windowCount: 30,
  framesWithSpeech: 1700,
  sungMs: 28_000,
  embeddingCount: 7,
  droppedEmbeddings: 0,
  settings: {
    threshold: 0.7,
    minGroupSize: 1,
    maxSingers: 12,
    minSingerShare: 0.05,
    minSingerMs: 3000,
  },
  rawGroupCount: 3,
  rawGroups: [
    { group: 0, sungMs: 14_000, embeddingCount: 3, fate: { kind: 'kept', singer: 0 } },
    { group: 1, sungMs: 13_600, embeddingCount: 3, fate: { kind: 'kept', singer: 1 } },
    { group: 2, sungMs: 400, embeddingCount: 1, fate: { kind: 'joined', into: 0, reason: 'time' } },
  ],
  centroidDistances: { min: 0.52, median: 0.81, max: 1.1 },
  finalSingerCount: 2,
  singers: [
    { singer: 0, sungMs: 14_400, rangeCount: 1 },
    { singer: 1, sungMs: 13_600, rangeCount: 1 },
  ],
}

function report(wordCount = 16): RunReport {
  return {
    startedAt: '2026-11-24T10:00:00.000Z',
    build: 'abc1234',
    source: 'browser',
    endpointHost: null,
    mode: 'model',
    speechModel: 'whisper-base',
    device: 'wasm',
    separationModel: 'spleeter',
    separationFallback: false,
    singers: {
      status: 'split',
      failureKind: null,
      diagnostics: DIAGNOSTICS,
      rangeCount: 2,
      singersWithPhrases: 2,
      phrasesWithNoSinger: 0,
      phrasesWithMoreSingers: 1,
      voicesMade: 2,
    },
    voices: [
      { name: 'Lead Vocals', phraseCount: 2, made: false },
      { name: 'Singer 2', phraseCount: 1, made: true },
    ],
    phraseCount: 3,
    wordCount,
    estimatedCount: 0,
    unknownCount: 0,
    range: { startMs: 0, endMs: 28_900 },
    frameMs: 50,
    durationsMs: { prepare: 100, transcribe: 2000 },
    notes: [],
  }
}

async function storeReport(value: RunReport) {
  await act(() => saveRunData({ songId: CONTENT.song.id, singerSegments: [], report: value }))
}

function action(): HTMLElement {
  return screen.getByRole('button', { name: 'Run report' })
}

async function openPanel() {
  const user = userEvent.setup()
  await storeReport(report())
  render(<RunReportAction />)
  await waitFor(() => expect(action()).toBeEnabled())
  await user.click(action())
  return { user, dialog: screen.getByRole('dialog', { name: 'Run report' }) }
}

beforeEach(() => {
  useSongStore.setState({ current: CONTENT })
})

afterEach(() => {
  closeRunReport()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('RunReportAction', () => {
  it('is disabled with the tooltip while the song has no run report', async () => {
    render(<RunReportAction />)

    await waitFor(() => expect(action()).toHaveAttribute('title', NO_RUN_NOTE))
    expect(action()).toBeDisabled()
    expect(NO_RUN_NOTE).toBe('No transcribe run for this song yet.')
  })

  it('is disabled with the cause in its tooltip when the read of the run data fails', async () => {
    const get = IDBObjectStore.prototype.get
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === 'runs') throw new DOMException('read failed', 'UnknownError')
      return get.call(this, key)
    })
    await storeReport(report())
    render(<RunReportAction />)

    await waitFor(() =>
      expect(action()).toHaveAttribute(
        'title',
        'The app could not read the run report and the separated tracks of this song. Reload the page.',
      ),
    )
    expect(action()).toBeDisabled()
  })

  it('opens the panel with a heading for each section of the report', async () => {
    const { dialog } = await openPanel()

    expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Run', 'Steps', 'Vocal separation', 'Singers', 'Voices', 'Marks', 'Notes'])
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('shows the groups after the clustering as a table with header cells', async () => {
    const { dialog } = await openPanel()

    const table = within(dialog).getByRole('table', {
      name: 'The groups straight after the clustering',
    })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Group', 'Sung time', 'Embeddings', 'Result'])
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      )
    expect(rows).toEqual([
      ['0', '14.0 s', '3', 'Kept as singer 0'],
      ['1', '13.6 s', '3', 'Kept as singer 1'],
      ['2', '0.4 s', '1', 'Joined into group 0: under 3 seconds'],
    ])
  })

  it('renders no label of a mark of the song', async () => {
    const { dialog } = await openPanel()

    for (const mark of CONTENT.marks) expect(dialog).not.toHaveTextContent(mark.label)
  })

  it('copies the report text, says "Copied" for 2 seconds and announces the copy', async () => {
    const { user, dialog } = await openPanel()
    // user-event puts its own clipboard on the navigator at the setup, so the spy comes after it.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    vi.useFakeTimers({ shouldAdvanceTime: true })

    await user.click(within(dialog).getByRole('button', { name: 'Copy report' }))

    expect(writeText).toHaveBeenCalledWith(reportToText(report()))
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(within(dialog).getByRole('status')).toHaveTextContent('The report is on the clipboard.')
    act(() => vi.advanceTimersByTime(2000))
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Copy report' })).toBeInTheDocument(),
    )
  })

  it('selects the text in a read-only text area when the browser refuses the copy', async () => {
    const { user, dialog } = await openPanel()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new DOMException('Write permission denied.', 'NotAllowedError'),
    )

    await user.click(within(dialog).getByRole('button', { name: 'Copy report' }))

    const text = await within(dialog).findByRole('textbox', { name: 'Text of the run report' })
    expect(text).toHaveAttribute('readonly')
    expect(text).toHaveValue(reportToText(report()))
    expect(text).toHaveFocus()
    expect(within(dialog).getByRole('status')).toHaveTextContent('Press Ctrl+C to copy.')
  })

  it('downloads the report text as "<song name> - run report.txt"', async () => {
    const { user, dialog } = await openPanel()

    await user.click(within(dialog).getByRole('button', { name: 'Download report' }))

    expect(downloadFiles).toHaveBeenCalledWith(
      [{ name: 'Silent Night - run report.txt', text: reportToText(report()) }],
      'text/plain;charset=utf-8',
    )
  })

  it('shows a new report at once when a run stores one while the panel is open', async () => {
    const { dialog } = await openPanel()
    expect(within(dialog).getByText('16')).toBeInTheDocument()

    await storeReport(report(42))

    expect(await within(dialog).findByText('42')).toBeInTheDocument()
  })

  it('closes on Escape and gives the focus back to the action', async () => {
    const { user } = await openPanel()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(action()).toHaveFocus()
  })

  it('gives the focus to the action when the control that opened the panel is gone', async () => {
    const user = userEvent.setup()
    await storeReport(report())
    const link = document.createElement('button')
    document.body.append(link)
    render(<RunReportAction />)
    await waitFor(() => expect(action()).toBeEnabled())
    link.focus()
    act(() => openRunReport())
    link.remove()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(action()).toHaveFocus()
  })
})

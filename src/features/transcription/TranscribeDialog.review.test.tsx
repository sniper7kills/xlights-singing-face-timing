import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { hasWebGpu } from './device.ts'
import {
  runTranscription,
  type TranscribeOutcome,
  type TranscribeRequest,
  type TranscribeRunHandlers,
} from './runTranscription.ts'
import { TranscribeDialog } from './TranscribeDialog.tsx'
import { createTranscribeClient, type TranscribeClient } from './transcribeClient.ts'

vi.mock('./device.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./device.ts')>()),
  hasWebGpu: vi.fn(),
}))
vi.mock('./transcribeClient.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transcribeClient.ts')>()),
  createTranscribeClient: vi.fn(),
}))
vi.mock('./runTranscription.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runTranscription.ts')>()),
  runTranscription: vi.fn(),
}))

type HeldRun = {
  request: TranscribeRequest
  handlers: TranscribeRunHandlers
  resolve: (outcome: TranscribeOutcome) => void
  reject: (error: unknown) => void
}

let runs: HeldRun[]

beforeEach(() => {
  runs = []
  const client: TranscribeClient = {
    device: 'wasm',
    load: vi.fn(),
    transcribe: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
  }
  vi.mocked(hasWebGpu).mockResolvedValue(false)
  vi.mocked(createTranscribeClient).mockImplementation((options) =>
    Object.assign(client, { device: options.device }),
  )
  vi.mocked(runTranscription).mockImplementation(
    (request, _client, handlers) =>
      new Promise((resolve, reject) => runs.push({ request, handlers, resolve, reject })),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function lastRun(): HeldRun {
  const run = runs.at(-1)
  if (run === undefined) throw new Error('No run started.')
  return run
}

async function renderDialog(selection: TimeRange | null = null) {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(
    <TranscribeDialog
      voiceId="voice-1"
      selection={selection}
      onActiveChange={vi.fn()}
      onClose={onClose}
      onDone={vi.fn()}
    />,
  )
  const start = screen.getByRole('button', { name: 'Start' })
  await vi.waitFor(() => expect(start).toBeEnabled())
  return { user, start, onClose }
}

function lyricsField(): HTMLElement {
  return screen.getByLabelText('Lyrics (optional)')
}

describe('TranscribeDialog lyrics limit', () => {
  it('shows the message and disables "Start" for lyrics of 20 001 characters', async () => {
    const { start } = await renderDialog()

    fireEvent.change(lyricsField(), { target: { value: 'a'.repeat(20_001) } })

    expect(
      await screen.findByText('The lyrics are too long. Use 20 000 characters at most.'),
    ).toBeInTheDocument()
    expect(lyricsField()).toHaveAttribute('aria-invalid', 'true')
    expect(start).toBeDisabled()
  })

  it('accepts lyrics of 20 000 characters', async () => {
    const { start } = await renderDialog()

    fireEvent.change(lyricsField(), { target: { value: 'a'.repeat(20_000) } })

    expect(screen.queryByText(/The lyrics are too long/)).toBeNull()
    expect(start).toBeEnabled()
  })

  it('returns control in less than 1 second after a paste of 1 000 000 characters', async () => {
    const { start } = await renderDialog()
    const text = 'Silent night, holy night\n'.repeat(40_000)

    const before = performance.now()
    fireEvent.change(lyricsField(), { target: { value: text } })
    const elapsedMs = performance.now() - before

    expect(text.length).toBe(1_000_000)
    expect(elapsedMs).toBeLessThan(1000)
    expect(start).toBeDisabled()
  })
})

describe('TranscribeDialog lyrics that do not fit', () => {
  const fit = { wordCount: 1400, room: 578, keptLineCount: 82, lineCount: 200 }

  it('shows the hint for the characters under the lyrics field', async () => {
    await renderDialog()

    expect(lyricsField()).toHaveAccessibleDescription(
      'The app uses each word that has a letter or a digit. It leaves out other words, such as & or an emoji.',
    )
  })

  it('asks before the run with the three numbers, and continues for "Continue"', async () => {
    const { user, start } = await renderDialog()
    await user.click(screen.getByRole('checkbox', { name: 'Lyrics only' }))
    await user.type(lyricsField(), 'Silent night')
    await user.click(start)

    let answer: Promise<boolean> | undefined
    act(() => {
      answer = lastRun().handlers.confirmLyricsFit(fit)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The lyrics have 1400 words. This song has room for about 578 words. The app leaves out the lines after line 82.',
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await expect(answer).resolves.toBe(true)
  })

  it('names the time selection in the question of a range run', async () => {
    const { user, start } = await renderDialog({ startMs: 1000, endMs: 5000 })
    await user.click(screen.getByRole('radio', { name: /The time selection/ }))
    await user.click(start)

    act(() => void lastRun().handlers.confirmLyricsFit(fit))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The time selection has room for about 578 words.',
    )
  })
})

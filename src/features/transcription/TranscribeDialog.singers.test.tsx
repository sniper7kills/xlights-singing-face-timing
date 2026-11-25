import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettings, updateSettings } from '../../store/settings.ts'
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

const SEPARATE = 'Separate the vocals first'
const SINGERS = 'Put each singer on its own voice (experimental)'
const NOTE =
  'The app estimates which singer sings each phrase, and makes one voice for each singer. Check the result. Use "Move to voice" to correct a phrase. The app can find too many singers.'
const HINT = 'Select "Separate the vocals first" to use this option.'

let client: TranscribeClient
let runs: HeldRun[]

beforeEach(() => {
  runs = []
  client = { device: 'wasm', load: vi.fn(), transcribe: vi.fn(), cancel: vi.fn(), dispose: vi.fn() }
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
  vi.clearAllMocks()
})

function lastRun(): HeldRun {
  const run = runs.at(-1)
  if (run === undefined) throw new Error('No run started.')
  return run
}

function progress(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.transcribe-progress')
  if (element === null) throw new Error('The dialog has no progress text.')
  return element
}

async function renderDialog() {
  const user = userEvent.setup()
  const onDone = vi.fn()
  render(
    <TranscribeDialog
      voiceId="voice-1"
      selection={null}
      onActiveChange={vi.fn()}
      onClose={vi.fn()}
      onDone={onDone}
    />,
  )
  const start = screen.getByRole('button', { name: 'Start' })
  await vi.waitFor(() => expect(start).toBeEnabled())
  // The dialog reads the settings after its first render.
  await act(async () => {
    await loadSettings()
  })
  return { user, start, onDone }
}

async function startSingerRun() {
  await updateSettings({ separateVocals: true, singerVoices: true })
  const view = await renderDialog()
  await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: SINGERS })).toBeChecked())
  await view.user.click(view.start)
  return view
}

describe('TranscribeDialog and the singer voices', () => {
  it('shows the check box off and disabled with the hint while the separation is off', async () => {
    await renderDialog()

    const box = screen.getByRole('checkbox', { name: SINGERS })
    expect(box).not.toBeChecked()
    expect(box).toBeDisabled()
    expect(box).toHaveAccessibleDescription(`${HINT} ${NOTE}`)
    expect(screen.getByText(HINT)).toBeInTheDocument()
    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })

  it('enables the check box, off by default, when the person selects the separation', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('checkbox', { name: SEPARATE }))

    const box = screen.getByRole('checkbox', { name: SINGERS })
    expect(box).toBeEnabled()
    expect(box).not.toBeChecked()
    expect(screen.queryByText(HINT)).toBeNull()
  })

  it('stores the choice, and the next dialog opens with it', async () => {
    await updateSettings({ separateVocals: true })
    const { user } = await renderDialog()
    await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: SINGERS })).toBeEnabled())

    await user.click(screen.getByRole('checkbox', { name: SINGERS }))

    await vi.waitFor(async () => expect((await loadSettings()).singerVoices).toBe(true))
  })

  it('starts a run with the option when both check boxes are on', async () => {
    await startSingerRun()

    expect(lastRun().request).toMatchObject({ separateVocals: true, singerVoices: true })
  })

  it('starts a run without the option when the separation is off', async () => {
    await updateSettings({ singerVoices: true })
    const { user, start } = await renderDialog()

    await user.click(start)

    expect(lastRun().request.singerVoices).toBe(false)
  })

  it('hides the check box and the note for "Lyrics only"', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('checkbox', { name: 'Lyrics only' }))

    expect(screen.queryByRole('checkbox', { name: SINGERS })).toBeNull()
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('shows the download step and then the singer step with progress', async () => {
    await startSingerRun()
    const { handlers } = lastRun()

    act(() => handlers.onStage('singers-download'))
    expect(progress()).toHaveTextContent(/^Loading singer model, \d:\d\d elapsed$/)
    act(() => handlers.onSingersDownload?.(420, 1000))
    expect(progress()).toHaveTextContent('Downloading singer model, 42%')
    act(() => handlers.onStage('finding-singers'))
    expect(progress()).toHaveTextContent(/^Finding the singers, \d:\d\d elapsed$/)
    act(() => handlers.onSingersProgress?.(72_000, 220_000))
    expect(progress()).toHaveTextContent('Finding the singers, 1:12 of 3:40')
    expect(document.querySelector('.dialog-progress progress')).toHaveAttribute('value')
  })

  it('stops only the singer step for "Cancel", and ends the run with its outcome', async () => {
    const { user, onDone } = await startSingerRun()
    const run = lastRun()
    act(() => run.handlers.onStage('singers-download'))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(run.handlers.signal.aborted).toBe(true)
    const outcome: TranscribeOutcome = {
      wordCount: 3,
      estimatedCount: 0,
      breakDownFailure: null,
      singers: { status: 'cancelled', voiceName: 'Lead' },
    }
    await act(async () => run.resolve(outcome))

    expect(onDone).toHaveBeenCalledWith(outcome)
    expect(client.cancel).not.toHaveBeenCalled()
  })

  it('ends a run that the person cancelled before the singer step with no outcome', async () => {
    const { user, onDone } = await startSingerRun()
    const run = lastRun()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => run.resolve({ wordCount: 3, estimatedCount: 0, breakDownFailure: null }))

    expect(onDone).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Start' })).toBeEnabled()
  })
})

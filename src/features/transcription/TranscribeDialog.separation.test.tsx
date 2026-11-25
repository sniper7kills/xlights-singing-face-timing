import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettings, updateSettings } from '../../store/settings.ts'
import { SeparateError, type SeparateErrorKind } from '../vocal-separation/separateClient.ts'
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

const CHECK_BOX = 'Separate the vocals first'
const BROWSER_NOTE =
  'The app removes the instruments before it finds the words. This step downloads a model of 79 MB one time and adds time to the run. The audio stays in this browser.'
const REMOTE_NOTE =
  'The app removes the instruments before it finds the words. This step downloads a model of 79 MB one time and adds time to the run. The app separates the vocals in this browser, and then sends the vocals to localhost:8000.'

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
  render(
    <TranscribeDialog
      voiceId="voice-1"
      selection={null}
      onActiveChange={vi.fn()}
      onClose={vi.fn()}
      onDone={vi.fn()}
    />,
  )
  const start = screen.getByRole('button', { name: 'Start' })
  await vi.waitFor(() => expect(start).toBeEnabled())
  // The dialog reads the settings after its first render.
  await act(async () => {
    await loadSettings()
  })
  return { user, start }
}

async function startSeparatedRun() {
  await updateSettings({ separateVocals: true })
  const view = await renderDialog()
  await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: CHECK_BOX })).toBeChecked())
  await view.user.click(view.start)
  return view
}

describe('TranscribeDialog and the vocal separation', () => {
  it('shows the check box off by default with the note for a run in the browser', async () => {
    await renderDialog()

    expect(screen.getByRole('checkbox', { name: CHECK_BOX })).not.toBeChecked()
    expect(screen.getByText(BROWSER_NOTE)).toBeInTheDocument()
  })

  it('stores the choice, and the next dialog opens with it', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('checkbox', { name: CHECK_BOX }))

    await vi.waitFor(async () => expect((await loadSettings()).separateVocals).toBe(true))
  })

  it('opens with the stored choice and starts a run with the separation', async () => {
    await startSeparatedRun()

    expect(lastRun().request.separateVocals).toBe(true)
  })

  it('starts a run with no separation when the check box is off', async () => {
    const { user, start } = await renderDialog()

    await user.click(start)

    expect(lastRun().request.separateVocals).toBe(false)
  })

  it('hides the check box for "Lyrics only"', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('checkbox', { name: 'Lyrics only' }))

    expect(screen.queryByRole('checkbox', { name: CHECK_BOX })).toBeNull()
    expect(screen.queryByText(BROWSER_NOTE)).toBeNull()
  })

  it('names the host in the note for a remote run', async () => {
    await updateSettings({
      transcribeSource: 'remote',
      remoteEndpoint: { baseUrl: 'http://localhost:8000/v1', apiKey: '', model: 'whisper-1' },
    })
    await renderDialog()

    expect(await screen.findByText(REMOTE_NOTE)).toBeInTheDocument()
  })

  it('shows the download step and then the separation step with progress', async () => {
    await startSeparatedRun()
    const { handlers } = lastRun()

    act(() => handlers.onStage('separation-download'))
    expect(progress()).toHaveTextContent(/^Loading vocal separation model, \d:\d\d elapsed$/)
    act(() => handlers.onSeparationDownload(250, 1000))
    expect(progress()).toHaveTextContent('Downloading vocal separation model, 25%')
    act(() => handlers.onStage('separating'))
    expect(progress()).toHaveTextContent(/^Separating vocals, \d:\d\d elapsed$/)
    act(() => handlers.onSeparationProgress(72_000, 220_000))
    expect(progress()).toHaveTextContent(/^Separating vocals, 1:12 of 3:40, \d:\d\d elapsed$/)
    expect(document.querySelector('.dialog-progress progress')).toHaveAttribute('value')
  })

  it.each<[SeparateErrorKind, string]>([
    [
      'download',
      'The app could not download the vocal separation model. Check the connection. Then try again, or continue with no separation.',
    ],
    [
      'memory',
      'This browser does not have enough memory to separate the vocals of this song. Select a shorter time range, or continue with no separation.',
    ],
    ['model', 'The vocal separation did not work. Continue with no separation, or cancel.'],
  ])('shows the message of the failure %s with two actions', async (kind, message) => {
    await startSeparatedRun()

    act(() => {
      void lastRun().handlers.confirmNoSeparation(new SeparateError(kind, 'detail'), 'spleeter')
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Continue with no separation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('continues the run for "Continue with no separation"', async () => {
    const { user } = await startSeparatedRun()
    let answer: Promise<unknown> = Promise.resolve(false)
    act(() => {
      answer = lastRun().handlers.confirmNoSeparation(
        new SeparateError('model', 'detail'),
        'spleeter',
      )
    })

    await user.click(await screen.findByRole('button', { name: 'Continue with no separation' }))

    await expect(answer).resolves.toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(lastRun().handlers.signal.aborted).toBe(false)
  })

  it('stops the run for "Cancel" after a failure', async () => {
    const { user } = await startSeparatedRun()
    let answer: Promise<unknown> = Promise.resolve(true)
    act(() => {
      answer = lastRun().handlers.confirmNoSeparation(
        new SeparateError('model', 'detail'),
        'spleeter',
      )
    })

    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    await expect(answer).resolves.toBe(false)
    expect(lastRun().handlers.signal.aborted).toBe(true)
    expect(await screen.findByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('answers false for Escape after a failure', async () => {
    const { user } = await startSeparatedRun()
    let answer: Promise<unknown> = Promise.resolve(true)
    act(() => {
      answer = lastRun().handlers.confirmNoSeparation(
        new SeparateError('model', 'detail'),
        'spleeter',
      )
    })
    await screen.findByRole('button', { name: 'Continue with no separation' })

    await user.keyboard('{Escape}')

    await expect(answer).resolves.toBe(false)
  })
})

describe('TranscribeDialog and the separation model', () => {
  const FAST = 'Fast (Spleeter, 79 MB)'
  const DEMUCS = 'Demucs, experimental (181 MB, much slower)'
  const WARNING =
    'Demucs needs about 4 GB of memory and several minutes for a song on this browser.'

  it('hides the choice while the check box is off', async () => {
    await renderDialog()

    expect(screen.queryByRole('group', { name: 'Separation model' })).toBeNull()
  })

  it('shows the choice with the fast model selected when the check box is on', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('checkbox', { name: CHECK_BOX }))

    expect(await screen.findByRole('group', { name: 'Separation model' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: FAST })).toBeChecked()
    expect(screen.getByRole('radio', { name: DEMUCS })).not.toBeChecked()
  })

  it('stores the selected model and starts the run with it', async () => {
    const { user } = await startSeparatedRun()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(await screen.findByRole('radio', { name: DEMUCS }))

    await vi.waitFor(async () => expect((await loadSettings()).separationModel).toBe('demucs'))
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(lastRun().request.separationModel).toBe('demucs')
  })

  it('opens with the stored model', async () => {
    await updateSettings({ separateVocals: true, separationModel: 'demucs' })
    await renderDialog()

    await vi.waitFor(() => expect(screen.getByRole('radio', { name: DEMUCS })).toBeChecked())
  })

  it('shows the warning for Demucs when the browser gives no WebGPU adapter', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(false)
    await updateSettings({ separateVocals: true, separationModel: 'demucs' })
    await renderDialog()

    expect(await screen.findByText(WARNING)).toBeInTheDocument()
  })

  it('shows no warning for Demucs when the browser gives a WebGPU adapter', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(true)
    await updateSettings({ separateVocals: true, separationModel: 'demucs' })
    await renderDialog()

    await vi.waitFor(() => expect(screen.getByRole('radio', { name: DEMUCS })).toBeChecked())
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('shows no warning for the fast model', async () => {
    vi.mocked(hasWebGpu).mockResolvedValue(false)
    await updateSettings({ separateVocals: true })
    await renderDialog()

    await vi.waitFor(() => expect(screen.getByRole('radio', { name: FAST })).toBeChecked())
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('names Demucs in the download step of a Demucs run', async () => {
    await updateSettings({ separateVocals: true, separationModel: 'demucs' })
    const view = await renderDialog()
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: DEMUCS })).toBeChecked())
    await view.user.click(view.start)

    act(() => lastRun().handlers.onSeparationDownload(250, 1000))

    await vi.waitFor(() =>
      expect(progress()).toHaveTextContent('Downloading Demucs vocal separation model, 25%'),
    )
  })

  it('offers "Use the fast model" after a Demucs memory failure, and answers fast-model', async () => {
    await updateSettings({ separateVocals: true, separationModel: 'demucs' })
    const view = await renderDialog()
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: DEMUCS })).toBeChecked())
    await view.user.click(view.start)
    let answer: Promise<unknown> = Promise.resolve(false)
    act(() => {
      answer = lastRun().handlers.confirmNoSeparation(
        new SeparateError('memory', 'std::bad_alloc'),
        'demucs',
      )
    })

    await view.user.click(await screen.findByRole('button', { name: 'Use the fast model' }))

    await expect(answer).resolves.toBe('fast-model')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(lastRun().handlers.signal.aborted).toBe(false)
  })

  it('shows "Continue with no separation" and "Cancel" beside "Use the fast model"', async () => {
    await startSeparatedRun()

    act(() => {
      void lastRun().handlers.confirmNoSeparation(
        new SeparateError('memory', 'std::bad_alloc'),
        'demucs',
      )
    })

    expect(await screen.findByRole('button', { name: 'Use the fast model' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with no separation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('does not offer "Use the fast model" after a Spleeter memory failure', async () => {
    await startSeparatedRun()

    act(() => {
      void lastRun().handlers.confirmNoSeparation(
        new SeparateError('memory', 'RangeError'),
        'spleeter',
      )
    })

    await screen.findByRole('button', { name: 'Continue with no separation' })
    expect(screen.queryByRole('button', { name: 'Use the fast model' })).toBeNull()
  })
})

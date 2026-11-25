import { act, getDefaultNormalizer, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteError } from '../../lib/remote/response.ts'
import * as db from '../../store/db.ts'
import { loadSettings, updateSettings } from '../../store/settings.ts'
import { hasWebGpu } from './device.ts'
import { testConnection } from './remoteClient.ts'
import {
  runTranscription,
  type TranscribeOutcome,
  type TranscribeRequest,
  type TranscribeRunHandlers,
} from './runTranscription.ts'
import { TranscribeDialog } from './TranscribeDialog.tsx'
import { createTranscribeClient, TranscribeError } from './transcribeClient.ts'

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
vi.mock('./remoteClient.ts', () => ({ testConnection: vi.fn() }))

type HeldRun = {
  request: TranscribeRequest
  handlers: TranscribeRunHandlers
  resolve: (outcome: TranscribeOutcome) => void
  reject: (error: unknown) => void
}

const KEY = 'sk-secret-key-123'
const ENDPOINT = { baseUrl: 'http://localhost:8000/v1', apiKey: '', model: 'whisper-1' }
const WARNING =
  'The app sends the audio of this song to localhost:8000. The audio leaves this computer.'
const MIXED =
  'This page is secure (https), and the browser blocks a call to an http address. Use an https address for the endpoint.'

let runs: HeldRun[]

beforeEach(() => {
  runs = []
  vi.mocked(hasWebGpu).mockResolvedValue(false)
  vi.mocked(createTranscribeClient).mockReturnValue({
    device: 'wasm',
    load: vi.fn(),
    transcribe: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
  })
  vi.mocked(runTranscription).mockImplementation(
    (request, _client, handlers) =>
      new Promise((resolve, reject) => runs.push({ request, handlers, resolve, reject })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function lastRun(): HeldRun {
  const run = runs.at(-1)
  if (run === undefined) throw new Error('No run started.')
  return run
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
  // The dialog reads the settings after its first render.
  await vi.waitFor(() =>
    expect(screen.getByRole('radio', { name: 'In this browser' })).toBeInTheDocument(),
  )
  await act(async () => {
    await loadSettings()
  })
  return { user, start: screen.getByRole('button', { name: 'Start' }) }
}

async function renderRemote(endpoint = ENDPOINT) {
  await updateSettings({ transcribeSource: 'remote', remoteEndpoint: endpoint })
  const view = await renderDialog()
  await screen.findByText(WARNING.replace('localhost:8000', new URL(endpoint.baseUrl).host))
  return view
}

function progress(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.transcribe-progress')
  if (element === null) throw new Error('The dialog has no progress text.')
  return element
}

async function fillEndpoint(
  user: ReturnType<typeof userEvent.setup>,
  fields: { baseUrl?: string; apiKey?: string; model?: string },
) {
  for (const [label, value] of [
    ['Base URL', fields.baseUrl],
    ['API key (optional)', fields.apiKey],
    ['Speech model name', fields.model],
  ] as const) {
    if (value === undefined) continue
    const input = screen.getByLabelText(label)
    await user.clear(input)
    if (value !== '') await user.type(input, value)
  }
}

describe('TranscribeDialog "Where to transcribe"', () => {
  it('selects "In this browser" by default and shows the speech models', async () => {
    await renderDialog()

    expect(screen.getByRole('radio', { name: 'In this browser' })).toBeChecked()
    expect(screen.getByRole('group', { name: 'Speech model' })).toBeInTheDocument()
    expect(screen.queryByText(/leaves this computer/)).not.toBeInTheDocument()
  })

  it('opens the endpoint fields and disables "Start" when no endpoint is stored', async () => {
    const { user, start } = await renderDialog()

    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))

    expect(screen.queryByRole('group', { name: 'Speech model' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Base URL')).toBeInTheDocument()
    expect(start).toBeDisabled()
    await vi.waitFor(async () => expect((await loadSettings()).transcribeSource).toBe('remote'))
  })

  it('hides the text of the API key and turns off autocomplete', async () => {
    const { user } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))

    const key = screen.getByLabelText('API key (optional)')
    expect(key).toHaveAttribute('type', 'password')
    expect(key).toHaveAttribute('autocomplete', 'off')
  })

  it('saves the endpoint, shows its host and model, and shows the warning with the host', async () => {
    const { user, start } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))

    await fillEndpoint(user, { baseUrl: 'http://localhost:8000/v1/', apiKey: KEY })
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }))

    expect(await screen.findByText(WARNING)).toBeInTheDocument()
    expect(screen.getByText('localhost:8000')).toBeInTheDocument()
    expect(screen.getByText('whisper-1')).toBeInTheDocument()
    expect(start).toBeEnabled()
    await vi.waitFor(async () =>
      expect((await loadSettings()).remoteEndpoint).toEqual({
        baseUrl: 'http://localhost:8000/v1',
        apiKey: KEY,
        model: 'whisper-1',
      }),
    )
    expect(document.body.textContent).not.toContain(KEY)
  })

  it('keeps the endpoint for this page and shows a message when the browser cannot store it', async () => {
    const { user, start } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))
    await fillEndpoint(user, { baseUrl: 'http://localhost:8000/v1' })
    vi.spyOn(db, 'putRecord').mockRejectedValue(new Error('QuotaExceededError'))

    await user.click(screen.getByRole('button', { name: 'Save endpoint' }))

    expect(
      await screen.findByText(
        'The app could not store the remote endpoint in this browser. It works until you reload the page.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(WARNING)).toBeInTheDocument()
    expect(start).toBeEnabled()
  })

  it('shows one message when the browser cannot store a choice of the dialog', async () => {
    const { user } = await renderDialog()
    vi.spyOn(db, 'putRecord').mockRejectedValue(new Error('QuotaExceededError'))

    await user.click(screen.getByRole('radio', { name: /^small/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Separate the vocals first' }))

    expect(
      await screen.findAllByText(
        'The app could not store the choices of this dialog in this browser. They work until you reload the page.',
      ),
    ).toHaveLength(1)
    expect(screen.getByRole('radio', { name: /^small/ })).toBeChecked()
  })

  it.each([
    ['', 'Type the base URL of the endpoint.'],
    [
      'localhost:8000',
      'The base URL is not valid. Type an address that starts with https:// or http://, with no ? and no #.',
    ],
    [
      'https://me:pw@ai.example.com/v1',
      'Remove the user name and the password from the base URL. Type the API key in the API key field.',
    ],
  ])('refuses the base URL %j with a message', async (baseUrl, message) => {
    const { user } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))

    await fillEndpoint(user, { baseUrl })
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('refuses an empty speech model name', async () => {
    const { user } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))

    await fillEndpoint(user, { baseUrl: 'http://localhost:8000/v1', model: '' })
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Type the name of the speech model, for example whisper-1.',
    )
  })

  it('opens the stored endpoint in the fields for "Change"', async () => {
    const { user, start } = await renderRemote()

    await user.click(screen.getByRole('button', { name: 'Change' }))

    expect(screen.getByLabelText('Base URL')).toHaveValue('http://localhost:8000/v1')
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
    expect(start).toBeDisabled()
  })

  it('starts a remote run with the stored endpoint', async () => {
    const { user, start } = await renderRemote()

    await user.click(start)

    expect(lastRun().request).toMatchObject({ mode: 'model', remote: ENDPOINT })
    expect(screen.getByText(WARNING)).toBeInTheDocument()
  })

  it('starts a lyrics-only run with no endpoint and no warning', async () => {
    const { user, start } = await renderRemote()
    await user.type(screen.getByLabelText('Lyrics (optional)'), 'Silent night')
    await user.click(screen.getByLabelText('Lyrics only'))

    expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
    await user.click(start)

    expect(lastRun().request.remote).toBeUndefined()
  })

  it('shows the sending, upload and waiting states with the host, and hides the device line', async () => {
    const { user, start } = await renderRemote()
    await user.click(start)
    const { handlers } = lastRun()

    act(() => handlers.onStage('sending'))
    expect(progress()).toHaveTextContent(/^Sending audio to localhost:8000, 0:0\d elapsed$/)
    act(() => handlers.onUpload?.(500, 1000))
    expect(progress()).toHaveTextContent('Sending audio to localhost:8000, 50%')
    act(() => handlers.onStage('waiting'))
    expect(progress()).toHaveTextContent(/^Waiting for localhost:8000, 0:0\d elapsed$/)
    expect(document.querySelector('.transcribe-device')).toBeNull()
    expect(screen.queryByText('CPU')).not.toBeInTheDocument()
  })

  it.each([
    [
      new RemoteError('network', 'localhost:8000'),
      'The app could not connect to localhost:8000. Check that the server runs and that the base URL is correct.\n\nIf the server runs: its CORS settings can block this page. Check that the server sends the header Access-Control-Allow-Origin: http://localhost:3000',
    ],
    [
      new RemoteError('auth', 'localhost:8000', 401),
      'localhost:8000 refused the API key (HTTP 401). Check the API key of the remote endpoint.',
    ],
    [
      new RemoteError('too-large', 'localhost:8000'),
      'The audio is too large for the remote endpoint. Select a shorter part of the song in the editor, and transcribe the time selection.',
    ],
    [
      new RemoteError('rate-limit', 'localhost:8000', 429),
      'localhost:8000 received too many requests (HTTP 429). Wait one minute, then select Retry.',
    ],
    [
      new RemoteError('no-word-times', 'localhost:8000'),
      'localhost:8000 returned no word times. Use a server and a speech model that return the words field of verbose_json.',
    ],
  ])('shows the message of a failed remote run: %s', async (error, message) => {
    const { user, start } = await renderRemote()
    await user.click(start)

    act(() => lastRun().reject(error))

    // The message keeps its empty line, which starts the second paragraph.
    const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) }
    expect(await screen.findByText(message, exact)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('aborts the run signal for "Cancel" and goes back to idle', async () => {
    const { user, start } = await renderRemote()
    await user.click(start)
    const { handlers } = lastRun()
    act(() => handlers.onStage('waiting'))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    act(() => lastRun().reject(new TranscribeError('cancelled', 'stop')))

    expect(handlers.signal.aborted).toBe(true)
    expect(await screen.findByRole('button', { name: 'Start' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('TranscribeDialog on an https page', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { protocol: 'https:', origin: 'https://timing.example.com' })
  })

  it('blocks "Start" for an http endpoint on the local network', async () => {
    await updateSettings({
      transcribeSource: 'remote',
      remoteEndpoint: { ...ENDPOINT, baseUrl: 'http://192.168.1.20:8000/v1' },
    })
    const { start } = await renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent(MIXED)
    expect(start).toBeDisabled()
  })

  it('allows an http endpoint on localhost', async () => {
    const { start } = await renderRemote()

    expect(screen.queryByText(MIXED)).not.toBeInTheDocument()
    expect(start).toBeEnabled()
  })

  it('shows the mixed content message for "Test connection" and sends no request', async () => {
    const { user } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))
    await fillEndpoint(user, { baseUrl: 'http://192.168.1.20:8000/v1' })

    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(MIXED)
    expect(testConnection).not.toHaveBeenCalled()
  })
})

describe('TranscribeDialog "Test connection"', () => {
  it('tests the typed endpoint and reports success', async () => {
    let finish: () => void = () => undefined
    vi.mocked(testConnection).mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    const { user } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))
    await fillEndpoint(user, { baseUrl: 'https://ai.example.com/v1', apiKey: KEY })

    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText('Testing the connection to ai.example.com.')).toBeInTheDocument()
    expect(testConnection).toHaveBeenCalledWith(
      { baseUrl: 'https://ai.example.com/v1', apiKey: KEY, model: 'whisper-1' },
      expect.any(AbortSignal),
    )
    act(() => finish())
    expect(
      await screen.findByText('The connection works. ai.example.com returned word times.'),
    ).toBeInTheDocument()
  })

  it('shows the message of a failed test', async () => {
    vi.mocked(testConnection).mockRejectedValue(new RemoteError('not-found', 'ai.example.com', 404))
    const { user } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))
    await fillEndpoint(user, { baseUrl: 'https://ai.example.com' })

    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ai.example.com has no transcription service at this address (HTTP 404). Check the base URL. It usually ends with /v1.',
    )
  })

  it('shows a general message for a failure that is not a remote error', async () => {
    vi.mocked(testConnection).mockRejectedValue(new Error(`boom ${KEY}`))
    const { user } = await renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Remote endpoint' }))
    await fillEndpoint(user, { baseUrl: 'https://ai.example.com/v1', apiKey: KEY })

    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The test failed. Check the base URL and retry.',
    )
    expect(document.body.textContent).not.toContain(KEY)
  })
})

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettings, updateSettings } from '../../store/settings.ts'
import { canSplitSingers } from '../singer-split/webgpu.ts'
import { SplitError } from '../singer-split/splitClient.ts'
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
vi.mock('../singer-split/webgpu.ts', () => ({ canSplitSingers: vi.fn() }))
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
const SPLIT = 'Split the singers (experimental)'
const NOTE =
  'The app divides the vocals into two singer tracks. It puts the words of each track on its own new voice. The marks of the two voices can overlap in time.'
const NO_WEBGPU = 'This browser has no WebGPU. The singer split needs it.'
const HINT = 'Select "Separate the vocals first" to use this option.'
const LYRICS_REASON = 'Lyrics are not used when the singers are split.'

let client: TranscribeClient
let runs: HeldRun[]

beforeEach(() => {
  runs = []
  client = { device: 'wasm', load: vi.fn(), transcribe: vi.fn(), cancel: vi.fn(), dispose: vi.fn() }
  vi.mocked(hasWebGpu).mockResolvedValue(false)
  vi.mocked(canSplitSingers).mockResolvedValue(true)
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

const splitBox = () => screen.getByRole('checkbox', { name: SPLIT })

async function renderWithSplit() {
  await updateSettings({ separateVocals: true, splitSingers: true })
  const view = await renderDialog()
  await vi.waitFor(() => expect(splitBox()).toBeChecked())
  return view
}

describe('TranscribeDialog and the singer split', () => {
  it('shows the option off, with its note and the hint, while the separation is off', async () => {
    await renderDialog()

    expect(splitBox()).not.toBeChecked()
    expect(splitBox()).toHaveAttribute('aria-disabled', 'true')
    expect(splitBox()).toHaveAccessibleDescription(`${HINT} ${NOTE}`)
  })

  it('keeps the option in the tab order with the WebGPU reason on a browser with no WebGPU', async () => {
    vi.mocked(canSplitSingers).mockResolvedValue(false)
    const { user } = await renderDialog()
    await user.click(screen.getByRole('checkbox', { name: SEPARATE }))
    await vi.waitFor(() => expect(splitBox()).toHaveAccessibleDescription(`${NO_WEBGPU} ${NOTE}`))

    await user.click(splitBox())

    expect(splitBox()).not.toBeChecked()
    expect(splitBox()).toHaveAttribute('aria-disabled', 'true')
    expect(splitBox()).not.toBeDisabled()
    expect(screen.getByText(NO_WEBGPU)).toBeVisible()
  })

  it('sends the split and the mode, with no lyrics and no singer step', async () => {
    await updateSettings({ singerVoices: true })
    const { user, start } = await renderWithSplit()
    expect(screen.getByRole('checkbox', { name: SINGERS })).not.toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Lead and backing' }))
    await user.click(start)

    expect(lastRun().request).toMatchObject({
      separateVocals: true,
      singerVoices: false,
      splitSingers: true,
      splitMode: 'lead-backing',
      lyrics: undefined,
      addSections: false,
    })
    await expect(loadSettings()).resolves.toMatchObject({ splitMode: 'lead-backing' })
  })

  it('shows the download size of the selected mode, and the memory note for "Lead and backing"', async () => {
    const { user } = await renderWithSplit()
    expect(screen.getByText('This mode downloads a model of 267 MB one time.')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Lead and backing' }))

    expect(
      await screen.findByText(
        'This mode downloads a model of 864 MB one time. The model needs about 2 GB of memory.',
      ),
    ).toBeInTheDocument()
  })

  it('disables the lyrics field with the reason while the split is on', async () => {
    await renderWithSplit()

    const lyrics = screen.getByRole('textbox', { name: 'Lyrics (optional)' })
    expect(lyrics).toBeDisabled()
    expect(lyrics).toHaveAccessibleDescription(expect.stringContaining(LYRICS_REASON))
  })

  it('turns off the singer step when the person selects the split, and the split when the person selects the singer step', async () => {
    await updateSettings({ separateVocals: true, singerVoices: true })
    const { user } = await renderDialog()
    const singers = screen.getByRole('checkbox', { name: SINGERS })
    await vi.waitFor(() => expect(singers).toBeChecked())

    await user.click(splitBox())
    expect(splitBox()).toBeChecked()
    expect(singers).not.toBeChecked()

    await user.click(singers)
    expect(singers).toBeChecked()
    expect(splitBox()).not.toBeChecked()
    await expect(loadSettings()).resolves.toMatchObject({ singerVoices: true, splitSingers: false })
  })

  it('hides the option for a lyrics-only run', async () => {
    const { user } = await renderWithSplit()

    await user.click(screen.getByRole('checkbox', { name: 'Lyrics only' }))

    expect(screen.queryByRole('checkbox', { name: SPLIT })).toBeNull()
  })

  it('shows the download and the split with a percent', async () => {
    const { user, start } = await renderWithSplit()
    await user.click(start)
    const { handlers } = lastRun()

    act(() => handlers.onStage('split-download'))
    act(() => handlers.onSplitDownload?.(1, 4))
    expect(progress()).toHaveTextContent('Downloading singer split model, 25%')
    act(() => handlers.onStage('splitting'))
    act(() => handlers.onSplitProgress?.(3000, 4000))
    expect(progress()).toHaveTextContent('Splitting the singers, 75%')
  })

  it('shows the failure of the split with its cause and the next action', async () => {
    const { user, start } = await renderWithSplit()
    await user.click(start)

    act(() => lastRun().reject(new SplitError('not-available', 'none')))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The graphics hardware of this computer cannot run the singer split model. Clear "Split the singers" and select Retry.',
    )
  })

  it('states that a remote run sends two requests', async () => {
    await updateSettings({
      transcribeSource: 'remote',
      remoteEndpoint: { baseUrl: 'https://stt.example/v1', apiKey: '', model: 'whisper-1' },
    })
    await renderWithSplit()

    expect(
      screen.getByText(
        'The app sends two requests to stt.example, one for each singer track. The audio of both tracks leaves this computer.',
      ),
    ).toBeVisible()
  })
})

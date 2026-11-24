import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { loadSettings, updateSettings } from '../../store/settings.ts'
import { chooseDevice } from './device.ts'
import type { Device } from './protocol.ts'
import {
  NoWordsError,
  runTranscription,
  type TranscribeOutcome,
  type TranscribeRequest,
  type TranscribeRunHandlers,
} from './runTranscription.ts'
import { TranscribeDialog } from './TranscribeDialog.tsx'
import {
  createTranscribeClient,
  type TranscribeClient,
  type TranscribeClientOptions,
  TranscribeError,
} from './transcribeClient.ts'

vi.mock('./device.ts', () => ({ chooseDevice: vi.fn() }))
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

let client: TranscribeClient
let clientOptions: TranscribeClientOptions | undefined
let runs: HeldRun[]

beforeEach(() => {
  runs = []
  clientOptions = undefined
  client = { device: 'wasm', load: vi.fn(), transcribe: vi.fn(), cancel: vi.fn(), dispose: vi.fn() }
  vi.mocked(chooseDevice).mockResolvedValue('webgpu')
  vi.mocked(createTranscribeClient).mockImplementation((options) => {
    clientOptions = options
    return client
  })
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

async function renderDialog(selection: TimeRange | null = null) {
  const onClose = vi.fn()
  const onDone = vi.fn()
  const onActiveChange = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <TranscribeDialog
      voiceId="voice-1"
      durationMs={220_000}
      selection={selection}
      onActiveChange={onActiveChange}
      onClose={onClose}
      onDone={onDone}
    />,
  )
  const start = screen.getByRole('button', { name: 'Start' })
  await vi.waitFor(() => expect(start).toBeEnabled())
  return { onClose, onDone, onActiveChange, user, start, view }
}

function progress() {
  return screen.getByRole('status')
}

describe('TranscribeDialog', () => {
  it('is a labelled modal dialog and moves the focus into it', async () => {
    await renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Transcribe' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('lists tiny, base and small, each with its download size in MB, and selects base', async () => {
    await renderDialog()

    const group = screen.getByRole('group', { name: 'Speech model' })
    expect(group).toHaveTextContent('tiny 66 MB')
    expect(group).toHaveTextContent('base 139 MB')
    expect(group).toHaveTextContent('small 512 MB')
    expect(screen.getByRole('radio', { name: 'base 139 MB' })).toBeChecked()
  })

  it('remembers the last speech model in the app settings', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('radio', { name: 'small 512 MB' }))

    await vi.waitFor(async () => expect((await loadSettings()).speechModelId).toBe('whisper-small'))
  })

  it('selects the stored speech model when it opens', async () => {
    await updateSettings({ speechModelId: 'whisper-tiny' })

    await renderDialog()

    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'tiny 66 MB' })).toBeChecked())
  })

  it('selects base when the stored speech model is unknown', async () => {
    await updateSettings({ speechModelId: 'whisper-huge' })

    await renderDialog()
    await act(() => loadSettings())

    expect(screen.getByRole('radio', { name: 'base 139 MB' })).toBeChecked()
  })

  it('shows the WebGPU note for a browser with WebGPU', async () => {
    await renderDialog()

    expect(screen.getByText('Uses your graphics card (WebGPU)')).toBeInTheDocument()
    expect(clientOptions?.device).toBe('webgpu')
  })

  it('shows the slower-browser note for a browser without WebGPU', async () => {
    vi.mocked(chooseDevice).mockResolvedValue('wasm')

    await renderDialog()

    expect(
      screen.getByText('WebGPU is not available. Transcription is slower on this browser.'),
    ).toBeInTheDocument()
  })

  it('updates the device note when the client moves from WebGPU to wasm', async () => {
    await renderDialog()

    act(() => clientOptions?.onDeviceChange?.('wasm' satisfies Device))

    expect(
      screen.getByText('WebGPU is not available. Transcription is slower on this browser.'),
    ).toBeInTheDocument()
  })

  it('offers the full song as the only range when the editor has no time selection', async () => {
    await renderDialog()

    expect(screen.getByRole('radio', { name: 'Full song' })).toBeChecked()
    expect(screen.getAllByRole('radio', { name: /song|selection/ })).toHaveLength(1)
  })

  it('offers the time selection with its times beside the full song', async () => {
    await renderDialog({ startMs: 12_000, endMs: 27_500 })

    expect(screen.getByRole('radio', { name: 'Full song' })).toBeChecked()
    expect(
      screen.getByRole('radio', { name: 'The time selection 0:12.000 to 0:27.500' }),
    ).not.toBeChecked()
  })

  it('passes the time selection as the range of a lyrics-only run', async () => {
    const { user, start } = await renderDialog({ startMs: 12_000, endMs: 27_500 })

    await user.click(screen.getByRole('radio', { name: /^The time selection/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Lyrics only' }))
    await user.type(screen.getByLabelText('Lyrics (optional)'), 'All is calm')
    await user.click(start)

    expect(lastRun().request).toMatchObject({
      mode: 'lyrics-only',
      range: { startMs: 12_000, endMs: 27_500 },
    })
  })

  it('passes no range when the person goes back to the full song', async () => {
    const { user, start } = await renderDialog({ startMs: 12_000, endMs: 27_500 })

    await user.click(screen.getByRole('radio', { name: /^The time selection/ }))
    await user.click(screen.getByRole('radio', { name: 'Full song' }))
    await user.click(start)

    expect(lastRun().request.range).toBeUndefined()
  })

  it('shows the length of the time selection in the first progress text', async () => {
    const { user, start } = await renderDialog({ startMs: 0, endMs: 90_000 })

    await user.click(screen.getByRole('radio', { name: /^The time selection/ }))
    await user.click(start)

    expect(progress()).toHaveTextContent('Transcribing, 0:00 of 1:30')
  })

  it('starts a speech model run with the lyrics and shows the transcribe progress', async () => {
    const { user, start, onActiveChange } = await renderDialog()
    await user.type(screen.getByLabelText('Lyrics (optional)'), 'Silent night')

    await user.click(start)

    expect(lastRun().request).toEqual({
      voiceId: 'voice-1',
      speechModelId: 'whisper-base',
      mode: 'model',
      lyrics: 'Silent night',
    })
    expect(progress()).toHaveTextContent('Transcribing, 0:00 of 3:40')
    expect(onActiveChange).toHaveBeenLastCalledWith(true)
    act(() => lastRun().handlers.onProgress(72_000, 220_000))
    expect(progress()).toHaveTextContent('Transcribing, 1:12 of 3:40')
  })

  it('changes the progress text for each chunk of the run', async () => {
    const { user, start } = await renderDialog()
    await user.click(start)
    const texts: string[] = []

    for (const doneMs of [30_000, 50_000, 70_000]) {
      act(() => lastRun().handlers.onProgress(doneMs, 220_000))
      texts.push(progress().textContent ?? '')
    }

    expect(texts).toEqual([
      'Transcribing, 0:30 of 3:40',
      'Transcribing, 0:50 of 3:40',
      'Transcribing, 1:10 of 3:40',
    ])
  })

  it('shows the download percent with a bar', async () => {
    const { user, start } = await renderDialog()
    await user.click(start)

    act(() => lastRun().handlers.onDownload(420_000, 1_000_000))

    expect(progress()).toHaveTextContent('Downloading speech model, 42%')
    expect(document.querySelector('progress')).toHaveAttribute('value', '0.42')
  })

  it('shows the align step', async () => {
    const { user, start } = await renderDialog()
    await user.click(start)

    act(() => lastRun().handlers.onFinishing())

    expect(progress()).toHaveTextContent('Aligning lyrics and breaking down words')
  })

  it('disables the fields during a run', async () => {
    const { user, start } = await renderDialog()

    await user.click(start)

    expect(screen.getByLabelText('Lyrics (optional)')).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'base 139 MB' })).toBeDisabled()
  })

  it('passes the counts of a run that ends well to the parent', async () => {
    const { user, start, onClose, onDone } = await renderDialog()
    await user.click(start)

    await act(async () => lastRun().resolve({ wordCount: 16, estimatedCount: 0 }))

    expect(onDone).toHaveBeenCalledExactlyOnceWith({ wordCount: 16, estimatedCount: 0 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops the run, terminates the worker and goes back to idle for "Cancel"', async () => {
    const { user, start, onClose, onDone, onActiveChange } = await renderDialog()
    await user.click(start)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(client.cancel).toHaveBeenCalledOnce()
    expect(lastRun().handlers.signal.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
    expect(progress()).toHaveTextContent('')
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
    await act(async () => lastRun().reject(new TranscribeError('cancelled', 'x')))
    expect(onClose).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('ignores the progress of a cancelled run', async () => {
    const { user, start } = await renderDialog()
    await user.click(start)
    const cancelled = lastRun()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    act(() => cancelled.handlers.onProgress(10_000, 220_000))
    await act(async () => cancelled.resolve({ wordCount: 1, estimatedCount: 0 }))

    expect(progress()).toHaveTextContent('')
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it.each([
    [
      new TranscribeError('download', 'offline'),
      'The speech model did not download. Check the connection and retry.',
    ],
    [
      new TranscribeError('memory', 'oom'),
      'This browser ran out of memory. Select a smaller speech model.',
    ],
    [new NoWordsError(), 'No words were found. Paste the lyrics and use Lyrics only.'],
    [
      new TranscribeError('unknown', 'crash'),
      'The transcription failed. Select a smaller speech model and retry.',
    ],
  ])('shows the message for %s with "Retry" and "Close"', async (error, message) => {
    const { user, start, onClose } = await renderDialog()
    await user.click(start)

    await act(async () => lastRun().reject(error))

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(runs).toHaveLength(2)
    await act(async () => lastRun().reject(error))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('asks before the run replaces marks, and continues for "Continue"', async () => {
    const { user, start } = await renderDialog()
    await user.click(start)
    let answer: Promise<boolean> = Promise.resolve(false)

    act(() => {
      answer = lastRun().handlers.confirmReplace()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('The run replaces the marks of this voice.')
    expect(progress()).toHaveTextContent('Transcribing, 0:00 of 3:40')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await expect(answer).resolves.toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('answers false to the replace question for "Cancel"', async () => {
    const { user, start } = await renderDialog()
    await user.click(start)
    let answer: Promise<boolean> = Promise.resolve(true)
    act(() => {
      answer = lastRun().handlers.confirmReplace()
    })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await expect(answer).resolves.toBe(false)
  })

  it('shows the low-match warning with the match percent', async () => {
    const { user, start } = await renderDialog()
    await user.click(start)
    let answer: Promise<boolean> = Promise.resolve(false)
    act(() => lastRun().handlers.onFinishing())

    act(() => {
      answer = lastRun().handlers.confirmLowMatch(0.22)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only 22% of the lyrics matched the audio. Check that the lyrics belong to this song.',
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await expect(answer).resolves.toBe(true)
  })

  it('needs lyrics for "Lyrics only" and starts a lyrics-only run', async () => {
    const { user, start } = await renderDialog()

    await user.click(screen.getByRole('checkbox', { name: 'Lyrics only' }))

    expect(start).toBeDisabled()
    expect(start).toHaveAccessibleDescription('Paste the lyrics to use Lyrics only.')
    expect(screen.getByRole('radio', { name: 'base 139 MB' })).toBeDisabled()
    await user.type(screen.getByLabelText('Lyrics (optional)'), 'All is calm')
    await user.click(start)
    expect(lastRun().request).toMatchObject({ mode: 'lyrics-only', lyrics: 'All is calm' })
    expect(progress()).toHaveTextContent('Aligning lyrics and breaking down words')
  })

  it('closes for Escape when no run is active', async () => {
    const { user, onClose } = await renderDialog()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stays open for Escape during a run', async () => {
    const { user, start, onClose } = await renderDialog()
    await user.click(start)

    await user.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('answers false to the replace question for Escape', async () => {
    const { user, start, onClose } = await renderDialog()
    await user.click(start)
    let answer: Promise<boolean> = Promise.resolve(true)
    act(() => {
      answer = lastRun().handlers.confirmReplace()
    })

    await user.keyboard('{Escape}')

    await expect(answer).resolves.toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('answers false to the low-match warning for Escape', async () => {
    const { user, start, onClose } = await renderDialog()
    await user.click(start)
    let answer: Promise<boolean> = Promise.resolve(true)
    act(() => {
      answer = lastRun().handlers.confirmLowMatch(0.22)
    })

    await user.keyboard('{Escape}')

    await expect(answer).resolves.toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the focus inside the dialog for a click on the backdrop', async () => {
    const { user } = await renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Transcribe' })
    const backdrop = dialog.parentElement
    if (backdrop === null) throw new Error('The dialog has no backdrop.')

    await user.click(backdrop)

    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('starts a speech model run with no lyrics when the lyrics field holds no word', async () => {
    const { user, start } = await renderDialog()
    // user-event reads "[" as the start of a key name, so "[[" types one bracket.
    await user.type(screen.getByLabelText('Lyrics (optional)'), '[[Chorus]')

    await user.click(start)

    expect(lastRun().request.lyrics).toBeUndefined()
  })

  it('keeps "Start" disabled for "Lyrics only" when the lyrics field holds no word', async () => {
    const { user, start } = await renderDialog()
    await user.type(screen.getByLabelText('Lyrics (optional)'), '[[Chorus]')

    await user.click(screen.getByRole('checkbox', { name: 'Lyrics only' }))

    expect(start).toBeDisabled()
    expect(start).toHaveAccessibleDescription('Paste the lyrics to use Lyrics only.')
  })

  it('moves the focus to "Cancel" when a run starts', async () => {
    const { user, start } = await renderDialog()

    await user.click(start)

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('keeps the focus inside the dialog for Tab and Shift+Tab', async () => {
    const { user } = await renderDialog()
    const close = screen.getByRole('button', { name: 'Close' })
    close.focus()

    await user.tab()
    expect(screen.getByRole('radio', { name: 'base 139 MB' })).toHaveFocus()

    await user.tab({ shift: true })
    expect(close).toHaveFocus()
  })

  it('terminates the worker when the dialog closes', async () => {
    const { view } = await renderDialog()

    view.unmount()

    expect(client.dispose).toHaveBeenCalledOnce()
  })
})

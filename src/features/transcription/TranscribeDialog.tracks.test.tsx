import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { makeSongContent } from '../../store/fixtures.test-helpers.ts'
import { getRecord, putRecord, SETTINGS_KEY } from '../../store/db.ts'
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from '../../store/settings.ts'
import { useSongStore } from '../../store/songStore.ts'
import { hasWebGpu } from './device.ts'
import { runTranscription, type TranscribeRequest } from './runTranscription.ts'
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

const SEPARATE = 'Separate the vocals first'
const KEEP = 'Keep the separated tracks'
/** The note for a song of 3 minutes: two tracks of 16-bit samples at 22 050 Hz. */
const SONG_NOTE =
  'The app stores the vocals and the instruments of this song in this browser, about 15 MB. You can listen to each track in the editor.'

let requests: TranscribeRequest[]

beforeEach(() => {
  requests = []
  const client: TranscribeClient = {
    device: 'wasm',
    load: vi.fn(),
    transcribe: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
  }
  vi.mocked(hasWebGpu).mockResolvedValue(false)
  vi.mocked(createTranscribeClient).mockReturnValue(client)
  vi.mocked(runTranscription).mockImplementation((request) => {
    requests.push(request)
    return new Promise(() => undefined)
  })
  const content = makeSongContent()
  useSongStore.setState({ current: { ...content, song: { ...content.song, durationMs: 180_000 } } })
})

afterEach(() => {
  useSongStore.setState({ current: null })
  vi.clearAllMocks()
})

async function renderDialog(selection: TimeRange | null = null) {
  const user = userEvent.setup()
  render(
    <TranscribeDialog
      voiceId="voice-1"
      selection={selection}
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

async function renderSeparated(selection: TimeRange | null = null) {
  await updateSettings({ separateVocals: true })
  const view = await renderDialog(selection)
  await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: SEPARATE })).toBeChecked())
  return view
}

describe('TranscribeDialog and "Keep the separated tracks"', () => {
  it('hides the check box while "Separate the vocals first" is off', async () => {
    await renderDialog()

    expect(screen.queryByRole('checkbox', { name: KEEP })).toBeNull()
  })

  it('shows the check box on by default with the size note of the song', async () => {
    await renderSeparated()

    const keep = await screen.findByRole('checkbox', { name: KEEP })
    expect(keep).toBeChecked()
    expect(keep).toHaveAccessibleDescription(SONG_NOTE)
  })

  it('shows the check box after the separation model choice and before the singer option', async () => {
    await renderSeparated()

    await screen.findByRole('checkbox', { name: KEEP })
    const names = [
      ...document.querySelectorAll<HTMLInputElement>(
        '.transcribe-dialog input[type="checkbox"], .transcribe-dialog input[name="separation-model"]',
      ),
    ].map((input) => input.closest('label')?.textContent ?? '')
    const model = names.findLastIndex(
      (name) => name.startsWith('Fast') || name.startsWith('Demucs'),
    )
    const keep = names.indexOf(KEEP)
    const singers = names.findIndex((name) => name.startsWith('Put each singer'))
    expect(model).toBeLessThan(keep)
    expect(keep).toBeLessThan(singers)
  })

  it('states the size of the range for a run of the time selection', async () => {
    const { user } = await renderSeparated({ startMs: 0, endMs: 60_000 })

    await user.click(screen.getByRole('radio', { name: /^The time selection/ }))

    expect(await screen.findByRole('checkbox', { name: KEEP })).toHaveAccessibleDescription(
      /about 5\.0 MB\./,
    )
  })

  it('stores the choice of the check box', async () => {
    const { user } = await renderSeparated()

    await user.click(await screen.findByRole('checkbox', { name: KEEP }))

    await vi.waitFor(async () => expect((await loadSettings()).keepTracks).toBe(false))
  })

  it('opens with the stored choice and asks the run for no tracks', async () => {
    await updateSettings({ keepTracks: false })
    const { user, start } = await renderSeparated()
    await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: KEEP })).not.toBeChecked())

    await user.click(start)

    expect(requests.at(-1)).toMatchObject({ separateVocals: true, keepTracks: false })
  })

  it('asks the run for the tracks with the default choice', async () => {
    const { user, start } = await renderSeparated()
    await screen.findByRole('checkbox', { name: KEEP })

    await user.click(start)

    expect(requests.at(-1)).toMatchObject({ separateVocals: true, keepTracks: true })
  })

  it('loads stored settings from before the option with the check box on', async () => {
    const older = Object.fromEntries(
      Object.entries({ ...DEFAULT_SETTINGS, separateVocals: true }).filter(
        ([key]) => key !== 'keepTracks',
      ),
    )
    // A record of an earlier version of the app has no `keepTracks` field.
    await putRecord('settings', older as typeof DEFAULT_SETTINGS)

    await renderDialog()

    expect(await getRecord('settings', SETTINGS_KEY)).not.toHaveProperty('keepTracks')
    expect(await screen.findByRole('checkbox', { name: KEEP })).toBeChecked()
  })
})

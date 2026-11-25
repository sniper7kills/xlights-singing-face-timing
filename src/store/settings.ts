import { getRecord, putRecord, SETTINGS_KEY } from './db.ts'
import type { AppSettings } from './types.ts'

/**
 * The settings that apply before the person changes one.
 * The app writes the full record, so a first write needs a value for each field.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  speechModelId: 'whisper-base',
  deviceSpeeds: {},
  defaultFrameMs: 50,
  theme: 'dark',
  transcribeSource: 'browser',
  remoteEndpoint: { baseUrl: '', apiKey: '', model: 'whisper-1' },
  separateVocals: false,
  singerVoices: false,
  separationModel: 'spleeter',
  keepTracks: true,
}

/**
 * Returns the app settings, with the default value for each field that the app has not stored.
 * A record from an earlier version of the app has no field for a later setting.
 */
export async function loadSettings(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...(await getRecord('settings', SETTINGS_KEY)) }
}

/** The last write of `updateSettings`. A failed write does not stop the next write. */
let lastWrite: Promise<unknown> = Promise.resolve()

/**
 * Writes one change to the app settings and keeps the other fields.
 * Each write reads the record after the previous write ends, so two changes close together both stay.
 * @param change The fields to write.
 * Rejects with StorageFullError when the browser storage is full.
 */
export function updateSettings(change: Partial<AppSettings>): Promise<void> {
  const write = lastWrite.then(async () => {
    await putRecord('settings', { ...(await loadSettings()), ...change })
  })
  lastWrite = write.catch(() => undefined)
  return write
}

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
}

/**
 * Returns the app settings, or `DEFAULT_SETTINGS` when the app has stored none.
 * A record from an earlier version of the app can miss a field, so the default fills it.
 */
export async function loadSettings(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...(await getRecord('settings', SETTINGS_KEY)) }
}

/**
 * Writes one change to the app settings and keeps the other fields.
 * @param change The fields to write.
 * Rejects with StorageFullError when the browser storage is full.
 */
export async function updateSettings(change: Partial<AppSettings>): Promise<void> {
  await putRecord('settings', { ...(await loadSettings()), ...change })
}

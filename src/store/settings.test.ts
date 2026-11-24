import { describe, expect, it } from 'vitest'
import { getRecord, putRecord, SETTINGS_KEY } from './db.ts'
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from './settings.ts'

describe('loadSettings', () => {
  it('returns the default settings when the app has stored none', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('returns the stored settings', async () => {
    const stored = {
      ...DEFAULT_SETTINGS,
      speechModelId: 'whisper-small',
      defaultFrameMs: 25 as const,
    }
    await putRecord('settings', stored)

    expect(await loadSettings()).toEqual(stored)
  })
})

describe('updateSettings', () => {
  it('writes the default settings with the change when the app has stored none', async () => {
    await updateSettings({ speechModelId: 'whisper-tiny' })

    expect(await getRecord('settings', SETTINGS_KEY)).toEqual({
      ...DEFAULT_SETTINGS,
      speechModelId: 'whisper-tiny',
    })
  })

  it('keeps the other stored fields', async () => {
    await putRecord('settings', { ...DEFAULT_SETTINGS, defaultFrameMs: 25, theme: 'light' })

    await updateSettings({ speechModelId: 'whisper-small' })

    expect(await loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      speechModelId: 'whisper-small',
      defaultFrameMs: 25,
      theme: 'light',
    })
  })
})

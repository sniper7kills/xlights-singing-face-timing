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

  it('fills a field that a record of an earlier version does not have', async () => {
    // A record of an earlier version has `device` and no `deviceSpeeds`, so the test writes it past the type.
    const earlier = {
      speechModelId: 'whisper-base',
      device: 'wasm',
      defaultFrameMs: 50,
      theme: 'light',
    }
    await putRecord('settings', earlier as unknown as typeof DEFAULT_SETTINGS)

    const settings = await loadSettings()

    expect(settings.deviceSpeeds).toEqual({})
    expect(settings.theme).toBe('light')
  })
})

describe('updateSettings', () => {
  it('keeps the measured speeds of a device when another field changes', async () => {
    await updateSettings({ deviceSpeeds: { 'whisper-tiny': { wasm: 4 } } })

    await updateSettings({ theme: 'light' })

    expect((await loadSettings()).deviceSpeeds).toEqual({ 'whisper-tiny': { wasm: 4 } })
  })

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

import { describe, expect, it, vi } from 'vitest'
import { getRecord, putRecord, SETTINGS_KEY } from './db.ts'
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from './settings.ts'

vi.mock('./db.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db.ts')>()
  return { ...actual, putRecord: vi.fn(actual.putRecord) }
})

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

  it('keeps both changes of two writes that start together', async () => {
    const remoteEndpoint = { baseUrl: 'http://localhost:8000/v1', apiKey: '', model: 'm' }

    await Promise.all([
      updateSettings({ deviceSpeeds: { 'whisper-base': { wasm: 2 } } }),
      updateSettings({ remoteEndpoint }),
    ])

    expect(await loadSettings()).toMatchObject({
      deviceSpeeds: { 'whisper-base': { wasm: 2 } },
      remoteEndpoint,
    })
  })

  it('writes the next change after a write that fails', async () => {
    const full = new Error('storage full')
    vi.mocked(putRecord).mockRejectedValueOnce(full)

    const failed = updateSettings({ theme: 'light' })
    const next = updateSettings({ speechModelId: 'whisper-tiny' })

    await expect(failed).rejects.toBe(full)
    await next
    expect((await loadSettings()).speechModelId).toBe('whisper-tiny')
  })

  it('stores the remote endpoint and the last source choice', async () => {
    const remoteEndpoint = { baseUrl: 'http://localhost:8000/v1', apiKey: 'sk-1', model: 'm' }
    await updateSettings({ transcribeSource: 'remote', remoteEndpoint })

    expect(await loadSettings()).toMatchObject({ transcribeSource: 'remote', remoteEndpoint })
  })
})

describe('loadSettings of an earlier record', () => {
  it('adds the default value of each field that the record does not have', async () => {
    const earlier = { speechModelId: 'whisper-base', device: 'wasm', defaultFrameMs: 50 }
    // A record from an earlier version of the app has `device`, and it does not have the remote fields or `deviceSpeeds`.
    await putRecord('settings', {
      ...earlier,
      theme: 'light',
    } as unknown as typeof DEFAULT_SETTINGS)

    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, device: 'wasm', theme: 'light' })
  })

  it('gives the default kept tracks and singer count to a record with neither field', async () => {
    const earlier: Partial<typeof DEFAULT_SETTINGS> = { ...DEFAULT_SETTINGS, singerVoices: true }
    delete earlier.keepTracks
    delete earlier.singerCount
    await putRecord('settings', earlier as typeof DEFAULT_SETTINGS)

    expect(await loadSettings()).toMatchObject({
      singerVoices: true,
      keepTracks: true,
      singerCount: 'automatic',
    })
  })
})

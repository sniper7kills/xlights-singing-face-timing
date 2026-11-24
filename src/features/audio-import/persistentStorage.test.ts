import { afterEach, describe, expect, it } from 'vitest'
import { putRecord } from '../../store/db.ts'
import type { Song } from '../../store/types.ts'
import { readStorageState, requestPersistentStorageForFirstSong } from './persistentStorage.ts'
import { removeStorageStub, stubStorage } from './storageStub.test-helpers.ts'

// putRecord stores the song without storeNewSong, so no other request reaches the stub.
function addSong(id: string) {
  const song: Song = {
    id,
    name: id,
    durationMs: 1000,
    frameMs: 50,
    createdAt: '2026-11-24T10:00:00.000Z',
    updatedAt: '2026-11-24T10:00:00.000Z',
  }
  return putRecord('songs', song)
}

afterEach(() => {
  removeStorageStub()
})

describe('requestPersistentStorageForFirstSong', () => {
  it('requests persistent storage when the database holds one song', async () => {
    await addSong('carol')
    const storage = stubStorage({ granted: true })

    expect(await requestPersistentStorageForFirstSong()).toBe(true)
    expect(storage.persist).toHaveBeenCalledTimes(1)
  })

  it('makes no request when the database holds two songs', async () => {
    await addSong('carol')
    await addSong('noel')
    const storage = stubStorage()

    expect(await requestPersistentStorageForFirstSong()).toBeUndefined()
    expect(storage.persist).not.toHaveBeenCalled()
  })

  it('resolves to false when the browser refuses', async () => {
    await addSong('carol')
    stubStorage({ granted: false })

    expect(await requestPersistentStorageForFirstSong()).toBe(false)
  })

  it('resolves to false when persist rejects with a TypeError', async () => {
    await addSong('carol')
    stubStorage().persist.mockRejectedValue(new TypeError('no storage shelf'))

    expect(await requestPersistentStorageForFirstSong()).toBe(false)
  })

  it('resolves to false when the browser has no Storage API', async () => {
    await addSong('carol')

    expect(await requestPersistentStorageForFirstSong()).toBe(false)
  })
})

describe('readStorageState', () => {
  it('returns the used bytes, the allowed bytes and the persistence', async () => {
    stubStorage({ granted: true, usage: 1000, quota: 5000 })

    expect(await readStorageState()).toEqual({ usedBytes: 1000, quotaBytes: 5000, persisted: true })
  })

  it('returns null when the browser has no Storage API', async () => {
    expect(await readStorageState()).toBeNull()
  })

  it('returns null when estimate rejects with a TypeError', async () => {
    stubStorage().estimate.mockRejectedValue(new TypeError('no storage shelf'))

    expect(await readStorageState()).toBeNull()
  })
})

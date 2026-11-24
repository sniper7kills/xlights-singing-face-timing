import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DICTIONARY = { HELLO: 'HH AH0 L OW1', STAR: 'S T AA1 R' }

// The loader keeps its request for the whole visit, so each test imports a fresh module.
async function importLoader() {
  return import('./loadDictionary.ts')
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadDictionary', () => {
  it('requests dict/cmudict.json one time for several calls', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(DICTIONARY)))
    vi.stubGlobal('fetch', fetch)
    const { loadDictionary } = await importLoader()

    const first = loadDictionary()
    const second = loadDictionary()

    expect(second).toBe(first)
    expect(await first).toEqual(DICTIONARY)
    expect(await loadDictionary()).toEqual(DICTIONARY)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/dict/cmudict.json')
  })

  it('does not request the file before the first call', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await importLoader()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects with DictionaryLoadError and the edge case copy when the server answers 404', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })))
    const { loadDictionary, DictionaryLoadError } = await importLoader()

    const result = loadDictionary()

    await expect(result).rejects.toBeInstanceOf(DictionaryLoadError)
    await expect(result).rejects.toThrow(
      'The dictionary did not load. Check the connection and retry.',
    )
  })

  it('rejects with DictionaryLoadError when the network fails', async () => {
    const cause = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', () => Promise.reject(cause))
    const { loadDictionary, DictionaryLoadError } = await importLoader()

    const error = await loadDictionary().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DictionaryLoadError)
    expect(error).toHaveProperty('cause', cause)
  })

  it('rejects with DictionaryLoadError when the file is not JSON', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('<html>')))
    const { loadDictionary, DictionaryLoadError } = await importLoader()

    await expect(loadDictionary()).rejects.toBeInstanceOf(DictionaryLoadError)
  })

  it('requests the file again on the call after a failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json(DICTIONARY))
    vi.stubGlobal('fetch', fetch)
    const { loadDictionary } = await importLoader()

    await expect(loadDictionary()).rejects.toThrow()

    expect(await loadDictionary()).toEqual(DICTIONARY)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

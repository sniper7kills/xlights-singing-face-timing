import { describe, expect, it, vi } from 'vitest'
import { SplitFailure } from '../splitFailure.ts'
import type { SplitModel } from '../splitModels.ts'
import { loadSplitModel, SPLIT_MODEL_CACHE, type SplitModelSource } from './splitModelFile.ts'

// The SHA-256 of the bytes [1, 2, 3].
const HASH = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'

const model: SplitModel = {
  fileName: 'small.onnx',
  bytes: 3,
  sha256: HASH,
  chunkSamples: 4410,
  frames: 11,
  stems: ['male', 'female'],
}

/** A source with a cache in memory and a host that answers with the given bytes in two parts. */
function source(bytes: number[]) {
  const entries = new Map<string, ArrayBuffer>()
  const names: string[] = []
  const cache = {
    match: async (url: string) => {
      const stored = entries.get(url)
      return stored === undefined ? undefined : new Response(stored)
    },
    put: async (url: string, response: Response) => {
      entries.set(url, await response.arrayBuffer())
    },
  }
  const fetch = vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from(bytes.slice(0, 2)))
        controller.enqueue(Uint8Array.from(bytes.slice(2)))
        controller.close()
      },
    })
    return new Response(body)
  })
  const value: SplitModelSource = {
    caches: {
      open: async (name: string) => {
        names.push(name)
        return cache as unknown as Cache
      },
    },
    fetch,
    origin: 'https://app.test',
    base: '/',
  }
  return { value, entries, names, fetch }
}

describe('loadSplitModel', () => {
  it('downloads the file from models/ on the site, reports the bytes and caches it', async () => {
    const { value, entries, names, fetch } = source([1, 2, 3])
    const onDownload = vi.fn()
    const contents = await loadSplitModel(model, onDownload, value)
    expect([...new Uint8Array(contents)]).toEqual([1, 2, 3])
    expect(fetch).toHaveBeenCalledWith('https://app.test/models/small.onnx')
    expect(onDownload).toHaveBeenLastCalledWith(3, 3)
    expect(names).toEqual([SPLIT_MODEL_CACHE])
    expect(entries.has('https://app.test/models/small.onnx')).toBe(true)
  })

  it('rejects a file with the wrong size with the kind download and caches nothing', async () => {
    const { value, entries } = source([1, 2, 3, 4])
    const failure = loadSplitModel(model, () => undefined, value)
    await expect(failure).rejects.toThrow(SplitFailure)
    await expect(failure).rejects.toHaveProperty('kind', 'download')
    await expect(failure).rejects.toThrow('has 4 bytes, not 3')
    expect(entries.size).toBe(0)
  })

  it('rejects a file with the wrong SHA-256 with the kind download and caches nothing', async () => {
    const { value, entries } = source([1, 2, 4])
    const failure = loadSplitModel(model, () => undefined, value)
    await expect(failure).rejects.toHaveProperty('kind', 'download')
    await expect(failure).rejects.toThrow(`not ${HASH}`)
    expect(entries.size).toBe(0)
  })

  it('reads the file from the cache at the second run, with no download', async () => {
    const { value, fetch } = source([1, 2, 3])
    await loadSplitModel(model, () => undefined, value)
    const onDownload = vi.fn()
    await loadSplitModel(model, onDownload, value)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(onDownload).not.toHaveBeenCalled()
  })
})

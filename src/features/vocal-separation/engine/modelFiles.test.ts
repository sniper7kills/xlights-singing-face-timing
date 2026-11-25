import { describe, expect, it, vi } from 'vitest'
import { SeparationFailure } from '../separationFailure.ts'
import { MODEL_CACHE, loadModelFiles, type DownloadEnvironment } from './modelFiles.ts'

/** A cache storage in memory, with the two cache methods that the download uses. */
function memoryCaches() {
  const entries = new Map<string, ArrayBuffer>()
  const names: string[] = []
  const cache = {
    match: async (url: string) => {
      const bytes = entries.get(url)
      return bytes === undefined ? undefined : new Response(bytes)
    },
    put: async (url: string, response: Response) => {
      entries.set(url, await response.arrayBuffer())
    },
  }
  const caches = {
    open: async (name: string) => {
      names.push(name)
      return cache as unknown as Cache
    },
  }
  return { caches, entries, names }
}

/** A response whose body arrives in the given parts and then fails, when `fail` is true. */
function streamedResponse(parts: number[][], fail = false): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(Uint8Array.from(part))
      if (fail) controller.error(new TypeError('network error'))
      else controller.close()
    },
  })
  return new Response(body)
}

const fileA = { url: 'https://host.test/a.onnx', bytes: 3 }
const fileB = { url: 'https://host.test/b.onnx', bytes: 2 }
const files = [fileA, fileB]

function environment(fetch: DownloadEnvironment['fetch']) {
  const storage = memoryCaches()
  return { storage, environment: { caches: storage.caches, fetch } }
}

function bytesOf(buffers: ArrayBuffer[]): number[][] {
  return buffers.map((buffer) => Array.from(new Uint8Array(buffer)))
}

describe('loadModelFiles', () => {
  it('downloads each file and reports the bytes of all files', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('a.onnx') ? streamedResponse([[1, 2], [3]]) : streamedResponse([[4, 5]]),
    )
    const { environment: env } = environment(fetch)
    const onDownload = vi.fn()
    const contents = await loadModelFiles(files, onDownload, env)
    expect(bytesOf(contents)).toEqual([
      [1, 2, 3],
      [4, 5],
    ])
    expect(onDownload.mock.calls).toEqual([
      [2, 5],
      [3, 5],
      [5, 5],
    ])
  })

  it('reads the files from the cache at the second run, with no download and no download call', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('a.onnx') ? streamedResponse([[1, 2, 3]]) : streamedResponse([[4, 5]]),
    )
    const { environment: env, storage } = environment(fetch)
    await loadModelFiles(files, () => undefined, env)
    fetch.mockClear()
    const onDownload = vi.fn()
    const contents = await loadModelFiles(files, onDownload, env)
    expect(bytesOf(contents)).toEqual([
      [1, 2, 3],
      [4, 5],
    ])
    expect(fetch).not.toHaveBeenCalled()
    expect(onDownload).not.toHaveBeenCalled()
    expect(storage.names).toEqual([MODEL_CACHE, MODEL_CACHE])
  })

  it('downloads only the file that is not in the cache', async () => {
    const fetch = vi.fn(async () => streamedResponse([[4, 5]]))
    const { environment: env, storage } = environment(fetch)
    storage.entries.set(fileA.url, Uint8Array.from([1, 2, 3]).buffer)
    const onDownload = vi.fn()
    await loadModelFiles(files, onDownload, env)
    expect(fetch).toHaveBeenCalledWith(fileB.url)
    expect(onDownload).toHaveBeenLastCalledWith(2, 2)
  })

  it('leaves no cache entry for a download that stops', async () => {
    const { environment: env, storage } = environment(async () => streamedResponse([[1]], true))
    const failure = loadModelFiles(files, () => undefined, env)
    await expect(failure).rejects.toThrow(SeparationFailure)
    await expect(failure).rejects.toHaveProperty('kind', 'download')
    expect(storage.entries.size).toBe(0)
  })

  it('leaves no cache entry for a file with the wrong size', async () => {
    const { environment: env, storage } = environment(async () => streamedResponse([[1, 2]]))
    await expect(loadModelFiles(files, () => undefined, env)).rejects.toHaveProperty(
      'kind',
      'download',
    )
    expect(storage.entries.size).toBe(0)
  })

  it('fails with the kind download for an error status', async () => {
    const { environment: env } = environment(async () => new Response('missing', { status: 404 }))
    await expect(loadModelFiles(files, () => undefined, env)).rejects.toThrow(
      'The host answered 404 for https://host.test/a.onnx.',
    )
  })

  it('fails with the kind download when the request does not reach the host', async () => {
    const { environment: env } = environment(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(loadModelFiles(files, () => undefined, env)).rejects.toHaveProperty(
      'kind',
      'download',
    )
  })
})

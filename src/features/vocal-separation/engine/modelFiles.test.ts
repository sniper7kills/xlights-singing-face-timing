import { describe, expect, it, vi } from 'vitest'
import { SeparationFailure } from '../separationFailure.ts'
import {
  MODEL_CACHE,
  loadModelFiles,
  type DownloadEnvironment,
  type ModelFile,
} from './modelFiles.ts'

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
// The SHA-256 values of the bytes [1, 2, 3] and [4, 5].
const hashedFiles: ModelFile[] = [
  { ...fileA, sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81' },
  { ...fileB, sha256: '2fa1b377bf67309f65e5e7bc9d924345ca648dec4e601a398a9cb497dcba3765' },
]

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

  it('rejects a body that is many bytes larger than the file, and caches nothing', async () => {
    const large = Array.from({ length: 1000 }, (_, index) => index % 256)
    const { environment: env, storage } = environment(async () => streamedResponse([large]))
    const failure = loadModelFiles([fileA], () => undefined, env)
    await expect(failure).rejects.toHaveProperty('kind', 'download')
    await expect(failure).rejects.toThrow('https://host.test/a.onnx has 1000 bytes, not 3.')
    expect(storage.entries.size).toBe(0)
  })

  it('rejects a response with a Content-Length of another size before it reads the body', async () => {
    const response = new Response(Uint8Array.from([1, 2, 3]), {
      headers: { 'Content-Length': '50' },
    })
    const { environment: env, storage } = environment(async () => response)
    const onDownload = vi.fn()
    const failure = loadModelFiles([fileA], onDownload, env)
    await expect(failure).rejects.toHaveProperty('kind', 'download')
    await expect(failure).rejects.toThrow('https://host.test/a.onnx has 50 bytes, not 3.')
    expect(onDownload).not.toHaveBeenCalled()
    expect(response.bodyUsed).toBe(false)
    expect(storage.entries.size).toBe(0)
  })

  it('accepts a Content-Length of another size when the body has a content coding', async () => {
    const response = new Response(Uint8Array.from([1, 2, 3]), {
      headers: { 'Content-Length': '2', 'Content-Encoding': 'gzip' },
    })
    const { environment: env } = environment(async () => response)
    expect(bytesOf(await loadModelFiles([fileA], () => undefined, env))).toEqual([[1, 2, 3]])
  })

  it('rejects an HTML page with status 200 before it reads the body', async () => {
    const response = new Response('<!doctype html><title>Not found</title>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
    const { environment: env, storage } = environment(async () => response)
    const onDownload = vi.fn()
    const failure = loadModelFiles([fileA], onDownload, env)
    await expect(failure).rejects.toHaveProperty('kind', 'download')
    await expect(failure).rejects.toThrow(
      'The host answered with an HTML page for https://host.test/a.onnx.',
    )
    expect(onDownload).not.toHaveBeenCalled()
    expect(storage.entries.size).toBe(0)
  })

  it('fails with the kind memory when the browser cannot give the buffer of the file', async () => {
    // A typed array of 2^53 bytes is above the limit of each JavaScript engine, so the allocation throws a RangeError.
    const huge = { url: 'https://host.test/huge.onnx', bytes: 2 ** 53 }
    const { environment: env, storage } = environment(async () => streamedResponse([[1]]))
    const failure = loadModelFiles([huge], () => undefined, env)
    await expect(failure).rejects.toThrow(SeparationFailure)
    await expect(failure).rejects.toHaveProperty('kind', 'memory')
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

  it('fails with the kind download and writes no cache entry for a file with the wrong hash', async () => {
    const put = vi.fn()
    const { environment: env, storage } = environment(async (url: string) =>
      url.endsWith('a.onnx') ? streamedResponse([[9, 9, 9]]) : streamedResponse([[4, 5]]),
    )
    const cache = await storage.caches.open(MODEL_CACHE)
    cache.put = put
    const failure = loadModelFiles(hashedFiles, () => undefined, env)
    await expect(failure).rejects.toThrow(SeparationFailure)
    await expect(failure).rejects.toHaveProperty('kind', 'download')
    expect(put).not.toHaveBeenCalled()
  })

  it('returns and caches the files whose hash matches', async () => {
    const { environment: env, storage } = environment(async (url: string) =>
      url.endsWith('a.onnx') ? streamedResponse([[1, 2, 3]]) : streamedResponse([[4, 5]]),
    )
    const contents = await loadModelFiles(hashedFiles, () => undefined, env)
    expect(bytesOf(contents)).toEqual([
      [1, 2, 3],
      [4, 5],
    ])
    expect([...storage.entries.keys()]).toEqual([fileA.url, fileB.url])
  })

  it('checks the hash before the cache write', async () => {
    const order: string[] = []
    const original = crypto.subtle.digest.bind(crypto.subtle)
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      order.push('digest')
      return original(algorithm, data)
    })
    const { environment: env, storage } = environment(async () => streamedResponse([[1, 2, 3]]))
    const cache = await storage.caches.open(MODEL_CACHE)
    const put = cache.put.bind(cache)
    cache.put = async (request, response) => {
      order.push('put')
      await put(request, response)
    }
    await loadModelFiles([hashedFiles[0] as ModelFile], () => undefined, env)
    digest.mockRestore()
    expect(order).toEqual(['digest', 'put'])
  })
})

describe('loadModelFiles with a cache that fails', () => {
  const fetchFiles = async (url: string) =>
    url.endsWith('a.onnx') ? streamedResponse([[1, 2, 3]]) : streamedResponse([[4, 5]])

  async function expectBytes(caches: DownloadEnvironment['caches']) {
    const contents = await loadModelFiles(hashedFiles, () => undefined, {
      caches,
      fetch: fetchFiles,
    })
    expect(bytesOf(contents)).toEqual([
      [1, 2, 3],
      [4, 5],
    ])
  }

  it('downloads the files when the browser has no cache storage', async () => {
    await expectBytes(undefined)
  })

  it('downloads the files when the cache does not open', async () => {
    await expectBytes({
      open: async () => Promise.reject(new DOMException('denied', 'SecurityError')),
    })
  })

  it('downloads the files when the cache lookup rejects', async () => {
    const storage = memoryCaches()
    const cache = await storage.caches.open(MODEL_CACHE)
    cache.match = async () => Promise.reject(new DOMException('denied', 'SecurityError'))
    await expectBytes(storage.caches)
  })

  it('returns the files when the cache write rejects with a QuotaExceededError', async () => {
    const storage = memoryCaches()
    const cache = await storage.caches.open(MODEL_CACHE)
    cache.put = async () => Promise.reject(new DOMException('full', 'QuotaExceededError'))
    await expectBytes(storage.caches)
    expect(storage.entries.size).toBe(0)
  })

  it('stores the files at a later call with a working cache', async () => {
    await expectBytes(undefined)
    const storage = memoryCaches()
    await expectBytes(storage.caches)
    expect([...storage.entries.keys()]).toEqual([fileA.url, fileB.url])
  })
})

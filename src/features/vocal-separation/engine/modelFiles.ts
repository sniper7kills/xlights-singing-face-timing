import { SeparationFailure } from '../separationFailure.ts'

/** One model file on a host that sends CORS headers. */
export interface ModelFile {
  url: string
  /** The size of the file. A download with another size fails. */
  bytes: number
  /**
   * The SHA-256 of the file, in lower-case hexadecimal. A download with another hash fails.
   * With no value, the download has the size check only.
   */
  sha256?: string
}

/** The browser functions that the download uses. Tests replace them. */
export interface DownloadEnvironment {
  /** A browser with no Cache API, for example in an insecure context, gives `undefined`. */
  caches: Pick<CacheStorage, 'open'> | undefined
  fetch: (url: string) => Promise<Response>
}

/** The cache of the model files. A new name makes each browser download the files again. */
export const MODEL_CACHE = 'vocal-separation-models-v1'

async function readBody(
  response: Response,
  onBytes: (bytes: number) => void,
): Promise<Uint8Array<ArrayBuffer>[]> {
  if (response.body === null) return [new Uint8Array(await response.arrayBuffer())]
  const reader = response.body.getReader()
  const parts: Uint8Array<ArrayBuffer>[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return parts
    parts.push(value)
    onBytes(value.byteLength)
  }
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes
}

async function download(
  file: ModelFile,
  onBytes: (bytes: number) => void,
  environment: DownloadEnvironment,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await environment.fetch(file.url).catch((error: unknown) => {
    throw new SeparationFailure('download', `The download of ${file.url} failed: ${String(error)}`)
  })
  if (!response.ok) {
    throw new SeparationFailure('download', `The host answered ${response.status} for ${file.url}.`)
  }
  const parts = await readBody(response, onBytes).catch((error: unknown) => {
    throw new SeparationFailure('download', `The download of ${file.url} stopped: ${String(error)}`)
  })
  const bytes = concatenate(parts)
  if (bytes.byteLength !== file.bytes) {
    throw new SeparationFailure(
      'download',
      `${file.url} has ${bytes.byteLength} bytes, not ${file.bytes}.`,
    )
  }
  await checkHash(file, bytes)
  return bytes
}

function hexadecimal(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function checkHash(file: ModelFile, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  if (file.sha256 === undefined) return
  const hash = hexadecimal(await crypto.subtle.digest('SHA-256', bytes))
  if (hash !== file.sha256) {
    throw new SeparationFailure(
      'download',
      `${file.url} has the SHA-256 ${hash}, not ${file.sha256}.`,
    )
  }
}

// A private window or blocked site data makes each cache call reject, and the run then uses the bytes in memory.
async function openCache(caches: DownloadEnvironment['caches']): Promise<Cache | undefined> {
  return caches?.open(MODEL_CACHE).catch(() => undefined)
}

/** Returns the cached contents of a file, or `undefined` for a miss or a cache that fails. */
async function readCached(
  cache: Cache | undefined,
  file: ModelFile,
): Promise<ArrayBuffer | undefined> {
  return Promise.resolve()
    .then(async () => (await cache?.match(file.url))?.arrayBuffer())
    .catch(() => undefined)
}

// A full disk must not waste a complete download, so a failed write leaves the run as it is.
async function writeCached(
  cache: Cache | undefined,
  file: ModelFile,
  bytes: Uint8Array<ArrayBuffer>,
) {
  await Promise.resolve()
    .then(() => cache?.put(file.url, new Response(bytes)))
    .catch(() => undefined)
}

/**
 * Returns the contents of the model files, from the browser cache or from the host.
 * A file goes into the cache only after its full download and its size and hash checks, so the engine trusts a cache hit.
 * With no usable cache, the function downloads the files and keeps them in memory for this run only.
 * @param files The model files.
 * @param onDownload Receives the downloaded bytes and the size of the missing files. A run with all files in the cache calls it never.
 * @param environment The cache storage and the `fetch` function.
 * Rejects with a `SeparationFailure` of kind 'download' when a download fails, or has the wrong size or the wrong hash.
 * A cache that fails never rejects the call.
 */
export async function loadModelFiles(
  files: readonly ModelFile[],
  onDownload: (loadedBytes: number, totalBytes: number) => void,
  environment: DownloadEnvironment,
): Promise<ArrayBuffer[]> {
  const cache = await openCache(environment.caches)
  const cached = await Promise.all(files.map((file) => readCached(cache, file)))
  const totalBytes = files.reduce((sum, file, index) => sum + (cached[index] ? 0 : file.bytes), 0)
  let loadedBytes = 0
  const contents: ArrayBuffer[] = []
  for (const [index, file] of files.entries()) {
    const hit = cached[index]
    if (hit !== undefined) {
      contents.push(hit)
      continue
    }
    const bytes = await download(
      file,
      (bytes) => {
        loadedBytes += bytes
        onDownload(loadedBytes, totalBytes)
      },
      environment,
    )
    await writeCached(cache, file, bytes)
    contents.push(bytes.buffer)
  }
  return contents
}

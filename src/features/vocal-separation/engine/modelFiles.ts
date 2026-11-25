import { SeparationFailure } from '../separationFailure.ts'

/** One model file on a host that sends CORS headers. */
export interface ModelFile {
  url: string
  /** The size of the file. A download with another size fails. */
  bytes: number
}

/** The browser functions that the download uses. Tests replace them. */
export interface DownloadEnvironment {
  caches: Pick<CacheStorage, 'open'>
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
  return bytes
}

/**
 * Returns the contents of the model files, from the browser cache or from the host.
 * A file goes into the cache only after its full download, so a failed download leaves no cache entry.
 * @param files The model files.
 * @param onDownload Receives the downloaded bytes and the size of the missing files. A run with all files in the cache calls it never.
 * @param environment The cache storage and the `fetch` function.
 * Rejects with a `SeparationFailure` of kind 'download' when a download fails or has the wrong size.
 */
export async function loadModelFiles(
  files: readonly ModelFile[],
  onDownload: (loadedBytes: number, totalBytes: number) => void,
  environment: DownloadEnvironment,
): Promise<ArrayBuffer[]> {
  const cache = await environment.caches.open(MODEL_CACHE)
  const cached = await Promise.all(files.map((file) => cache.match(file.url)))
  const totalBytes = files.reduce((sum, file, index) => sum + (cached[index] ? 0 : file.bytes), 0)
  let loadedBytes = 0
  const contents: ArrayBuffer[] = []
  for (const [index, file] of files.entries()) {
    const hit = cached[index]
    if (hit !== undefined) {
      contents.push(await hit.arrayBuffer())
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
    await cache.put(file.url, new Response(bytes))
    contents.push(bytes.buffer)
  }
  return contents
}

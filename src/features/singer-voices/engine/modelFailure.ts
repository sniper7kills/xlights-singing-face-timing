import { SingerFailure } from '../singerFailure.ts'

// The WASM runtime reports a failed allocation as a C++ `std::bad_alloc`, and the browser names it in other words.
const MEMORY_PATTERN = /bad_alloc|out of memory|allocation failed/i
// `fetch` rejects with a `TypeError` for a network error. The texts of an HTTP error are in `src/utils/hub/constants.js` of the library.
const DOWNLOAD_PATTERN =
  /failed to fetch|networkerror|could not locate file|access to file|load file/i

/**
 * Returns the failure for an error of the model load.
 * A memory text gives 'memory'. A `TypeError` or a download text gives 'download'. Any other error gives 'model'.
 * @param error The rejection of the model load.
 */
export function loadFailure(error: unknown): SingerFailure {
  const text = String(error)
  const detail = `The singer models did not load: ${text}`
  if (error instanceof RangeError || MEMORY_PATTERN.test(text)) {
    return new SingerFailure('memory', detail)
  }
  if (error instanceof TypeError || DOWNLOAD_PATTERN.test(text)) {
    return new SingerFailure('download', detail)
  }
  return new SingerFailure('model', detail)
}

/**
 * Returns the failure for an error of a model run.
 * A `RangeError` or a memory text gives 'memory'. Any other error gives 'model'.
 * @param error The rejection of the model run.
 */
export function runFailure(error: unknown): SingerFailure {
  const text = String(error)
  const kind = error instanceof RangeError || MEMORY_PATTERN.test(text) ? 'memory' : 'model'
  return new SingerFailure(kind, `The singer models did not run: ${text}`)
}

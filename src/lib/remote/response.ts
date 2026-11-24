/**
 * The cause of a failed remote run:
 * - `network`: the browser gave no response. The cause is no connection or a CORS refusal, and the browser does not tell which.
 * - `auth`: HTTP 401 or 403.
 * - `not-found`: HTTP 404.
 * - `too-large`: HTTP 413, or audio above the size limit before the upload.
 * - `rate-limit`: HTTP 429.
 * - `server`: HTTP 500 or more.
 * - `refused`: any other HTTP status that is not a success.
 * - `not-json`: the body of a success is not JSON.
 * - `no-word-times`: the JSON has no `words` list.
 */
export type RemoteErrorKind =
  | 'network'
  | 'auth'
  | 'not-found'
  | 'too-large'
  | 'rate-limit'
  | 'server'
  | 'refused'
  | 'not-json'
  | 'no-word-times'

/**
 * A remote call failed. The message is fixed text with no part of the request or the response,
 * so that an error never holds the API key.
 */
export class RemoteError extends Error {
  readonly kind: RemoteErrorKind
  /** The host of the endpoint, for example `localhost:8000`. */
  readonly host: string
  /** The HTTP status, or null when the browser gave no response. */
  readonly status: number | null
  constructor(kind: RemoteErrorKind, host: string, status: number | null = null) {
    super(`The remote run failed: ${kind}${status === null ? '' : ` (HTTP ${status})`}.`)
    this.name = 'RemoteError'
    this.kind = kind
    this.host = host
    this.status = status
  }
}

/**
 * Returns the cause of an HTTP status that is not a success.
 * @param status An HTTP status from 400 to 599.
 */
export function kindForStatus(status: number): RemoteErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not-found'
  if (status === 413) return 'too-large'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'refused'
}

/** One word of a remote response, in milliseconds of the song. The type matches `TimedWord`. */
export type RemoteWord = { text: string; startMs: number; endMs: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function wordOf(item: unknown, offsetMs: number): RemoteWord | null {
  if (!isRecord(item)) return null
  const { word, start, end } = item
  if (typeof word !== 'string' || typeof start !== 'number' || typeof end !== 'number') return null
  const text = word.trim()
  if (text === '') return null
  return { text, startMs: offsetMs + start * 1000, endMs: offsetMs + end * 1000 }
}

/**
 * Returns the words of a `verbose_json` response with song times in milliseconds.
 * The rule is the same as for the worker: the app drops a word with no start time or no end time, or with no text.
 * The words keep the fraction of a millisecond, because `buildMarks` snaps each time to the frame size.
 * @param body The parsed JSON of the response.
 * @param offsetMs The song time of the first sample that the app sent.
 * @param host The host of the endpoint, for the error.
 * Throws RemoteError of kind `no-word-times` when the body has no `words` list.
 */
export function wordsFromResponse(body: unknown, offsetMs: number, host: string): RemoteWord[] {
  if (!isRecord(body) || !Array.isArray(body.words)) throw new RemoteError('no-word-times', host)
  const words: RemoteWord[] = []
  for (const item of body.words) {
    const word = wordOf(item, offsetMs)
    if (word !== null) words.push(word)
  }
  return words
}

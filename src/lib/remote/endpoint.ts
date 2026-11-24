/** The settings of a remote endpoint that the person types in the transcribe dialog. */
export type RemoteEndpoint = {
  /** The base URL with no trailing slash, for example `https://api.openai.com/v1`. */
  baseUrl: string
  /** The API key. An empty string sends no `Authorization` header. */
  apiKey: string
  /** The name of the speech model on the server, for example `whisper-1`. */
  model: string
}

/** The result of `parseBaseUrl`: the base URL to store, or the reason that the text is not a base URL. */
export type BaseUrlResult =
  { ok: true; baseUrl: string } | { ok: false; reason: 'empty' | 'invalid' | 'credentials' }

/**
 * Returns the base URL to store for the text that the person typed.
 * The app keeps the path as typed and removes only a trailing slash, because servers put the API at different paths.
 * @param text The text of the base URL field.
 * Returns `invalid` for text that is not an `http` or `https` URL, or that has a query or a fragment.
 * Returns `credentials` for a URL with a user name or a password, because the browser refuses such a request.
 */
export function parseBaseUrl(text: string): BaseUrlResult {
  const trimmed = text.trim().replace(/\/+$/, '')
  if (trimmed === '') return { ok: false, reason: 'empty' }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'invalid' }
  if (url.search !== '' || url.hash !== '') return { ok: false, reason: 'invalid' }
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'credentials' }
  return { ok: true, baseUrl: trimmed }
}

/** Returns the URL of the transcription operation: the base URL and `/audio/transcriptions`. */
export function transcriptionsUrl(baseUrl: string): string {
  return `${baseUrl}/audio/transcriptions`
}

/** Returns the host of a base URL with its port, for example `localhost:8000`. */
export function endpointHost(baseUrl: string): string {
  return new URL(baseUrl).host
}

/**
 * The loopback host names that a page from an `https` address can call with `http`.
 * The Content Security Policy of the app allows `http` to these two hosts only.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Returns true when the browser blocks the call as mixed content.
 * A page from an `https` address cannot call an `http` address, except an address on this computer.
 * @param pageProtocol The protocol of the page, for example `https:`.
 * @param baseUrl A base URL that `parseBaseUrl` accepted.
 */
export function isMixedContent(pageProtocol: string, baseUrl: string): boolean {
  const url = new URL(baseUrl)
  return pageProtocol === 'https:' && url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)
}

/**
 * Returns the text fields of the multipart request, in the order that the request sends them.
 * `verbose_json` with the word granularity is the only response format of the API that gives word times.
 * @param model The name of the speech model on the server.
 */
export function transcriptionFields(model: string): [string, string][] {
  return [
    ['model', model],
    ['language', 'en'],
    ['response_format', 'verbose_json'],
    ['timestamp_granularities[]', 'word'],
  ]
}

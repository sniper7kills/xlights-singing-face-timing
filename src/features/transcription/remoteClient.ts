import {
  endpointHost,
  type RemoteEndpoint,
  transcriptionFields,
  transcriptionsUrl,
} from '../../lib/remote/endpoint.ts'
import { kindForStatus, RemoteError, wordsFromResponse } from '../../lib/remote/response.ts'
import { encodeWav, MAX_UPLOAD_BYTES } from '../../lib/remote/wav.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { TranscribeError } from './transcribeClient.ts'
import type { TimedWord } from './types.ts'

/** The functions that receive the steps of one remote call, and the signal that stops it. */
export type RemoteHandlers = {
  /** Aborts the call. The call then rejects with TranscribeError of kind 'cancelled'. */
  signal: AbortSignal
  /** Receives the bytes that the browser sent and the bytes of the request. */
  onUpload?: (loadedBytes: number, totalBytes: number) => void
  /** Tells the caller that the upload is complete and the app waits for the server. */
  onWaiting?: () => void
}

/** Makes the request object. Tests supply a fake. */
export type CreateXhr = () => XMLHttpRequest

function cancelled(): TranscribeError {
  return new TranscribeError('cancelled', 'The person cancelled the transcribe run.')
}

function formBody(model: string, wav: Uint8Array<ArrayBuffer>): FormData {
  const body = new FormData()
  // The API reads the format of the audio from the file name and the content type.
  body.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav')
  for (const [name, value] of transcriptionFields(model)) body.append(name, value)
  return body
}

function readResponse(status: number, text: string, offsetMs: number, host: string): TimedWord[] {
  if (status < 200 || status > 299) throw new RemoteError(kindForStatus(status), host, status)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new RemoteError('not-json', host, status)
  }
  return wordsFromResponse(body, offsetMs, host)
}

/**
 * Sends a WAV file to the transcription operation of the endpoint and returns the words with song times.
 * The app uses XMLHttpRequest, because `fetch` gives no upload progress and no sign of the end of the upload.
 * The request has an `Authorization` header only when the endpoint has an API key, and it goes to the base URL only.
 * @param endpoint The endpoint that the person typed.
 * @param wav The WAV file that `encodeWav` gives.
 * @param offsetMs The song time of the first sample of the file.
 * @param handlers The signal and the progress functions.
 * @param createXhr Makes the request object.
 * Rejects with RemoteError of kind 'too-large' before the upload when the file is above `MAX_UPLOAD_BYTES`.
 * Rejects with RemoteError for a failed call, and with TranscribeError of kind 'cancelled' when the signal aborts.
 */
export function postTranscription(
  endpoint: RemoteEndpoint,
  wav: Uint8Array<ArrayBuffer>,
  offsetMs: number,
  handlers: RemoteHandlers,
  createXhr: CreateXhr = () => new XMLHttpRequest(),
): Promise<TimedWord[]> {
  const host = endpointHost(endpoint.baseUrl)
  const { signal } = handlers
  if (signal.aborted) return Promise.reject(cancelled())
  if (wav.byteLength > MAX_UPLOAD_BYTES) return Promise.reject(new RemoteError('too-large', host))
  return new Promise((resolve, reject) => {
    const xhr = createXhr()
    const onAbort = () => {
      xhr.abort()
      reject(cancelled())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    const settle = () => signal.removeEventListener('abort', onAbort)
    // The upload handlers must exist before `open`, or some browsers send no upload event.
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) handlers.onUpload?.(event.loaded, event.total)
    }
    xhr.upload.onload = () => handlers.onWaiting?.()
    // The browser gives the same error for no connection and for a CORS refusal.
    xhr.onerror = () => {
      settle()
      reject(new RemoteError('network', host))
    }
    xhr.onload = () => {
      settle()
      try {
        resolve(readResponse(xhr.status, xhr.responseText, offsetMs, host))
      } catch (error) {
        reject(error)
      }
    }
    xhr.open('POST', transcriptionsUrl(endpoint.baseUrl))
    if (endpoint.apiKey !== '') xhr.setRequestHeader('Authorization', `Bearer ${endpoint.apiKey}`)
    xhr.send(formBody(endpoint.model, wav))
  })
}

/**
 * Sends one second of silence to the endpoint and resolves when the response has a `words` list.
 * The silence has no audio of the song.
 * @param endpoint The endpoint that the person typed.
 * @param signal Aborts the call.
 * @param createXhr Makes the request object.
 * Rejects as `postTranscription`.
 */
export async function testConnection(
  endpoint: RemoteEndpoint,
  signal: AbortSignal,
  createXhr?: CreateXhr,
): Promise<void> {
  const silence = encodeWav(new Float32Array(SPEECH_SAMPLE_RATE), SPEECH_SAMPLE_RATE)
  await postTranscription(endpoint, silence, 0, { signal }, createXhr)
}

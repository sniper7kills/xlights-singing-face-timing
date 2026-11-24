import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError } from '../../lib/remote/response.ts'
import { encodeWav, MAX_UPLOAD_BYTES } from '../../lib/remote/wav.ts'
import { FakeXhr, fakeCreateXhr } from './fakeXhr.test-helpers.ts'
import { postTranscription, testConnection } from './remoteClient.ts'
import { TranscribeError } from './transcribeClient.ts'

const KEY = 'sk-secret-key-123'
const WITH_KEY = { baseUrl: 'https://ai.example.com/v1', apiKey: KEY, model: 'whisper-1' }
const NO_KEY = {
  baseUrl: 'http://localhost:8000/v1',
  apiKey: '',
  model: 'Systran/faster-whisper-small',
}
const WAV = encodeWav(new Float32Array(16_000), 16_000)
const VERBOSE = { text: 'Silent night', words: [{ word: 'Silent', start: 0.1, end: 0.6 }] }

afterEach(() => {
  FakeXhr.reset()
})

function post(endpoint = WITH_KEY, signal = new AbortController().signal, offsetMs = 0) {
  const onUpload = vi.fn()
  const onWaiting = vi.fn()
  const result = postTranscription(
    endpoint,
    WAV,
    offsetMs,
    { signal, onUpload, onWaiting },
    fakeCreateXhr(),
  )
  return { result, onUpload, onWaiting }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('The call resolved.')
    },
    (error: unknown) => error,
  )
}

describe('postTranscription', () => {
  it('posts the WAV file and the fields to <base URL>/audio/transcriptions', async () => {
    const { result } = post()
    const xhr = FakeXhr.last()
    xhr.respond(200, VERBOSE)
    await result

    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('https://ai.example.com/v1/audio/transcriptions')
    const body = xhr.body
    expect(body?.get('model')).toBe('whisper-1')
    expect(body?.get('language')).toBe('en')
    expect(body?.get('response_format')).toBe('verbose_json')
    expect(body?.getAll('timestamp_granularities[]')).toEqual(['word'])
    const file = body?.get('file')
    expect(file).toBeInstanceOf(Blob)
    expect(file).toMatchObject({ name: 'audio.wav', type: 'audio/wav', size: WAV.byteLength })
  })

  it('sends the API key as a Bearer header when the endpoint has a key', async () => {
    const { result } = post()
    FakeXhr.last().respond(200, VERBOSE)
    await result
    expect(FakeXhr.last().headers).toEqual({ Authorization: `Bearer ${KEY}` })
  })

  it('sends no Authorization header when the endpoint has no key', async () => {
    const { result } = post(NO_KEY)
    FakeXhr.last().respond(200, VERBOSE)
    await result
    expect(FakeXhr.last().headers).toEqual({})
  })

  it('returns the words with song times, with the offset of the range added', async () => {
    const { result } = post(WITH_KEY, undefined, 60_000)
    FakeXhr.last().respond(200, VERBOSE)
    expect(await result).toEqual([{ text: 'Silent', startMs: 60_100, endMs: 60_600 }])
  })

  it('reports the upload progress and the end of the upload', async () => {
    const { result, onUpload, onWaiting } = post()
    const xhr = FakeXhr.last()
    xhr.upload.onprogress?.({ loaded: 0, total: 0, lengthComputable: false })
    xhr.uploadAll(2000)
    xhr.respond(200, VERBOSE)
    await result
    expect(onUpload.mock.calls).toEqual([
      [1000, 2000],
      [2000, 2000],
    ])
    expect(onWaiting).toHaveBeenCalledOnce()
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not-found'],
    [413, 'too-large'],
    [429, 'rate-limit'],
    [500, 'server'],
    [400, 'refused'],
  ] as const)('rejects HTTP %i with the kind %s', async (status, kind) => {
    const { result } = post()
    FakeXhr.last().respond(status, { error: { message: `bad key ${KEY}` } })
    const error = await rejection(result)
    expect(error).toBeInstanceOf(RemoteError)
    expect(error).toMatchObject({ kind, status, host: 'ai.example.com' })
  })

  it('rejects with network when the browser gives no response', async () => {
    const { result } = post()
    FakeXhr.last().fail()
    expect(await rejection(result)).toMatchObject({ kind: 'network', status: null })
  })

  it('rejects with not-json for a body that is not JSON', async () => {
    const { result } = post()
    FakeXhr.last().respond(200, '<html>Not here</html>')
    expect(await rejection(result)).toMatchObject({ kind: 'not-json' })
  })

  it('rejects with no-word-times for JSON with no words list', async () => {
    const { result } = post()
    FakeXhr.last().respond(200, { text: 'Silent night' })
    expect(await rejection(result)).toMatchObject({ kind: 'no-word-times' })
  })

  it('puts no part of the API key in the error of a failed call', async () => {
    for (const answer of [
      (xhr: FakeXhr) => xhr.respond(401, `invalid key ${KEY}`),
      (xhr: FakeXhr) => xhr.fail(),
      (xhr: FakeXhr) => xhr.respond(200, `not json ${KEY}`),
    ]) {
      const { result } = post()
      answer(FakeXhr.last())
      const error = await rejection(result)
      expect(error).toBeInstanceOf(RemoteError)
      const text = `${String(error)} ${JSON.stringify(error)} ${(error as Error).stack ?? ''}`
      expect(text).not.toContain(KEY)
    }
  })

  it('aborts the request and rejects as cancelled when the signal aborts', async () => {
    const controller = new AbortController()
    const { result } = post(WITH_KEY, controller.signal)
    controller.abort()
    const error = await rejection(result)
    expect(error).toBeInstanceOf(TranscribeError)
    expect(error).toMatchObject({ kind: 'cancelled' })
    expect(FakeXhr.last().aborted).toBe(true)
  })

  it('sends no request when the signal aborted before the call', async () => {
    const controller = new AbortController()
    controller.abort()
    const { result } = post(WITH_KEY, controller.signal)
    expect(await rejection(result)).toMatchObject({ kind: 'cancelled' })
    expect(FakeXhr.instances).toEqual([])
  })

  it('rejects with too-large and sends no request for a file above the limit', async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1)
    const result = postTranscription(
      WITH_KEY,
      big,
      0,
      { signal: new AbortController().signal },
      fakeCreateXhr(),
    )
    expect(await rejection(result)).toMatchObject({ kind: 'too-large', status: null })
    expect(FakeXhr.instances).toEqual([])
  })
})

describe('testConnection', () => {
  it('sends one second of silence and resolves for a response with a words list', async () => {
    FakeXhr.responder = (xhr) => xhr.respond(200, { text: '', words: [] })
    await testConnection(NO_KEY, new AbortController().signal, fakeCreateXhr())
    const file = FakeXhr.last().body?.get('file')
    expect(file).toMatchObject({ size: 44 + 32_000 })
  })

  it('rejects with the kind of the failure', async () => {
    FakeXhr.responder = (xhr) => xhr.respond(404, 'Not Found')
    const error = await rejection(
      testConnection(NO_KEY, new AbortController().signal, fakeCreateXhr()),
    )
    expect(error).toMatchObject({ kind: 'not-found', host: 'localhost:8000' })
  })
})

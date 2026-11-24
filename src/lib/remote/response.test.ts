import { describe, expect, it } from 'vitest'
import { kindForStatus, RemoteError, wordsFromResponse } from './response.ts'

describe('kindForStatus', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not-found'],
    [413, 'too-large'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
    [400, 'refused'],
    [422, 'refused'],
  ] as const)('returns the kind for HTTP %i', (status, kind) => {
    expect(kindForStatus(status)).toBe(kind)
  })
})

describe('RemoteError', () => {
  it('keeps the kind, the host and the status', () => {
    const error = new RemoteError('server', 'localhost:8000', 502)
    expect(error).toMatchObject({ kind: 'server', host: 'localhost:8000', status: 502 })
    expect(error.message).toBe('The remote run failed: server (HTTP 502).')
  })

  it('has a null status when the browser gave no response', () => {
    const error = new RemoteError('network', 'localhost:8000')
    expect(error.status).toBeNull()
    expect(error.message).toBe('The remote run failed: network.')
  })
})

describe('wordsFromResponse', () => {
  it('converts seconds to milliseconds of the song', () => {
    const body = {
      text: 'Silent night',
      words: [
        { word: 'Silent', start: 0.1, end: 2.3 },
        { word: ' night', start: 2.3, end: 4.25 },
      ],
    }
    expect(wordsFromResponse(body, 0, 'h')).toEqual([
      { text: 'Silent', startMs: 100, endMs: 2300 },
      { text: 'night', startMs: 2300, endMs: 4250 },
    ])
  })

  it('adds the start of the range to each word time', () => {
    const body = { words: [{ word: 'holy', start: 1.5, end: 2 }] }
    expect(wordsFromResponse(body, 60_000, 'h')).toEqual([
      { text: 'holy', startMs: 61_500, endMs: 62_000 },
    ])
  })

  it('drops a word with no start, no end or no text', () => {
    const body = {
      words: [
        { word: 'kept', start: 1, end: 2 },
        { word: 'no-end', start: 2, end: null },
        { word: 'no-start', end: 3 },
        { word: '  ', start: 3, end: 4 },
        { start: 4, end: 5 },
        'text',
        null,
      ],
    }
    expect(wordsFromResponse(body, 0, 'h')).toEqual([{ text: 'kept', startMs: 1000, endMs: 2000 }])
  })

  it('returns no word for an empty words list', () => {
    expect(wordsFromResponse({ text: '', words: [] }, 0, 'h')).toEqual([])
  })

  it('throws no-word-times when the response has no words list', () => {
    expect(() => wordsFromResponse({ text: 'Silent night' }, 0, 'localhost:8000')).toThrow(
      expect.objectContaining({ kind: 'no-word-times', host: 'localhost:8000' }),
    )
  })

  it('throws no-word-times for a body that is not an object', () => {
    expect(() => wordsFromResponse('Silent night', 0, 'h')).toThrow(RemoteError)
    expect(() => wordsFromResponse(null, 0, 'h')).toThrow(RemoteError)
  })
})

import { describe, expect, it } from 'vitest'
import {
  endpointHost,
  isMixedContent,
  parseBaseUrl,
  transcriptionFields,
  transcriptionsUrl,
} from './endpoint.ts'

describe('parseBaseUrl', () => {
  it('keeps a URL with /v1 as typed', () => {
    expect(parseBaseUrl('https://api.openai.com/v1')).toEqual({
      ok: true,
      baseUrl: 'https://api.openai.com/v1',
    })
  })

  it('keeps a URL with no /v1 as typed', () => {
    expect(parseBaseUrl('http://localhost:8000')).toEqual({
      ok: true,
      baseUrl: 'http://localhost:8000',
    })
  })

  it('removes the spaces and the trailing slashes', () => {
    expect(parseBaseUrl('  http://localhost:8000/v1// ')).toEqual({
      ok: true,
      baseUrl: 'http://localhost:8000/v1',
    })
  })

  it('returns empty for a field with no text', () => {
    expect(parseBaseUrl('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('returns invalid for text that is not a URL', () => {
    expect(parseBaseUrl('localhost:8000 v1')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('returns invalid for a scheme other than http or https', () => {
    expect(parseBaseUrl('ftp://example.com/v1')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('returns invalid for a URL with a query or a fragment', () => {
    expect(parseBaseUrl('https://example.com/v1?key=1')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseBaseUrl('https://example.com/v1#top')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('returns credentials for a URL with a user name and a password', () => {
    expect(parseBaseUrl('https://user:secret@example.com/v1')).toEqual({
      ok: false,
      reason: 'credentials',
    })
  })
})

describe('transcriptionsUrl', () => {
  it('adds /audio/transcriptions to the base URL', () => {
    expect(transcriptionsUrl('http://localhost:8000/v1')).toBe(
      'http://localhost:8000/v1/audio/transcriptions',
    )
  })
})

describe('endpointHost', () => {
  it('returns the host with its port', () => {
    expect(endpointHost('http://localhost:8000/v1')).toBe('localhost:8000')
  })

  it('returns the host with no default port', () => {
    expect(endpointHost('https://api.openai.com/v1')).toBe('api.openai.com')
  })
})

describe('isMixedContent', () => {
  it('blocks an http address on the local network from an https page', () => {
    expect(isMixedContent('https:', 'http://192.168.1.20:8000/v1')).toBe(true)
  })

  it('allows http to localhost and 127.0.0.1 from an https page', () => {
    expect(isMixedContent('https:', 'http://localhost:8000/v1')).toBe(false)
    expect(isMixedContent('https:', 'http://127.0.0.1:8000/v1')).toBe(false)
  })

  it('allows an https address from an https page', () => {
    expect(isMixedContent('https:', 'https://ai.example.com/v1')).toBe(false)
  })

  it('allows any http address from an http page', () => {
    expect(isMixedContent('http:', 'http://192.168.1.20:8000/v1')).toBe(false)
  })
})

describe('transcriptionFields', () => {
  it('asks for verbose_json with word times in English', () => {
    expect(transcriptionFields('whisper-1')).toEqual([
      ['model', 'whisper-1'],
      ['language', 'en'],
      ['response_format', 'verbose_json'],
      ['timestamp_granularities[]', 'word'],
    ])
  })
})

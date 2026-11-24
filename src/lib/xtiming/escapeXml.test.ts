import { describe, expect, it } from 'vitest'
import { escapeXml } from './escapeXml.ts'

describe('escapeXml', () => {
  it('replaces each of the five XML special characters with its standard entity', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;')
  })

  it('escapes an ampersand in text that already looks like an entity', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;')
  })

  it('keeps non-ASCII text unchanged', () => {
    expect(escapeXml('café')).toBe('café')
  })
})

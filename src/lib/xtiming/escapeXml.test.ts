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
    expect(escapeXml('café 🎄')).toBe('café 🎄')
  })

  it('removes the control characters U+0001 and U+0008 from a label', () => {
    expect(escapeXml('Jin\u0001gle\u0008 bells')).toBe('Jingle bells')
  })

  it('removes U+0000, U+001F, U+FFFE, U+FFFF and a lone surrogate', () => {
    expect(escapeXml('a\u0000b\u001Fc\uFFFEd\uFFFFe\uD800f\uDC00g')).toBe('abcdefg')
  })

  it('writes a tab, a line feed and a carriage return as numeric references', () => {
    expect(escapeXml('a\tb\nc\rd')).toBe('a&#9;b&#10;c&#13;d')
  })

  it('gives a label with a tab and a newline that an XML parser reads back as the same text', () => {
    const label = 'Jingle\tbells\njingle & all'
    const xml = `<Effect label="${escapeXml(label)}" />`

    const document = new DOMParser().parseFromString(xml, 'application/xml')

    expect(document.querySelector('parsererror')).toBeNull()
    expect(document.documentElement.getAttribute('label')).toBe(label)
  })
})

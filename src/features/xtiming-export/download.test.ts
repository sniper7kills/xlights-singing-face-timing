import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadFiles } from './download.ts'

const blobs: Blob[] = []
const clicked: { href: string; download: string; connected: boolean }[] = []

beforeEach(() => {
  vi.useFakeTimers()
  blobs.length = 0
  clicked.length = 0
  // jsdom has no object URL support, so the test gives each Blob a numbered URL.
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob)
    return `blob:test/${blobs.length}`
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download, connected: this.isConnected })
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('downloadFiles', () => {
  it('gives each file to the browser as a download with its file name', () => {
    downloadFiles([
      { name: 'Carol - Lead Vocals.xtiming', text: '<a/>\n' },
      { name: 'Carol - Santa.xtiming', text: '<b/>\n' },
    ])

    expect(clicked).toEqual([
      { href: 'blob:test/1', download: 'Carol - Lead Vocals.xtiming', connected: true },
      { href: 'blob:test/2', download: 'Carol - Santa.xtiming', connected: true },
    ])
  })

  it('writes the text as UTF-8 XML with the line ends unchanged', async () => {
    downloadFiles([{ name: 'Carol.xtiming', text: '<x label="café"/>\n' }])

    const blob = blobs[0]
    expect(blob?.type).toBe('application/xml;charset=utf-8')
    const bytes = new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0))
    // jsdom and Node create Uint8Array objects in different realms, so the test compares plain arrays.
    expect([...bytes]).toEqual([...new TextEncoder().encode('<x label="café"/>\n')])
  })

  it('keeps each object URL for 30 seconds, so that a large file can finish', () => {
    downloadFiles([{ name: 'Carol.xtiming', text: '' }])

    vi.advanceTimersByTime(29_999)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1')
  })

  it('has the anchor in the document at the click and removes it after the click', () => {
    downloadFiles([{ name: 'Carol.xtiming', text: '' }])

    expect(clicked).toEqual([{ href: 'blob:test/1', download: 'Carol.xtiming', connected: true }])
    expect(document.querySelector('a')).toBeNull()
  })
})

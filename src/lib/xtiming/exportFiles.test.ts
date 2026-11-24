import { describe, expect, it } from 'vitest'
import { exportFiles } from './exportFiles.ts'
import type { ExportTrack } from './types.ts'

function makeTrack(name: string): ExportTrack {
  return { name, key: name, layers: [[{ label: 'Noel', startMs: 0, endMs: 500 }], [], []] }
}

describe('exportFiles', () => {
  it('writes all timing tracks into one file named after the song', () => {
    const files = exportFiles([makeTrack('Lead'), makeTrack('Santa')], 'Carol: Live', 'one-file')

    expect(files).toHaveLength(1)
    expect(files[0]?.name).toBe('Carol_ Live.xtiming')
    expect(files[0]?.text).toContain('<timings>')
    expect(files[0]?.text).toContain('<timing name="Santa" subType="" SourceVersion="2024.01">')
  })

  it('writes one file for each timing track named after the song and the timing track', () => {
    const files = exportFiles([makeTrack('Lead'), makeTrack('Santa')], 'Carol', 'file-per-track')

    expect(files.map((file) => file.name)).toEqual([
      'Carol - Lead.xtiming',
      'Carol - Santa.xtiming',
    ])
    expect(files[1]?.text.split('\n')[1]).toBe(
      '<timing name="Santa" subType="" SourceVersion="2024.01">',
    )
  })

  it('gives no file when the export has no timing track', () => {
    expect(exportFiles([], 'Carol', 'one-file')).toEqual([])
  })
})

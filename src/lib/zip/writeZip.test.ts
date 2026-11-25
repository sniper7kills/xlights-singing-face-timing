import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crc32 } from './crc32.ts'
import { writeZip, zipLength, ZipLimitError, type ZipEntry } from './writeZip.ts'

// The test builds the date from local parts, because a zip file holds the local date and time.
const MODIFIED = new Date(2026, 10, 24, 12, 30, 10)
const encoder = new TextEncoder()

function entry(name: string, text: string, modified = MODIFIED): ZipEntry {
  return { name, data: encoder.encode(text), modified }
}

function bytesOf(parts: readonly Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

// unzip prints a UTF-8 name as UTF-8 only under a UTF-8 locale.
const UTF8_ENV = { ...process.env, LC_ALL: 'C.UTF-8' }

function hasTool(tool: string): boolean {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('crc32', () => {
  it('gives 0xCBF43926 for the check text "123456789"', () => {
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926)
  })

  it('gives 0 for no bytes', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('gives 0xD8932AAC for "hi"', () => {
    expect(crc32(encoder.encode('hi'))).toBe(0xd8932aac)
  })
})

describe('writeZip', () => {
  it('writes the golden bytes for one stored entry', () => {
    // The golden bytes come from Python struct.pack with the APPNOTE field layout, not from this writer.
    const golden =
      '504b0304140000080000c563785dac2a93d8020000000200000005000000612e7478746869' +
      '504b01021403140000080000c563785dac2a93d80200000002000000050000000000000000000000a48100000000612e747874' +
      '504b0506000000000100010033000000250000000000'

    expect(hex(bytesOf(writeZip([entry('a.txt', 'hi')])))).toBe(golden)
  })

  it('writes a UTF-8 name with the language encoding flag', () => {
    const bytes = bytesOf(writeZip([entry('timing/Noël – 雪.xtiming', 'x')]))
    const view = new DataView(bytes.buffer)
    const name = encoder.encode('timing/Noël – 雪.xtiming')

    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800)
    expect(view.getUint16(26, true)).toBe(name.length)
    expect(hex(bytes.slice(30, 30 + name.length))).toBe(hex(name))
  })

  it('writes an empty file with the size 0 and the CRC 0', () => {
    const bytes = bytesOf(writeZip([entry('empty.txt', '')]))
    const view = new DataView(bytes.buffer)

    expect(view.getUint32(14, true)).toBe(0)
    expect(view.getUint32(18, true)).toBe(0)
    expect(view.getUint32(22, true)).toBe(0)
  })

  it('writes two entries with the offset of each local header in the central directory', () => {
    const bytes = bytesOf(writeZip([entry('a.txt', 'hi'), entry('b/c.txt', 'hello')]))
    const view = new DataView(bytes.buffer)
    const end = bytes.length - 22
    const centralOffset = view.getUint32(end + 16, true)

    expect(view.getUint16(end + 10, true)).toBe(2)
    expect(view.getUint32(centralOffset + 42, true)).toBe(0)
    const second = centralOffset + 46 + 'a.txt'.length
    expect(view.getUint32(second + 42, true)).toBe(30 + 5 + 2)
    expect(view.getUint32(37, true)).toBe(0x04034b50)
  })

  it('refers to the bytes of each entry without a copy', () => {
    const data = encoder.encode('audio')

    expect(writeZip([{ name: 'a', data, modified: MODIFIED }])[1]).toBe(data)
  })

  it('writes 1980-01-01 00:00 for a date before 1980', () => {
    const bytes = bytesOf(writeZip([entry('a', '', new Date(1970, 0, 1))]))
    const view = new DataView(bytes.buffer)

    expect(view.getUint16(10, true)).toBe(0)
    expect(view.getUint16(12, true)).toBe((1 << 5) | 1)
  })

  it('throws ZipLimitError for more than 65 534 entries', () => {
    const entries = Array.from({ length: 65_535 }, () => entry('a', ''))

    expect(() => writeZip(entries)).toThrow(ZipLimitError)
  })

  it('throws ZipLimitError with the message of the feature file for a file of 4 GB', () => {
    // A view with a false length stands in for 4 GB, so the test does not allocate the bytes.
    const data = new Uint8Array(1)
    Object.defineProperty(data, 'length', { value: 0xffffffff })

    expect(() => writeZip([{ name: 'a', data, modified: MODIFIED }])).toThrow(
      'The song is too large for one zip file. Download the files one at a time.',
    )
  })

  it('throws ZipLimitError when the offsets pass 4 GB', () => {
    const data = new Uint8Array(1)
    Object.defineProperty(data, 'length', { value: 0xfffffff0 })

    expect(() =>
      writeZip([
        { name: 'a', data, modified: MODIFIED },
        { name: 'b', data, modified: MODIFIED },
      ]),
    ).toThrow(ZipLimitError)
  })
})

describe('zipLength', () => {
  it('gives the length of the bytes that writeZip writes', () => {
    const entries = [entry('a.txt', 'hi'), entry('timing/Noël.xtiming', 'hello')]
    const length = bytesOf(writeZip(entries)).length

    expect(zipLength(entries.map((e) => ({ name: e.name, size: e.data.length })))).toBe(length)
  })
})

describe('writeZip with the unzip tool', () => {
  const unzip = hasTool('unzip')

  // CI runs on ubuntu-latest, which has unzip. Without the tool, the test states the reason and skips.
  it.skipIf(!unzip)(
    'gives a file that `unzip -t` reports with no error (skips with no unzip on PATH)',
    () => {
      const folder = mkdtempSync(join(tmpdir(), 'zip-test-'))
      try {
        const file = join(folder, 'test.zip')
        const entries = [
          entry('timing/Carol.xtiming', '<?xml version="1.0" encoding="UTF-8"?>\n'),
          entry('audio/Noël.ogg', 'audio bytes'),
          entry('empty.txt', ''),
          entry('README.txt', 'read me\n'),
        ]
        writeFileSync(file, bytesOf(writeZip(entries)))

        const test = execFileSync('unzip', ['-t', file], { encoding: 'utf8', env: UTF8_ENV })
        const list = execFileSync('unzip', ['-Z', '-1', file], { encoding: 'utf8', env: UTF8_ENV })

        expect(test).toContain('No errors detected')
        expect(list.trim().split('\n')).toEqual(entries.map((e) => e.name))
        execFileSync('unzip', ['-q', file, '-d', join(folder, 'out')], { env: UTF8_ENV })
        expect(readFileSync(join(folder, 'out', 'audio', 'Noël.ogg'), 'utf8')).toBe('audio bytes')
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    },
  )
})

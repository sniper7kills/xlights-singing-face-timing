// The field layout follows the PKWARE APPNOTE, version 6.3.10:
// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT (retrieved 2026-11-24).
import { crc32 } from './crc32.ts'

/** One file in a zip file. */
export interface ZipEntry {
  /** The path in the zip file. A `/` separates the folders. `entryPath` gives a legal path. */
  name: string
  /** The bytes of the file. The zip file holds them with no compression. */
  data: Uint8Array<ArrayBuffer>
  /** The last change of the file. The zip file holds the local date and time to 2 seconds. */
  modified: Date
}

/** The error of `writeZip` when the zip file needs ZIP64, which the writer does not write. */
export class ZipLimitError extends Error {
  constructor() {
    super('The song is too large for one zip file. Download the files one at a time.')
    this.name = 'ZipLimitError'
  }
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_SIGNATURE = 0x06054b50
const LOCAL_HEADER_LENGTH = 30
const CENTRAL_HEADER_LENGTH = 46
const END_LENGTH = 22
// Section 4.4.3: version 2.0. Most tools refuse an entry that needs a higher version than they know.
const VERSION = 20
// Section 4.4.2: the upper byte 3 is UNIX. Info-ZIP converts the names of an MS-DOS entry from a code page.
const MADE_BY = (3 << 8) | VERSION
// Section 4.4.15: for UNIX, the upper 16 bits hold the file mode, here a normal file that all can read (0o100644).
const FILE_ATTRIBUTES = 0o100644 * 0x10000
// Section 4.4.4: bit 11 states that the file name is UTF-8.
const UTF8_FLAG = 0x0800
// Section 4.4.5: method 0 stores the file with no compression.
const STORED = 0
// Section 4.4.1.4: the value 0xFFFF or 0xFFFFFFFF in a field means that a ZIP64 record has the value.
const MAX_COUNT = 0xfffe
const MAX_LENGTH = 0xfffffffe
const MAX_NAME_LENGTH = 0xffff

const encoder = new TextEncoder()

// Section 4.4.6: the MS-DOS format counts years from 1980 and seconds in steps of 2.
function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107)
  if (year !== date.getFullYear()) {
    return { time: 0, day: ((year - 1980) << 9) | (1 << 5) | 1 }
  }
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

interface EntryFields {
  name: Uint8Array
  crc: number
  size: number
  time: number
  day: number
  offset: number
}

// Section 4.3.7 (local file header) and section 4.3.12 (central directory header) share these fields.
function writeCommonFields(view: DataView, at: number, fields: EntryFields): void {
  view.setUint16(at, VERSION, true)
  view.setUint16(at + 2, UTF8_FLAG, true)
  view.setUint16(at + 4, STORED, true)
  view.setUint16(at + 6, fields.time, true)
  view.setUint16(at + 8, fields.day, true)
  view.setUint32(at + 10, fields.crc, true)
  view.setUint32(at + 14, fields.size, true)
  view.setUint32(at + 18, fields.size, true)
  view.setUint16(at + 22, fields.name.length, true)
}

function localHeader(fields: EntryFields): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(LOCAL_HEADER_LENGTH + fields.name.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, LOCAL_HEADER_SIGNATURE, true)
  writeCommonFields(view, 4, fields)
  bytes.set(fields.name, LOCAL_HEADER_LENGTH)
  return bytes
}

function writeCentralHeader(view: DataView, at: number, fields: EntryFields): void {
  view.setUint32(at, CENTRAL_HEADER_SIGNATURE, true)
  view.setUint16(at + 4, MADE_BY, true)
  writeCommonFields(view, at + 6, fields)
  view.setUint32(at + 38, FILE_ATTRIBUTES, true)
  view.setUint32(at + 42, fields.offset, true)
  new Uint8Array(view.buffer).set(fields.name, at + CENTRAL_HEADER_LENGTH)
}

// Section 4.3.16: the end of central directory record.
function writeEnd(view: DataView, at: number, count: number, size: number, offset: number): void {
  view.setUint32(at, END_SIGNATURE, true)
  view.setUint16(at + 8, count, true)
  view.setUint16(at + 10, count, true)
  view.setUint32(at + 12, size, true)
  view.setUint32(at + 16, offset, true)
}

function centralDirectory(
  entries: readonly EntryFields[],
  offset: number,
): Uint8Array<ArrayBuffer> {
  const size = entries.reduce((sum, entry) => sum + CENTRAL_HEADER_LENGTH + entry.name.length, 0)
  if (size + END_LENGTH > MAX_LENGTH) throw new ZipLimitError()
  const bytes = new Uint8Array(size + END_LENGTH)
  const view = new DataView(bytes.buffer)
  let at = 0
  for (const entry of entries) {
    writeCentralHeader(view, at, entry)
    at += CENTRAL_HEADER_LENGTH + entry.name.length
  }
  writeEnd(view, at, entries.length, size, offset)
  return bytes
}

/**
 * Returns the parts of a zip file with the entries in the order of the list.
 * Each entry is stored with no compression, a CRC-32 and a UTF-8 file name.
 * The parts refer to the bytes of each entry and do not copy them, so a `Blob` of the parts is the only copy.
 * @param entries The files of the zip file. `entryPath` and `uniquePathMaker` give legal and unique names.
 * Throws `ZipLimitError` for more than 65 534 entries, or a file, an offset or a size that needs ZIP64.
 */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer>[] {
  if (entries.length > MAX_COUNT) throw new ZipLimitError()
  const parts: Uint8Array<ArrayBuffer>[] = []
  const fields: EntryFields[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    if (name.length > MAX_NAME_LENGTH || entry.data.length > MAX_LENGTH) throw new ZipLimitError()
    const entryFields = {
      name,
      crc: crc32(entry.data),
      size: entry.data.length,
      offset,
      ...dosDateTime(entry.modified),
    }
    fields.push(entryFields)
    parts.push(localHeader(entryFields), entry.data)
    offset += LOCAL_HEADER_LENGTH + name.length + entry.data.length
    if (offset > MAX_LENGTH) throw new ZipLimitError()
  }
  parts.push(centralDirectory(fields, offset))
  return parts
}

/**
 * Returns the length in bytes of the zip file that `writeZip` writes for the entries.
 * @param entries The path of each entry and the length of its bytes.
 */
export function zipLength(entries: readonly { name: string; size: number }[]): number {
  return entries.reduce((sum, entry) => {
    const nameLength = encoder.encode(entry.name).length
    return sum + LOCAL_HEADER_LENGTH + CENTRAL_HEADER_LENGTH + 2 * nameLength + entry.size
  }, END_LENGTH)
}

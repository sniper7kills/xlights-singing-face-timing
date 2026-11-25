// APPNOTE 6.3.10, section 4.4.7: the CRC-32 of a zip file uses the reflected polynomial 0xEDB88320.
const POLYNOMIAL = 0xedb88320

const TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? (value >>> 1) ^ POLYNOMIAL : value >>> 1
  }
  return value >>> 0
})

/**
 * Returns the CRC-32 of the bytes as an unsigned 32-bit number, as a zip file holds it.
 * @param data The bytes.
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

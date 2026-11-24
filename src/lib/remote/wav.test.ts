import { describe, expect, it } from 'vitest'
import { encodeWav, MAX_UPLOAD_BYTES, WAV_HEADER_BYTES, wavByteLength } from './wav.ts'

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

describe('encodeWav', () => {
  it('writes the RIFF header of 16-bit PCM with one channel', () => {
    const bytes = encodeWav(new Float32Array(10), 16_000)
    const view = new DataView(bytes.buffer)
    expect(text(bytes, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + 20)
    expect(text(bytes, 8, 4)).toBe('WAVE')
    expect(text(bytes, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint32(28, true)).toBe(32_000)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(text(bytes, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(20)
  })

  it('writes two bytes for each sample after the header', () => {
    expect(encodeWav(new Float32Array(16_000), 16_000).byteLength).toBe(WAV_HEADER_BYTES + 32_000)
    expect(wavByteLength(16_000)).toBe(WAV_HEADER_BYTES + 32_000)
  })

  it('converts the samples to 16-bit values and clamps a value outside -1 to 1', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 0.5, 2, -2]), 16_000)
    const view = new DataView(bytes.buffer)
    const values = [0, 1, 2, 3, 4, 5].map((i) => view.getInt16(WAV_HEADER_BYTES + i * 2, true))
    expect(values).toEqual([0, 32767, -32767, 16384, 32767, -32767])
  })
})

describe('MAX_UPLOAD_BYTES', () => {
  it('allows about 13 minutes of 16 kHz audio', () => {
    expect(wavByteLength(13 * 60 * 16_000)).toBeLessThan(MAX_UPLOAD_BYTES)
    expect(wavByteLength(14 * 60 * 16_000)).toBeGreaterThan(MAX_UPLOAD_BYTES)
  })
})

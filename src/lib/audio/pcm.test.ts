import { describe, expect, it } from 'vitest'
import {
  floatToPcm16,
  KEPT_TRACK_SAMPLE_RATE,
  keptTracksBytes,
  pcm16Bytes,
  pcm16ToFloat,
  pcm16Wav,
  trackToWav,
  WAV_HEADER_BYTES,
} from './pcm.ts'

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

describe('floatToPcm16', () => {
  it('rounds each sample to the nearest 16-bit value', () => {
    expect([...floatToPcm16(new Float32Array([0, 0.5, -0.5, 1 / 32767, 0.4 / 32767]))]).toEqual([
      0, 16384, -16383, 1, 0,
    ])
  })

  it('clips a sample outside -1 to 1 to the largest value', () => {
    expect([...floatToPcm16(new Float32Array([1, -1, 1.5, -7, Infinity, -Infinity]))]).toEqual([
      32767, -32767, 32767, -32767, 32767, -32767,
    ])
  })

  it('writes 0 for a sample that is not a number', () => {
    expect([...floatToPcm16(new Float32Array([NaN]))]).toEqual([0])
  })

  it('keeps the count of samples', () => {
    expect(floatToPcm16(new Float32Array(22_050)).length).toBe(22_050)
    expect(floatToPcm16(new Float32Array(0)).length).toBe(0)
  })
})

describe('pcm16ToFloat', () => {
  it('gives back each sample within one step of 16-bit PCM', () => {
    const samples = new Float32Array([0, 0.25, -0.75, 1, -1, 0.123456])
    const back = pcm16ToFloat(floatToPcm16(samples))
    expect(back.length).toBe(samples.length)
    back.forEach((value, index) => expect(value).toBeCloseTo(samples[index] ?? 0, 4))
  })
})

describe('pcm16Bytes', () => {
  it('gives about 2.6 MB for one minute at 22 050 Hz', () => {
    expect(pcm16Bytes(60_000, 22_050)).toBe(2_646_000)
  })

  it('rounds the count of samples', () => {
    expect(pcm16Bytes(1, 22_050)).toBe(44)
  })
})

describe('keptTracksBytes', () => {
  it('counts two tracks of 16-bit samples at 22 050 Hz', () => {
    expect(KEPT_TRACK_SAMPLE_RATE).toBe(22_050)
    expect(keptTracksBytes(60_000)).toBe(5_292_000)
  })
})

describe('pcm16Wav', () => {
  it('writes the RIFF header of 16-bit PCM with one channel', () => {
    const bytes = pcm16Wav(new Int16Array(10), 22_050)
    const view = new DataView(bytes.buffer)
    expect(text(bytes, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + 20)
    expect(text(bytes, 8, 4)).toBe('WAVE')
    expect(text(bytes, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(22_050)
    expect(view.getUint32(28, true)).toBe(44_100)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(text(bytes, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(20)
  })

  it('writes each sample little-endian after the header', () => {
    const bytes = pcm16Wav(new Int16Array([1, -2, 32767]), 22_050)
    expect(bytes.byteLength).toBe(WAV_HEADER_BYTES + 6)
    expect([...bytes.subarray(WAV_HEADER_BYTES)]).toEqual([1, 0, 0xfe, 0xff, 0xff, 0x7f])
  })
})

describe('trackToWav', () => {
  it('writes the samples of the track at the sample rate of the track', () => {
    const track = { startMs: 5000, sampleRate: 22_050, samples: new Int16Array([5, 6]) }
    const bytes = trackToWav(track)
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(24, true)).toBe(22_050)
    expect(view.getUint32(40, true)).toBe(4)
    expect(view.getInt16(WAV_HEADER_BYTES, true)).toBe(5)
    expect(view.getInt16(WAV_HEADER_BYTES + 2, true)).toBe(6)
  })
})

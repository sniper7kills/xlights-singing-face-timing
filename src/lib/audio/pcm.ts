/**
 * One kept audio track: one channel of 16-bit PCM samples.
 * 16-bit PCM needs no codec, so every browser reads it back with no decode step.
 */
export type PcmTrack = {
  /** The song time of the first sample, in milliseconds. A range run gives the start of the range. */
  startMs: number
  /** The samples for each second. */
  sampleRate: number
  /** Each sample from -32767 to 32767. */
  samples: Int16Array<ArrayBuffer>
}

/** The bytes of the WAV header that `pcm16Wav` writes. */
export const WAV_HEADER_BYTES = 44

/** The largest value of a 16-bit sample that the conversion writes. -32768 is not used, so 1 and -1 give the same size. */
const PCM_MAX = 0x7fff

/**
 * Returns the samples as 16-bit PCM values.
 * @param samples One channel, each sample from -1 to 1. A value outside the range is clipped. A value that is not a number gives 0.
 */
export function floatToPcm16(samples: Float32Array): Int16Array<ArrayBuffer> {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] ?? 0
    // Int16Array stores NaN as 0, and the clip keeps a large value from wrapping to the other sign.
    pcm[index] = Math.round(Math.max(-1, Math.min(1, value)) * PCM_MAX)
  }
  return pcm
}

/** Returns 16-bit PCM values as samples from -1 to 1. */
export function pcm16ToFloat(samples: Int16Array): Float32Array<ArrayBuffer> {
  const floats = new Float32Array(samples.length)
  for (let index = 0; index < samples.length; index += 1)
    floats[index] = (samples[index] ?? 0) / PCM_MAX
  return floats
}

/** Returns the bytes that a 16-bit track of one channel uses: two bytes for each sample. */
export function pcm16Bytes(durationMs: number, sampleRate: number): number {
  return Math.round((durationMs / 1000) * sampleRate) * 2
}

/**
 * The sample rate of a kept audio track: half of 44 100 Hz.
 * It keeps the frequencies up to 11 kHz, enough to see a waveform and to hear a track during an edit, at half the bytes.
 */
export const KEPT_TRACK_SAMPLE_RATE = 22_050

/** Returns the bytes that the two kept audio tracks of a run use: the vocals and the instruments, 16-bit PCM, one channel each. */
export function keptTracksBytes(durationMs: number): number {
  return 2 * pcm16Bytes(durationMs, KEPT_TRACK_SAMPLE_RATE)
}

function writeText(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
}

/**
 * Returns a WAV file with one channel of 16-bit PCM samples.
 * @param samples The 16-bit values.
 * @param sampleRate The sample rate in hertz.
 */
export function pcm16Wav(samples: Int16Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * 2
  const bytes = new Uint8Array(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(bytes.buffer)
  writeText(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeText(view, 8, 'WAVE')
  writeText(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  // WAV stores each sample little-endian, so a DataView write is correct on each processor.
  for (let i = 0; i < samples.length; i += 1)
    view.setInt16(WAV_HEADER_BYTES + i * 2, samples[i] ?? 0, true)
  return bytes
}

/** Returns a kept audio track as a WAV file at the sample rate of the track. */
export function trackToWav(track: PcmTrack): Uint8Array<ArrayBuffer> {
  return pcm16Wav(track.samples, track.sampleRate)
}

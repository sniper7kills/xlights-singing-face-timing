/** The bytes of the WAV header that `encodeWav` writes. */
export const WAV_HEADER_BYTES = 44

/**
 * The largest file that the app sends to a remote endpoint, in bytes.
 * The OpenAI speech-to-text guide states "Files can be up to 25 MB."
 * The app reads MB as 1 000 000 bytes, so the file stays below the limit with either reading.
 */
export const MAX_UPLOAD_BYTES = 25_000_000

/** Returns the size of the WAV file that `encodeWav` writes for a number of samples. */
export function wavByteLength(sampleCount: number): number {
  return WAV_HEADER_BYTES + sampleCount * 2
}

function writeText(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
}

/**
 * Returns a WAV file with one channel of 16-bit PCM samples.
 * The OpenAI transcription API accepts `wav`, and a 16 kHz mono file is about 1.9 MB for each minute.
 * @param samples One channel, each sample from -1 to 1. A value outside the range is clamped.
 * @param sampleRate The sample rate in hertz.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
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
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(WAV_HEADER_BYTES + i * 2, Math.round(value * 0x7fff), true)
  }
  return bytes
}

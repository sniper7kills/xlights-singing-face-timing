import { floatToPcm16, pcm16Wav, WAV_HEADER_BYTES } from '../audio/pcm.ts'

export { WAV_HEADER_BYTES }

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

/**
 * Returns a WAV file with one channel of 16-bit PCM samples.
 * The OpenAI transcription API accepts `wav`, and a 16 kHz mono file is about 1.9 MB for each minute.
 * @param samples One channel, each sample from -1 to 1. A value outside the range is clamped.
 * @param sampleRate The sample rate in hertz.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  return pcm16Wav(floatToPcm16(samples), sampleRate)
}

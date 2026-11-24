/** Returns the decoded audio at `sampleRate`. Rejects if the browser cannot decode the bytes. */
export type DecodeAt = (bytes: ArrayBuffer, sampleRate: number) => Promise<AudioBuffer>

/**
 * Returns the audio of the bytes, decoded with Web Audio `decodeAudioData` and resampled to `sampleRate`.
 * An `OfflineAudioContext` plays no sound, so the autoplay policy of the browser does not apply to the decode.
 * The decoded audio keeps the channels of the file. The context only sets the sample rate.
 * @param bytes The bytes of the audio file. The decode detaches the buffer.
 * @param sampleRate The sample rate of the result, from 3000 to 768 000 Hz.
 * Rejects if the browser cannot decode the bytes.
 */
export function decodeAudio(bytes: ArrayBuffer, sampleRate: number): Promise<AudioBuffer> {
  return new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(bytes)
}

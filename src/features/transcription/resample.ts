import { mixChannels } from '../timeline-editor/mixChannels.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'

/** A part of the song in milliseconds. */
export type TimeRange = { startMs: number; endMs: number }

/** The part of `AudioContext` that the resample reads. */
type DecodeContext = {
  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer>
  close(): Promise<void>
}

/**
 * Returns one channel of the audio at the speech model sample rate, for the full song or one range.
 * `decodeAudioData` resamples the audio to the sample rate of its context, so the context sets the rate.
 * @param audio The stored audio file.
 * @param range The part of the song to return. Without a range, the function returns the full song.
 * @param createContext Makes the decode context. Tests replace it.
 * Rejects when the browser cannot decode the audio.
 */
export async function resampleForSpeech(
  audio: Blob,
  range?: TimeRange,
  createContext: () => DecodeContext = () => new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE }),
): Promise<Float32Array> {
  const bytes = await audio.arrayBuffer()
  const context = createContext()
  try {
    const decoded = await context.decodeAudioData(bytes)
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) =>
      decoded.getChannelData(channel),
    )
    const mono = mixChannels(channels)
    if (range === undefined) return mono
    const toSample = (ms: number) => Math.round((ms / 1000) * SPEECH_SAMPLE_RATE)
    return mono.slice(toSample(range.startMs), toSample(range.endMs))
  } finally {
    // Browsers limit the number of open audio contexts.
    void context.close()
  }
}

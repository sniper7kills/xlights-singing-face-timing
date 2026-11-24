import type { TimeRange } from '../../lib/time/timeRange.ts'
import { decodeAudio, type DecodeAt } from '../audio-import/decodeAudio.ts'
import { mixChannels } from '../timeline-editor/mixChannels.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'

/**
 * Returns one channel of the audio at the speech model sample rate, for the full song or one range.
 * `decodeAudioData` resamples the audio to the sample rate of its context, so the context sets the rate.
 * @param audio The stored audio file.
 * @param range The part of the song to return. Without a range, the function returns the full song.
 * @param decode The decode step. Tests replace it.
 * Rejects when the browser cannot decode the audio.
 */
export async function resampleForSpeech(
  audio: Blob,
  range?: TimeRange,
  decode: DecodeAt = decodeAudio,
): Promise<Float32Array> {
  const decoded = await decode(await audio.arrayBuffer(), SPEECH_SAMPLE_RATE)
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) =>
    decoded.getChannelData(channel),
  )
  const mono = mixChannels(channels)
  if (range === undefined) return mono
  const toSample = (ms: number) => Math.round((ms / 1000) * SPEECH_SAMPLE_RATE)
  return mono.slice(toSample(range.startMs), toSample(range.endMs))
}

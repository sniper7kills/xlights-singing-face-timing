import type { TimeRange } from '../../lib/time/timeRange.ts'
import { decodeAudio, type DecodeAt } from '../audio-import/decodeAudio.ts'
import { SPEECH_SAMPLE_RATE } from '../transcription/protocol.ts'
import type { StereoAudio } from './protocol.ts'

/** The sample rate of the audio that the vocal separation reads and returns. */
export const SEPARATION_SAMPLE_RATE = 44_100

/**
 * Returns two channels of the audio at 44 100 Hz, for the full song or one range.
 * A mono file gives two equal channels. A file with more than two channels gives its first two channels.
 * Each channel is a copy, so the client can transfer it to the worker.
 * @param audio The stored audio file.
 * @param range The part of the song to return. A range run separates only the range, so the step does less work.
 * @param decode The decode step. Tests replace it.
 * Rejects when the browser cannot decode the audio.
 */
export async function decodeStereo(
  audio: Blob,
  range?: TimeRange,
  decode: DecodeAt = decodeAudio,
): Promise<StereoAudio> {
  const decoded = await decode(await audio.arrayBuffer(), SEPARATION_SAMPLE_RATE)
  const toSample = (ms: number) => Math.round((ms / 1000) * SEPARATION_SAMPLE_RATE)
  const start = range === undefined ? 0 : toSample(range.startMs)
  const end = range === undefined ? decoded.length : toSample(range.endMs)
  const left = decoded.getChannelData(0)
  const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left
  return { left: left.slice(start, end), right: right.slice(start, end), sampleRate: 44100 }
}

/** The part of `OfflineAudioContext` that the resample uses. Tests supply a stub. */
export type ResampleContext = Pick<
  OfflineAudioContext,
  'createBuffer' | 'createBufferSource' | 'destination' | 'startRendering'
>

/** Makes an offline context with one channel. */
export type CreateResampleContext = (length: number, sampleRate: number) => ResampleContext

const createOfflineContext: CreateResampleContext = (length, sampleRate) =>
  new OfflineAudioContext(1, length, sampleRate)

/**
 * Returns the vocals at the speech model sample rate, so the transcribe step gets the same kind of samples as with no separation.
 * An `OfflineAudioContext` at 16 000 Hz plays a buffer at 44 100 Hz, and the browser resamples it. The context plays no sound.
 * @param vocals One channel at 44 100 Hz.
 * @param createContext Makes the offline context. Tests replace it.
 * Rejects when the browser cannot render the audio.
 */
export async function vocalsForSpeech(
  vocals: Float32Array,
  createContext: CreateResampleContext = createOfflineContext,
): Promise<Float32Array> {
  // An offline context needs one frame or more.
  const length = Math.max(
    1,
    Math.round((vocals.length * SPEECH_SAMPLE_RATE) / SEPARATION_SAMPLE_RATE),
  )
  const context = createContext(length, SPEECH_SAMPLE_RATE)
  const buffer = context.createBuffer(1, Math.max(1, vocals.length), SEPARATION_SAMPLE_RATE)
  // `copyToChannel` accepts no array on a `SharedArrayBuffer`, and the type of the vocals allows one.
  buffer.getChannelData(0).set(vocals)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
  const rendered = await context.startRendering()
  return rendered.getChannelData(0)
}

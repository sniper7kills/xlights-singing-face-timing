import { getAudioFile } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import { parseLyrics } from './phrases.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { resampleForSpeech, type TimeRange } from './resample.ts'
import { type DownloadHandler, type TranscribeClient, TranscribeError } from './transcribeClient.ts'

/** The source of the words: the speech model, or the lyrics alone with no speech model. */
export type TranscribeMode = 'model' | 'lyrics-only'

/** One transcribe run that the person starts in the transcribe dialog. */
export type TranscribeRequest = {
  /** The voice that receives the marks. */
  voiceId: string
  /** One `SpeechModel.id`. A lyrics-only run does not read it. */
  speechModelId: string
  mode: TranscribeMode
  /** The lyrics text. A lyrics-only run needs it. */
  lyrics?: string
  /** The part of the song to transcribe. Without a range, the run reads the full song. */
  range?: TimeRange
}

/** The result of a run, for the toast "214 words, 9 estimated". */
export type TranscribeOutcome = {
  wordCount: number
  estimatedCount: number
}

/** The functions that the transcribe dialog supplies to one run. */
export type TranscribeRunHandlers = {
  /** Aborts when the person selects "Cancel". The run then changes no mark. */
  signal: AbortSignal
  /** Receives the download progress of the speech model files. */
  onDownload: DownloadHandler
  /** Receives the audio time that is complete, from the start of the run, and the audio time of the run. */
  onProgress: (doneMs: number, totalMs: number) => void
  /** Tells the dialog that the run aligns the lyrics and breaks down the words. */
  onFinishing: () => void
  /** Asks the person to replace the marks that exist. Resolves true for "Continue". */
  confirmReplace: () => Promise<boolean>
  /**
   * Asks the person to continue after a low lyrics match. Resolves true for "Continue".
   * @param ratio The match ratio from 0 to 1. The run asks only below 0.3.
   */
  confirmLowMatch: (ratio: number) => Promise<boolean>
}

/** The speech model or the lyrics gave no word. */
export class NoWordsError extends Error {
  constructor() {
    super('The run found no word.')
    this.name = 'NoWordsError'
  }
}

function stopIfCancelled(signal: AbortSignal): void {
  if (signal.aborted)
    throw new TranscribeError('cancelled', 'The person cancelled the transcribe run.')
}

/**
 * Runs one transcription for the open song and returns the count of words.
 * @param request The run that the person started.
 * @param client The client that runs the speech model.
 * @param handlers The progress functions, the cancel signal and the two confirm callbacks of the dialog.
 * Rejects with TranscribeError of kind 'cancelled' when the signal aborts or the person declines a confirm.
 * Rejects with NoWordsError when no word is found.
 * Rejects with TranscribeError for a failure of the speech model, or with Error when the audio file is missing.
 */
export async function runTranscription(
  request: TranscribeRequest,
  client: TranscribeClient,
  handlers: TranscribeRunHandlers,
): Promise<TranscribeOutcome> {
  const { signal } = handlers
  if (request.mode === 'lyrics-only') {
    const wordCount = parseLyrics(request.lyrics ?? '').flat().length
    if (wordCount === 0) throw new NoWordsError()
    // TODO(#18): Spread the lyrics over the range, write the marks and count the estimated words.
    return { wordCount, estimatedCount: wordCount }
  }

  const songId = useSongStore.getState().current?.song.id
  const audio = songId === undefined ? undefined : await getAudioFile(songId)
  if (audio === undefined) throw new Error('The open song has no audio file.')
  const samples = await resampleForSpeech(audio.data, request.range)
  stopIfCancelled(signal)

  await client.load(request.speechModelId, handlers.onDownload)
  stopIfCancelled(signal)

  const totalMs = (samples.length / SPEECH_SAMPLE_RATE) * 1000
  handlers.onProgress(0, totalMs)
  const words = await client.transcribe(samples, request.range?.startMs ?? 0, {
    onDownload: handlers.onDownload,
    onProgress: (doneMs) => handlers.onProgress(doneMs, totalMs),
  })
  stopIfCancelled(signal)
  if (words.length === 0) throw new NoWordsError()
  handlers.onFinishing()
  // TODO(#18): Group or align the words, call the confirm callbacks, and write the marks.
  return { wordCount: words.length, estimatedCount: 0 }
}

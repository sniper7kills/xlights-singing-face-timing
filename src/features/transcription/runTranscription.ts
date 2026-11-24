import { hasMarksInRange, replaceMarksInRange } from '../../store/actions/replaceMarksInRange.ts'
import { getAudioFile } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark, SongContent } from '../../store/types.ts'
import { alignLyrics } from './alignLyrics.ts'
import { buildMarks } from './buildMarks.ts'
import { groupIntoPhrases, parseLyrics, spreadLyrics } from './phrases.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { resampleForSpeech, type TimeRange } from './resample.ts'
import { type DownloadHandler, type TranscribeClient, TranscribeError } from './transcribeClient.ts'
import type { AlignedPhrase } from './types.ts'

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

/** Below this match ratio, the run asks the person before it creates marks. */
const LOW_MATCH_RATIO = 0.3

function declined(): TranscribeError {
  return new TranscribeError('cancelled', 'The person declined to continue the transcribe run.')
}

function stopIfCancelled(signal: AbortSignal): void {
  if (signal.aborted)
    throw new TranscribeError('cancelled', 'The person cancelled the transcribe run.')
}

/** Returns the counts of the toast "214 words, 9 estimated" for the word marks of a run. */
function countWords(marks: Mark[]): TranscribeOutcome {
  const words = marks.filter((mark) => mark.layer === 'word')
  return { wordCount: words.length, estimatedCount: words.filter((mark) => mark.estimated).length }
}

/**
 * Asks the person to replace the marks of the voice in the range, when the range has marks.
 * The feature file asks before the download, so a "Cancel" costs no download and no wait.
 * Rejects as cancelled when the person declines.
 */
async function askToReplace(
  content: SongContent,
  voiceId: string,
  range: TimeRange,
  handlers: TranscribeRunHandlers,
): Promise<void> {
  if (hasMarksInRange(content, voiceId, range) && !(await handlers.confirmReplace()))
    throw declined()
}

/**
 * Runs one transcription for the open song, writes the marks as one undo step, and returns the counts.
 * The run replaces the marks of the voice that lie fully inside the range. The marks outside it stay.
 * @param request The run that the person started. Without a range, the range is the full song.
 * @param client The client that runs the speech model. A lyrics-only run does not call it.
 * @param handlers The progress functions, the cancel signal and the two confirm callbacks of the dialog.
 * Rejects with TranscribeError of kind 'cancelled' when the signal aborts or the person declines a confirm.
 * Rejects with NoWordsError when no word is found.
 * Rejects with TranscribeError for a failure of the speech model, or with Error when no song is open or the audio file is missing.
 */
export async function runTranscription(
  request: TranscribeRequest,
  client: TranscribeClient,
  handlers: TranscribeRunHandlers,
): Promise<TranscribeOutcome> {
  const { signal } = handlers
  const content = useSongStore.getState().current
  if (content === null) throw new Error('The open song has no audio file.')
  const { song } = content
  const range = request.range ?? { startMs: 0, endMs: song.durationMs }

  if (request.mode === 'lyrics-only' && parseLyrics(request.lyrics ?? '').length === 0)
    throw new NoWordsError()
  await askToReplace(content, request.voiceId, range, handlers)
  stopIfCancelled(signal)

  const phrases =
    request.mode === 'lyrics-only'
      ? spreadLyrics(request.lyrics ?? '', range.startMs, range.endMs)
      : await transcribePhrases(request, song.id, client, handlers)

  const marks = buildMarks(phrases, request.voiceId, song.frameMs)
  const outcome = countWords(marks)
  if (outcome.wordCount === 0) throw new NoWordsError()
  // TODO(#23): Add the phonemes of the new words to `marks` here.
  // The write below then holds the break down in the same undo step.
  stopIfCancelled(signal)
  replaceMarksInRange(request.voiceId, range, marks)
  return outcome
}

/**
 * Returns the phrases of a speech model run: aligned with the lyrics when the person supplies them, else grouped.
 * Rejects as for `runTranscription`, and as cancelled when the person declines the low-match warning.
 */
async function transcribePhrases(
  request: TranscribeRequest,
  songId: string,
  client: TranscribeClient,
  handlers: TranscribeRunHandlers,
): Promise<AlignedPhrase[]> {
  const { signal } = handlers
  const audio = await getAudioFile(songId)
  if (audio === undefined) throw new Error('The open song has no audio file.')
  const samples = await resampleForSpeech(audio.data, request.range)
  stopIfCancelled(signal)

  await client.load(request.speechModelId, handlers.onDownload)
  stopIfCancelled(signal)

  const totalMs = (samples.length / SPEECH_SAMPLE_RATE) * 1000
  handlers.onProgress(0, totalMs)
  // The client adds the start of the range, so each word time is a song time.
  const words = await client.transcribe(samples, request.range?.startMs ?? 0, {
    onDownload: handlers.onDownload,
    onProgress: (doneMs) => handlers.onProgress(doneMs, totalMs),
  })
  stopIfCancelled(signal)
  if (words.length === 0) throw new NoWordsError()
  handlers.onFinishing()

  if (request.lyrics === undefined) return groupIntoPhrases(words)
  const { phrases, matchRatio } = alignLyrics(words, request.lyrics)
  if (matchRatio < LOW_MATCH_RATIO && !(await handlers.confirmLowMatch(matchRatio)))
    throw declined()
  return phrases
}

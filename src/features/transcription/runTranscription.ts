import { tagSectionRanges } from '../../lib/sections/tagSections.ts'
import { addSections } from '../../store/actions/addSections.ts'
import { breakDownMarks, loadDictionaries } from '../../store/actions/breakDown.ts'
import { hasMarksInRange, replaceMarksInRange } from '../../store/actions/replaceMarksInRange.ts'
import type { RemoteEndpoint } from '../../lib/remote/endpoint.ts'
import { encodeWav } from '../../lib/remote/wav.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { getAudioFile } from '../../store/db.ts'
import { DictionaryLoadError } from '../phoneme-breakdown/loadDictionary.ts'
import { separateVocals } from '../vocal-separation/separateClient.ts'
import { decodeStereo, vocalsForSpeech } from '../vocal-separation/separationAudio.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { alignLyrics } from './alignLyrics.ts'
import { buildMarks } from './buildMarks.ts'
import { groupIntoPhrases, parseLyrics, parseSectionTags, spreadLyrics } from './phrases.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { postTranscription } from './remoteClient.ts'
import { resampleForSpeech } from './resample.ts'
import {
  type ClientStage,
  type DownloadHandler,
  type TranscribeClient,
  TranscribeError,
} from './transcribeClient.ts'
import type { AlignedPhrase, TimedWord } from './types.ts'

/** The source of the words: the speech model, or the lyrics alone with no speech model. */
export type TranscribeMode = 'model' | 'lyrics-only'

/** One transcribe run that the person starts in the transcribe dialog. */
export type TranscribeRequest = {
  /** The voice that receives the marks. */
  voiceId: string
  /** One `SpeechModel.id`. A lyrics-only run and a remote run do not read it. */
  speechModelId: string
  /**
   * The remote endpoint that finds the words in place of the speech model in the browser.
   * Without it, a speech model run uses the browser. A lyrics-only run does not read it.
   */
  remote?: RemoteEndpoint
  mode: TranscribeMode
  /** The lyrics text. A lyrics-only run needs it. */
  lyrics?: string
  /** The part of the song to transcribe. Without a range, the run reads the full song. */
  range?: TimeRange
  /**
   * True adds a section for each `[Name]` tag of the lyrics, as a second undo step after the marks.
   * A run without lyrics adds no section.
   */
  addSections?: boolean
  /**
   * True removes the instruments from the audio before the speech model or the remote endpoint reads it.
   * A lyrics-only run does not read it. Without it, the run uses the audio of the song.
   */
  separateVocals?: boolean
}

/** The result of a run, for the toast "214 words, 9 estimated". */
export type TranscribeOutcome = {
  wordCount: number
  estimatedCount: number
  /**
   * The break down failure of the run, or null when every new word has phonemes.
   * The words of the run then have no phonemes, and `wordIds` lets the person retry.
   */
  breakDownFailure: BreakDownFailure | null
}

/** A break down that did not run, and the words that it leaves without phonemes. */
export type BreakDownFailure = {
  /** The message that the person sees. */
  message: string
  wordIds: string[]
}

/**
 * A step of a speech model run before its first progress:
 * - `preparing`: the page decodes and resamples the audio.
 * - `separation-download`: the separate worker loads the vocal separation model. A download also sends separation download progress.
 * - `separating`: the separate worker removes the instruments. The separation progress follows.
 * - `loading`: the worker loads the speech model. A download also sends download progress.
 * - `transcribing`: the worker runs the speech model and has sent no progress yet.
 * - `sending`: a remote run sends the audio to the endpoint. The upload also sends upload progress.
 * - `waiting`: a remote run sent all audio and waits for the response of the endpoint.
 */
export type RunStage =
  'preparing' | 'separation-download' | 'separating' | ClientStage | 'sending' | 'waiting'

/** The functions that the transcribe dialog supplies to one run. */
export type TranscribeRunHandlers = {
  /** Aborts when the person selects "Cancel". The run then changes no mark. */
  signal: AbortSignal
  /** Receives the download progress of the speech model files. */
  onDownload: DownloadHandler
  /** Receives each step of a speech model run before its first progress. A device change sends the steps again. */
  onStage: (stage: RunStage) => void
  /** Receives the bytes that a remote run sent, and the bytes of its request. */
  onUpload?: (loadedBytes: number, totalBytes: number) => void
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
  /** Receives the download progress of the vocal separation model. */
  onSeparationDownload: (loadedBytes: number, totalBytes: number) => void
  /** Receives the audio time that the vocal separation completed, and the audio time of the run. */
  onSeparationProgress: (doneMs: number, totalMs: number) => void
  /**
   * Asks the person to continue with no separation after the vocal separation failed.
   * Resolves true for "Continue with no separation". The run then uses the audio of the song.
   * @param error The failure of the vocal separation. `SeparateError` gives its cause.
   */
  confirmNoSeparation: (error: unknown) => Promise<boolean>
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

/**
 * Runs one transcription for the open song, writes the marks as one undo step, and returns the counts.
 * The same undo step holds the phonemes of each new word. If the break down fails, the words have no phonemes and the outcome reports it.
 * The run replaces the marks of the voice in the range. See `replaceMarksInRange` for a mark that crosses an edge of the range.
 * With `addSections`, the run then adds the sections of the lyrics tags as a second undo step, so one undo removes the sections only.
 * @param request The run that the person started. Without a range, the range is the full song.
 * @param client The client that runs the speech model. A lyrics-only run does not call it.
 * @param handlers The progress functions, the cancel signal and the two confirm callbacks of the dialog.
 * With `separateVocals`, a failed vocal separation asks the person to continue with the audio of the song.
 * Rejects with TranscribeError of kind 'cancelled' when the signal aborts or the person declines a confirm.
 * Also rejects as cancelled, with no mark and no section written, when the voice of the run no longer exists.
 * Rejects with NoWordsError when no word is found.
 * Rejects with TranscribeError for a failure of the speech model, and with RemoteError for a failure of the remote endpoint.
 * Rejects with Error when no song is open or the audio file is missing.
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
  // The feature file asks before the download, so a "Cancel" costs no download and no wait.
  if (hasMarksInRange(content, request.voiceId, range) && !(await handlers.confirmReplace()))
    throw declined()
  stopIfCancelled(signal)

  const phrases = await findPhrases(request, range, song.id, client, handlers)

  const { marks, phraseIds } = buildMarks(phrases, request.voiceId, song.frameMs, range)
  const words = marks.filter((mark) => mark.layer === 'word')
  if (words.length === 0) throw new NoWordsError()
  const { written, breakDownFailure } = await breakDownRun(marks, words, song.frameMs)
  stopIfCancelled(signal)
  // The phonemes go in the same write, so one undo removes the run and its break down.
  if (!replaceMarksInRange(request.voiceId, range, written))
    throw new TranscribeError('cancelled', 'The voice of the transcribe run no longer exists.')
  addTagSections(request, song.id, phraseIds, written)
  return {
    wordCount: words.length,
    estimatedCount: words.filter((mark) => mark.estimated).length,
    breakDownFailure,
  }
}

/**
 * Adds a section for each `[Name]` tag of the lyrics of the run, as one undo step.
 * The run makes one phrase for each lyrics line, so `phraseIds` gives the phrase mark of each line.
 * A request without `addSections` or without lyrics adds no section.
 */
function addTagSections(
  request: TranscribeRequest,
  songId: string,
  phraseIds: readonly (string | null)[],
  marks: readonly Mark[],
): void {
  if (request.addSections !== true || request.lyrics === undefined) return
  addSections(songId, tagSectionRanges(parseSectionTags(request.lyrics), phraseIds, marks))
}

/**
 * Returns the message of a failed break down: the copy of the dictionary failure, else the copy for any other failure.
 * The person never sees the raw text of an error.
 * @param error The rejection of the break down.
 */
export function breakDownFailureMessage(error: unknown): string {
  return error instanceof DictionaryLoadError
    ? error.message
    : 'The app could not break down the words. Select Retry.'
}

/**
 * Returns the marks of a run with the phonemes of each new word added.
 * A break down that fails must not lose the run, so the words then stay without phonemes and the failure names them.
 * The failure is a dictionary that does not load, or any other failure, for example a database that cannot read the custom dictionary.
 */
async function breakDownRun(
  marks: Mark[],
  words: Mark[],
  frameMs: number,
): Promise<{ written: Mark[]; breakDownFailure: BreakDownFailure | null }> {
  try {
    const dictionaries = await loadDictionaries()
    return {
      written: [...breakDownMarks(marks, () => true, dictionaries, frameMs)],
      breakDownFailure: null,
    }
  } catch (error) {
    return {
      written: marks,
      breakDownFailure: {
        message: breakDownFailureMessage(error),
        wordIds: words.map((word) => word.id),
      },
    }
  }
}

/**
 * Returns the phrases of a run.
 * A lyrics-only run spreads the lyrics over the range and calls no speech model.
 * A speech model run aligns the words with the lyrics when the person supplies them, else it groups the words.
 * Rejects as for `runTranscription`, and as cancelled when the person declines the low-match warning.
 */
async function findPhrases(
  request: TranscribeRequest,
  range: TimeRange,
  songId: string,
  client: TranscribeClient,
  handlers: TranscribeRunHandlers,
): Promise<AlignedPhrase[]> {
  if (request.mode === 'lyrics-only')
    return spreadLyrics(request.lyrics ?? '', range.startMs, range.endMs)
  const words = await findWords(request, songId, client, handlers)
  stopIfCancelled(handlers.signal)
  if (words.length === 0) throw new NoWordsError()
  handlers.onFinishing()

  if (request.lyrics === undefined) return groupIntoPhrases(words)
  const { phrases, matchRatio } = alignLyrics(words, request.lyrics)
  if (matchRatio < LOW_MATCH_RATIO && !(await handlers.confirmLowMatch(matchRatio)))
    throw declined()
  return phrases
}

/**
 * Returns the words of the audio of the run, with song times, from the speech model in the browser or from the remote endpoint.
 * A range run converts and sends only the audio of the range, and adds the start of the range to each word time.
 */
async function findWords(
  request: TranscribeRequest,
  songId: string,
  client: TranscribeClient,
  handlers: TranscribeRunHandlers,
): Promise<TimedWord[]> {
  const { signal } = handlers
  handlers.onStage('preparing')
  const audio = await getAudioFile(songId)
  if (audio === undefined) throw new Error('The open song has no audio file.')
  const samples = await speechSamples(request, audio.data, handlers)
  stopIfCancelled(signal)
  const offsetMs = request.range?.startMs ?? 0

  if (request.remote !== undefined) {
    handlers.onStage('sending')
    return postTranscription(request.remote, encodeWav(samples, SPEECH_SAMPLE_RATE), offsetMs, {
      signal,
      onUpload: handlers.onUpload,
      onWaiting: () => handlers.onStage('waiting'),
    })
  }

  handlers.onStage('loading')
  await client.load(request.speechModelId, handlers.onDownload)
  stopIfCancelled(signal)

  const totalMs = (samples.length / SPEECH_SAMPLE_RATE) * 1000
  // The client adds the start of the range, so each word time is a song time.
  return client.transcribe(samples, offsetMs, {
    onDownload: handlers.onDownload,
    onProgress: (doneMs) => handlers.onProgress(doneMs, totalMs),
    onStage: handlers.onStage,
  })
}

/**
 * Returns the audio of the run as one channel at the speech model sample rate.
 * With `separateVocals`, the samples are the vocals. A range run separates only the audio of the range.
 * If the separation fails and the person selects "Continue with no separation", the samples are the audio of the song.
 * Rejects as cancelled when the signal aborts or the person declines to continue.
 */
async function speechSamples(
  request: TranscribeRequest,
  audio: Blob,
  handlers: TranscribeRunHandlers,
): Promise<Float32Array> {
  if (request.separateVocals !== true) return resampleForSpeech(audio, request.range)
  try {
    return await separatedSamples(audio, request.range, handlers)
  } catch (error) {
    // A cancel during the step also rejects the separation, and it must not ask the person.
    stopIfCancelled(handlers.signal)
    if (!(await handlers.confirmNoSeparation(error))) throw declined()
    stopIfCancelled(handlers.signal)
    handlers.onStage('preparing')
    return resampleForSpeech(audio, request.range)
  }
}

/** Returns the vocals of the audio of the run, at the speech model sample rate. */
async function separatedSamples(
  audio: Blob,
  range: TimeRange | undefined,
  handlers: TranscribeRunHandlers,
): Promise<Float32Array> {
  const { signal } = handlers
  const stereo = await decodeStereo(audio, range)
  stopIfCancelled(signal)
  handlers.onStage('separation-download')
  let separating = false
  const vocals = await separateVocals(stereo, {
    signal,
    onDownload: handlers.onSeparationDownload,
    onProgress: (doneMs, totalMs) => {
      // The protocol has no message for the end of the model load, so the first progress starts the step.
      if (!separating) handlers.onStage('separating')
      separating = true
      handlers.onSeparationProgress(doneMs, totalMs)
    },
  })
  stopIfCancelled(signal)
  return vocalsForSpeech(vocals)
}

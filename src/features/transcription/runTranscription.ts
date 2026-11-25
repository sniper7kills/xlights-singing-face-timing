import { tagSectionRanges } from '../../lib/sections/tagSections.ts'
import { addSections } from '../../store/actions/addSections.ts'
import { breakDownMarks, loadDictionaries } from '../../store/actions/breakDown.ts'
import {
  countMarksInRange,
  replaceMarksInRange,
  type ReplacedVoice,
} from '../../store/actions/replaceMarksInRange.ts'
import type { RemoteEndpoint } from '../../lib/remote/endpoint.ts'
import { encodeWav } from '../../lib/remote/wav.ts'
import { fitLyricsLines, leavesOutLyrics, type LyricsFit } from '../../lib/text/lyricsFit.ts'
import { wordRoom } from '../../lib/time/fitWords.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { getAudioFile, loadRunData } from '../../store/db.ts'
import { lastRunVoices } from '../../store/trackRows.ts'
import { DictionaryLoadError } from '../phoneme-breakdown/loadDictionary.ts'
import { MAX_VOICES } from '../../lib/voices/voiceRules.ts'
import { putSingersOnVoices } from '../../store/actions/singerVoices.ts'
import { findSingers, SingersError, type SingersErrorKind } from '../singer-voices/singersClient.ts'
import type { SeparationModelId } from '../vocal-separation/protocol.ts'
import { separateVocals } from '../vocal-separation/separateClient.ts'
import { decodeStereo, vocalsForSpeech } from '../vocal-separation/separationAudio.ts'
import { useSongStore } from '../../store/songStore.ts'
import {
  finishRunRecord,
  keepRunData,
  type RunDataWrite,
  type RunRecord,
  separationFailureNote,
  singerNote,
  STAGE_STEP,
  startRunRecord,
  tracksToKeep,
  TRACKS_FAILED_NOTE,
} from './runRecord.ts'
import type { Mark, RunData, SongContent } from '../../store/types.ts'
import { alignLyrics } from './alignLyrics.ts'
import { buildMarks } from './buildMarks.ts'
import {
  countPartsLeftOut,
  groupIntoPhrases,
  keepLyricsLines,
  parseLyrics,
  parseSectionTags,
  spreadLyrics,
} from './phrases.ts'
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
  /** The vocal separation model of the run. Without it, the run uses 'spleeter'. */
  separationModel?: SeparationModelId
  /**
   * True stores the vocals and the instruments of a successful separation for the song, as 16-bit PCM.
   * It needs `separateVocals`. Without it, the run stores no audio track.
   */
  keepTracks?: boolean
  /**
   * True puts each singer on its own voice after the marks, as a further undo step.
   * The step reads the separated vocals, so it needs `separateVocals`. Without it, the run makes no singer voices.
   */
  singerVoices?: boolean
  /** The count of singers that the person gives for the singer step. Without it, the step estimates the count. */
  singerCount?: number
}

/**
 * The result of the singer step of a run with `singerVoices`:
 * - `split`: the step ran. `voiceCount` is the count of voices that hold the phrases of the run. 1 means one singer.
 * - `capped`: the step ran and found more singers than the song has free voices. `voiceCount` is as for `split`.
 * - `cancelled`: the person cancelled during the step. The marks stay on the voice of the run.
 * - `failed`: the step failed. The marks stay on the voice of the run.
 * - `no-vocals`: the vocal separation failed and the run went on with no separation, so the step did not run.
 */
export type SingerOutcome =
  | { status: 'split'; voiceCount: number; voiceName: string }
  | { status: 'capped'; voiceCount: number; voiceName: string }
  | { status: 'cancelled'; voiceName: string }
  | { status: 'failed'; kind: Exclude<SingersErrorKind, 'cancelled'>; voiceName: string }
  | { status: 'no-vocals'; voiceName: string }

/**
 * The answer of the person after a failed vocal separation.
 * - `true`: "Continue with no separation". The run uses the audio of the song.
 * - `false`: "Cancel".
 * - `'fast-model'`: "Use the fast model". The run separates the vocals again with Spleeter.
 */
export type SeparationAnswer = boolean | 'fast-model'

/** The result of a run, for the toast "214 words, 9 estimated". */
export type TranscribeOutcome = {
  wordCount: number
  estimatedCount: number
  /**
   * The break down failure of the run, or null when every new word has phonemes.
   * The words of the run then have no phonemes, and `wordIds` lets the person retry.
   */
  breakDownFailure: BreakDownFailure | null
  /** The result of the singer step. A run without `singerVoices` has no value. */
  singers?: SingerOutcome
  /** The result of the write of the run data. See `RunDataWrite`. */
  runData: RunDataWrite
  /** True when the run asked for the audio tracks and the app could not convert them. Without it, no conversion failed. */
  tracksFailed?: true
  /** The count of words that the run left out because it cannot use them. Without it, the run left out no word. */
  wordsLeftOut?: number
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
 * - `singers-download`: after the marks, the singers worker loads the singer model. A download also sends singer download progress.
 * - `finding-singers`: the singers worker finds the singers in the vocals. The singer progress follows.
 */
export type RunStage =
  | 'preparing'
  | 'separation-download'
  | 'separating'
  | ClientStage
  | 'sending'
  | 'waiting'
  | 'singers-download'
  | 'finding-singers'

/**
 * The facts of the replace question:
 * - `markCount`: the count of marks that the run replaces, on all voices that the question names.
 * - `voiceName`: the name of the voice of the run.
 * - `range`: the target range of the run.
 * - `singerVoiceNames`: the voices of the last run that lose marks too: its singer voices and the voice of the last run. No value or an empty list means none.
 * - `singerVoicesKept`: true when the song has singer voices of the last run and the run leaves them as they are.
 */
export type ReplaceQuestion = {
  markCount: number
  voiceName: string
  range: TimeRange
  singerVoiceNames?: string[]
  singerVoicesKept?: boolean
}

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
  confirmReplace: (question: ReplaceQuestion) => Promise<boolean>
  /**
   * Asks the person to continue when the lyrics have more words than the range has room for.
   * Resolves true for "Continue". The run then leaves out the lines after `fit.keptLineCount`.
   */
  confirmLyricsFit: (fit: LyricsFit) => Promise<boolean>
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
  confirmNoSeparation: (error: unknown, model: SeparationModelId) => Promise<SeparationAnswer>
  /** Receives the download progress of the singer model. */
  onSingersDownload?: (loadedBytes: number, totalBytes: number) => void
  /** Receives the audio time that the singer search completed, and the audio time of the run. */
  onSingersProgress?: (doneMs: number, totalMs: number) => void
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
 * With the singer step, the same undo step also replaces the marks of the singer voices of the last run in the range,
 * and removes each of those voices that has no mark left. See `confirmReplace`.
 * With `addSections`, the run then adds the sections of the lyrics tags as a second undo step, so one undo removes the sections only.
 * With `singerVoices`, the run then puts each singer on its own voice as a further undo step. See `SingerOutcome`.
 * A cancel or a failure of the singer step keeps the marks, so the run resolves and the outcome reports it.
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
  const replacedVoices = await confirmReplace(request, content, range, handlers)
  const { request: fitted, linesLeftOut } = await fitLyrics(request, range, song.frameMs, handlers)
  stopIfCancelled(signal)

  const record = startRunRecord()
  record.linesLeftOut = linesLeftOut
  const timed = timedHandlers(handlers, record)
  const { phrases, vocals } = await findPhrases(fitted, range, song.id, client, timed, record)

  const { marks, phraseIds } = buildMarks(phrases, request.voiceId, song.frameMs, range)
  const words = marks.filter((mark) => mark.layer === 'word')
  if (words.length === 0) throw new NoWordsError()
  record.wordsLeftOut = countWordsLeftOut(fitted, phrases, words.length)
  const { written, breakDownFailure } = await breakDownRun(marks, words, song.frameMs)
  endBreakDown(record, breakDownFailure)
  stopIfCancelled(signal)
  // The phonemes go in the same write, so one undo removes the run and its break down.
  if (!replaceMarksInRange(request.voiceId, range, written, replacedVoices))
    throw new TranscribeError('cancelled', 'The voice of the transcribe run no longer exists.')
  addTagSections(fitted, song.id, phraseIds, written)
  const singers = await singerStep(request, range, vocals, written, timed, record)
  const end = { request, range, frameMs: song.frameMs, written, device: client.device }
  // The report of every completed run is kept, so the person can see what the run did.
  const runData = await keepRunData(finishRunRecord(record, end))
  return {
    wordCount: words.length,
    estimatedCount: words.filter((mark) => mark.estimated).length,
    breakDownFailure,
    ...singers,
    runData,
    ...recordFailures(record),
  }
}

/** Returns true when the run puts each singer on its own voice: a speech model run with the vocal separation. */
function runsSingerStep(request: TranscribeRequest): boolean {
  return (
    request.mode === 'model' && request.singerVoices === true && request.separateVocals === true
  )
}

/** Returns the stored run data of the song, or undefined when the song has none or the browser cannot read it. */
async function lastRunData(songId: string): Promise<RunData | undefined> {
  try {
    return await loadRunData(songId)
  } catch {
    // With no record, the run replaces the marks of its own voice only, the rule of a song with no singer run.
    return undefined
  }
}

/**
 * Asks the person before the run replaces marks that exist, and returns the voices of the last run that the run replaces.
 * A run with the singer step replaces the result of the last run: in the range, the marks of its own voice, of the voice of the last run and of each singer voice of the last run.
 * Another run replaces the marks of its own voice only, and the question states that the singer voices do not change.
 * The question shows only when one of those voices has a mark that overlaps the range.
 * Rejects as cancelled when the person declines.
 */
async function confirmReplace(
  request: TranscribeRequest,
  content: SongContent,
  range: TimeRange,
  handlers: TranscribeRunHandlers,
): Promise<ReplacedVoice[]> {
  const lastRun = lastRunVoices(await lastRunData(content.song.id), content.voices, request.voiceId)
  const replaced = runsSingerStep(request) ? lastRun : []
  const count = (voiceId: string) => countMarksInRange(content.marks, voiceId, range)
  const losing = replaced.filter(({ voice }) => count(voice.id) > 0)
  const markCount = [request.voiceId, ...losing.map(({ voice }) => voice.id)].reduce(
    (sum, voiceId) => sum + count(voiceId),
    0,
  )
  const question: ReplaceQuestion = {
    markCount,
    voiceName: voiceNameOf(request.voiceId),
    range,
    singerVoiceNames: losing.map(({ voice }) => voice.name),
    singerVoicesKept: replaced.length === 0 && lastRun.some(({ made }) => made),
  }
  if (markCount > 0 && !(await handlers.confirmReplace(question))) throw declined()
  return replaced.map(({ voice, made }) => ({ voiceId: voice.id, removable: made }))
}

/**
 * Returns the request with the lyrics lines that fit in the range, and the count of lyrics lines that the run leaves out.
 * When lines do not fit, the run asks the person first. See `fitLyricsLines` for the rule.
 * Rejects as cancelled when the person declines.
 */
async function fitLyrics(
  request: TranscribeRequest,
  range: TimeRange,
  frameMs: number,
  handlers: TranscribeRunHandlers,
): Promise<{ request: TranscribeRequest; linesLeftOut: number }> {
  if (request.lyrics === undefined) return { request, linesLeftOut: 0 }
  const lines = parseLyrics(request.lyrics)
  const fit = fitLyricsLines(
    lines.map((line) => line.length),
    wordRoom(frameMs, range),
  )
  if (!leavesOutLyrics(fit)) return { request, linesLeftOut: 0 }
  if (!(await handlers.confirmLyricsFit(fit))) throw declined()
  return {
    request: { ...request, lyrics: keepLyricsLines(request.lyrics, fit.keptLineCount) },
    linesLeftOut: fit.lineCount - fit.keptLineCount,
  }
}

/**
 * Returns the count of words that the run leaves out because it cannot use them:
 * the parts of the lyrics with no letter and no digit, and the words that gave no word mark.
 * A word gives no mark when its label has no letter and no digit, or when the range has no frame left for it.
 */
function countWordsLeftOut(
  request: TranscribeRequest,
  phrases: readonly AlignedPhrase[],
  wordMarkCount: number,
): number {
  const phraseWords = phrases.reduce((count, phrase) => count + phrase.words.length, 0)
  return countPartsLeftOut(request.lyrics ?? '') + phraseWords - wordMarkCount
}

/**
 * Returns the outcome fields of the record that the toast states:
 * `tracksFailed` when the app could not convert the audio tracks, and `wordsLeftOut` when the run left out words.
 * A field that has nothing to state is absent.
 */
function recordFailures(
  record: RunRecord,
): Pick<TranscribeOutcome, 'tracksFailed' | 'wordsLeftOut'> {
  return {
    ...(record.notes.includes(TRACKS_FAILED_NOTE) ? { tracksFailed: true } : {}),
    ...(record.wordsLeftOut > 0 ? { wordsLeftOut: record.wordsLeftOut } : {}),
  }
}

/** Returns the handlers with each step of the run timed for the report. */
function timedHandlers(handlers: TranscribeRunHandlers, record: RunRecord): TranscribeRunHandlers {
  return {
    ...handlers,
    onStage: (stage) => {
      record.clock.enter(STAGE_STEP[stage])
      handlers.onStage(stage)
    },
    onFinishing: () => {
      record.clock.enter('breakDown')
      handlers.onFinishing()
    },
  }
}

/** Ends the timed break down step, and adds a report line when the break down failed. */
function endBreakDown(record: RunRecord, failure: BreakDownFailure | null): void {
  record.clock.enter(null)
  if (failure !== null)
    record.notes.push({ step: 'break-down', kind: 'failed', text: 'break down failed' })
}

/** Returns the outcome of the singer step, or no field when the request has no `singerVoices` or no `separateVocals`. */
async function singerStep(
  request: TranscribeRequest,
  range: TimeRange,
  vocals: Float32Array | null,
  written: readonly Mark[],
  handlers: TranscribeRunHandlers,
  record: RunRecord,
): Promise<{ singers?: SingerOutcome }> {
  if (request.singerVoices !== true || request.separateVocals !== true) return {}
  const runPhrases = written.filter((mark) => mark.layer === 'phrase')
  const voicesBefore = new Set(songVoiceIds())
  const singers = await splitSingers(request, range, vocals, runPhrases, handlers, record)
  record.singerVoiceIds = songVoiceIds().filter((id) => !voicesBefore.has(id))
  record.singers = singers
  const note = singerNote(singers)
  if (note !== null) record.notes.push(note)
  return { singers }
}

/** Returns the ids of the voices of the open song. */
function songVoiceIds(): string[] {
  return useSongStore.getState().current?.voices.map((voice) => voice.id) ?? []
}

/** Returns the name of the voice of the run, for the outcome text. */
function voiceNameOf(voiceId: string): string {
  return useSongStore.getState().current?.voices.find((voice) => voice.id === voiceId)?.name ?? ''
}

/**
 * Finds the singers in the vocals of the run, divides each phrase where the singer changes,
 * and puts each singer on its own voice, all as one undo step.
 * The singer times start at the start of the vocals, so a range run adds the start of the range.
 * The count of singers keeps the song at 12 voices or fewer.
 */
async function splitSingers(
  request: TranscribeRequest,
  range: TimeRange,
  vocals: Float32Array | null,
  runPhrases: readonly Mark[],
  handlers: TranscribeRunHandlers,
  record: RunRecord,
): Promise<SingerOutcome> {
  const voiceName = voiceNameOf(request.voiceId)
  if (vocals === null) return { status: 'no-vocals', voiceName }
  handlers.onStage('singers-download')
  let searching = false
  try {
    const segments = await findSingers(vocals, {
      singerCount: request.singerCount,
      signal: handlers.signal,
      onDownload: handlers.onSingersDownload,
      onProgress: (doneMs, totalMs) => {
        // The protocol has no message for the end of the model load, so the first progress starts the step.
        if (!searching) handlers.onStage('finding-singers')
        searching = true
        handlers.onSingersProgress?.(doneMs, totalMs)
      },
      onDiagnostics: (diagnostics) => {
        record.singerDiagnostics = diagnostics
      },
    })
    const songSegments = segments.map((segment) => ({
      ...segment,
      startMs: segment.startMs + range.startMs,
      endMs: segment.endMs + range.startMs,
    }))
    record.singerSegments = songSegments
    const songVoices = useSongStore.getState().current?.voices.length ?? MAX_VOICES
    // Singer 0 keeps the voice of the run, so each free voice gives one more singer.
    const { voiceCount, dividedCount, stats } = putSingersOnVoices(
      request.voiceId,
      runPhrases.map((phrase) => phrase.id),
      songSegments,
      MAX_VOICES - songVoices + 1,
    )
    record.assignment = { ...stats, phrasesDivided: dividedCount }
    // The count before the cap tells the person when the song had too few free voices.
    const found = stats.singersWithPhrases
    return { status: found > voiceCount ? 'capped' : 'split', voiceCount, voiceName }
  } catch (error) {
    return singerFailure(error, voiceName)
  }
}

/** Returns the outcome of a singer step that stopped. A cancel of the person is not a failure. */
function singerFailure(error: unknown, voiceName: string): SingerOutcome {
  if (!(error instanceof SingersError)) return { status: 'failed', kind: 'unknown', voiceName }
  if (error.kind === 'cancelled') return { status: 'cancelled', voiceName }
  return { status: 'failed', kind: error.kind, voiceName }
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
 * Returns the phrases of a run, and the separated vocals at 16 kHz, or null when the run has no separated vocals.
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
  record: RunRecord,
): Promise<{ phrases: AlignedPhrase[]; vocals: Float32Array | null }> {
  if (request.mode === 'lyrics-only')
    return { phrases: spreadLyrics(request.lyrics ?? '', range.startMs, range.endMs), vocals: null }
  const { words, vocals } = await findWords(request, songId, client, handlers, record)
  stopIfCancelled(handlers.signal)
  if (words.length === 0) throw new NoWordsError()
  handlers.onFinishing()

  if (request.lyrics === undefined) return { phrases: groupIntoPhrases(words), vocals }
  const { phrases, matchRatio } = alignLyrics(words, request.lyrics)
  if (matchRatio < LOW_MATCH_RATIO && !(await handlers.confirmLowMatch(matchRatio)))
    throw declined()
  return { phrases, vocals }
}

/**
 * Returns the words of the audio of the run, with song times, from the speech model in the browser or from the remote endpoint.
 * A range run converts and sends only the audio of the range, and adds the start of the range to each word time.
 * Also returns the separated vocals at 16 kHz for the singer step, or null when the run has no separated vocals.
 */
async function findWords(
  request: TranscribeRequest,
  songId: string,
  client: TranscribeClient,
  handlers: TranscribeRunHandlers,
  record: RunRecord,
): Promise<{ words: TimedWord[]; vocals: Float32Array | null }> {
  const { signal } = handlers
  handlers.onStage('preparing')
  const audio = await getAudioFile(songId)
  if (audio === undefined) throw new Error('The open song has no audio file.')
  const { samples, separated } = await speechSamples(request, audio.data, handlers, record)
  stopIfCancelled(signal)
  const offsetMs = request.range?.startMs ?? 0
  const vocals = separated ? samples : null

  if (request.remote !== undefined) {
    handlers.onStage('sending')
    const words = await postTranscription(
      request.remote,
      encodeWav(samples, SPEECH_SAMPLE_RATE),
      offsetMs,
      { signal, onUpload: handlers.onUpload, onWaiting: () => handlers.onStage('waiting') },
    )
    return { words, vocals }
  }

  handlers.onStage('loading')
  await client.load(request.speechModelId, handlers.onDownload)
  stopIfCancelled(signal)

  const totalMs = (samples.length / SPEECH_SAMPLE_RATE) * 1000
  // The client adds the start of the range, so each word time is a song time.
  const words = await client.transcribe(samples, offsetMs, {
    onDownload: handlers.onDownload,
    onProgress: (doneMs) => handlers.onProgress(doneMs, totalMs),
    onStage: handlers.onStage,
  })
  return { words, vocals }
}

/**
 * Returns the audio of the run as one channel at the speech model sample rate, and true when the samples are the separated vocals.
 * With `separateVocals`, the samples are the vocals. A range run separates only the audio of the range.
 * If the separation fails and the person selects "Continue with no separation", the samples are the audio of the song.
 * If the person selects "Use the fast model", the step runs again with Spleeter.
 * The record gets the model that gave the vocals, a report line for each failure, and the audio tracks to store.
 * @param model The vocal separation model of this attempt.
 * Rejects as cancelled when the signal aborts or the person declines to continue.
 */
async function speechSamples(
  request: TranscribeRequest,
  audio: Blob,
  handlers: TranscribeRunHandlers,
  record: RunRecord,
  model: SeparationModelId = request.separationModel ?? 'spleeter',
): Promise<{ samples: Float32Array; separated: boolean }> {
  if (request.separateVocals !== true)
    return { samples: await resampleForSpeech(audio, request.range), separated: false }
  try {
    const samples = await separatedSamples(request, audio, model, handlers, record)
    record.separationModel = model
    return { samples, separated: true }
  } catch (error) {
    // A cancel during the step also rejects the separation, and it must not ask the person.
    stopIfCancelled(handlers.signal)
    const answer = await handlers.confirmNoSeparation(error, model)
    if (answer === false) throw declined()
    stopIfCancelled(handlers.signal)
    record.notes.push(separationFailureNote(error, answer === 'fast-model'))
    record.separationFallback ||= answer === 'fast-model'
    if (answer === 'fast-model') return speechSamples(request, audio, handlers, record, 'spleeter')
    handlers.onStage('preparing')
    return { samples: await resampleForSpeech(audio, request.range), separated: false }
  }
}

/**
 * Returns the vocals of the audio of the run, at the speech model sample rate.
 * With `keepTracks`, the record also gets the vocals and the instruments as audio tracks to store.
 */
async function separatedSamples(
  request: TranscribeRequest,
  audio: Blob,
  model: SeparationModelId,
  handlers: TranscribeRunHandlers,
  record: RunRecord,
): Promise<Float32Array> {
  const { signal } = handlers
  const stereo = await decodeStereo(audio, request.range)
  stopIfCancelled(signal)
  handlers.onStage('separation-download')
  let separating = false
  const separated = await separateVocals(stereo, {
    signal,
    model,
    instruments: request.keepTracks === true,
    onDownload: handlers.onSeparationDownload,
    onProgress: (doneMs, totalMs) => {
      // The protocol has no message for the end of the model load, so the first progress starts the step.
      if (!separating) handlers.onStage('separating')
      separating = true
      handlers.onSeparationProgress(doneMs, totalMs)
    },
  })
  stopIfCancelled(signal)
  const speech = await vocalsForSpeech(separated.vocals)
  // The model gives the vocals and the instruments, also when the app asks only for the vocals.
  record.trackCount = 2
  record.tracks = await tracksToKeep(separated, request.range?.startMs ?? 0).catch(() => {
    // The tracks are extra data, so a failed conversion keeps the run and adds a report line.
    record.notes.push(TRACKS_FAILED_NOTE)
    return null
  })
  return speech
}

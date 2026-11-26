import {
  hasRoomForSplit,
  mixToMono,
  orderedTracks,
  SPLIT_VOICE_NAME,
  type SingerTrackLabel,
  type SplitMode,
} from '../../lib/singers/splitRules.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { freedVoiceCount, type ReplacedVoice } from '../../store/actions/replaceMarksInRange.ts'
import { writeSplitRun } from '../../store/actions/splitVoices.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark, SongContent } from '../../store/types.ts'
import { SplitError, splitSingers } from '../singer-split/splitClient.ts'
import { resampleSeparated } from '../vocal-separation/separationAudio.ts'
import { SPEECH_SAMPLE_RATE } from './protocol.ts'
import { keptTrack, type RunRecord, TRACKS_FAILED_NOTE } from './runRecord.ts'
import { TranscribeError } from './transcribeClient.ts'

/** The song has no room for the two voices of the singer split. */
export class NoSplitRoomError extends Error {
  constructor() {
    super('The song has no room for the two voices of the singer split.')
    this.name = 'NoSplitRoomError'
  }
}

/**
 * Rejects before the run starts when the song has no room for the two voices of the singer split.
 * A voice of the last run counts as free only when the clear of the range empties it. `writeSplitRun` uses the same rule.
 * @param content The open song.
 * @param voiceId The voice of the run.
 * @param range The target range of the run.
 * @param replaced The voices of the last run that the run replaces.
 */
export function checkSplitRoom(
  content: SongContent,
  voiceId: string,
  range: TimeRange,
  replaced: readonly ReplacedVoice[],
): void {
  const freed = freedVoiceCount(content, voiceId, range, replaced)
  if (!hasRoomForSplit(content.voices.length, freed)) throw new NoSplitRoomError()
}

/** One singer track of a run: its label and its samples at the speech model sample rate. */
export type SpeechTrack = { label: SingerTrackLabel; samples: Float32Array }

/** The functions of the run that the split step calls. */
export type SplitStepHandlers = {
  signal: AbortSignal
  onStage: (stage: 'split-download' | 'splitting') => void
  onSplitDownload?: (loadedBytes: number, totalBytes: number) => void
  onSplitProgress?: (doneMs: number, totalMs: number) => void
}

function stopIfCancelled(signal: AbortSignal): void {
  if (signal.aborted)
    throw new TranscribeError('cancelled', 'The person cancelled the transcribe run.')
}

/**
 * Returns the two singer tracks of the vocals at the speech model sample rate, in the voice order of the mode.
 * With `keep`, the record also gets the two tracks as audio tracks to store, beside the vocals and the instruments.
 * @param vocals The separated vocals, one channel at 44 100 Hz. The split worker gets the buffer, so the caller cannot read it after the call.
 * @param mode The mode that the person selected.
 * @param keep True stores the tracks. It needs the stored vocals and instruments of the record.
 * @param startMs The song time of the first sample. A range run gives the start of the range.
 * Rejects as cancelled when the signal aborts, and with SplitError for a failure of the step.
 */
export async function splitVocals(
  vocals: Float32Array,
  mode: SplitMode,
  keep: boolean,
  startMs: number,
  handlers: SplitStepHandlers,
  record: RunRecord,
): Promise<SpeechTrack[]> {
  const { signal } = handlers
  handlers.onStage('split-download')
  let splitting = false
  const result = await splitSingers({ left: vocals, right: vocals, sampleRate: 44100 }, mode, {
    signal,
    onDownload: handlers.onSplitDownload,
    onProgress: (doneMs, totalMs) => {
      // The protocol has no message for the end of the model load, so the first progress starts the step.
      if (!splitting) handlers.onStage('splitting')
      splitting = true
      handlers.onSplitProgress?.(doneMs, totalMs)
    },
  }).catch((error: unknown) => {
    // The client rejects a cancel as a split failure, and the dialog must show it as the stop of the run.
    stopIfCancelled(signal)
    throw error
  })
  stopIfCancelled(signal)
  const ordered = orderedTracks(mode, result.tracks)
  if (ordered === null)
    throw new SplitError('model', 'The engine returned tracks that do not match the mode.')
  const mono = ordered.map((track) => ({ label: track.label, samples: mixToMono(track.audio) }))
  record.splitMode = mode
  if (keep) await keepSplitTracks(mono, startMs, record)
  return Promise.all(
    mono.map(async ({ label, samples }) => ({
      label,
      samples: await resampleSeparated(samples, SPEECH_SAMPLE_RATE),
    })),
  )
}

/** Adds the singer tracks to the audio tracks of the record. A failed conversion keeps the run and adds a report line. */
async function keepSplitTracks(
  mono: readonly { samples: Float32Array }[],
  startMs: number,
  record: RunRecord,
): Promise<void> {
  const { tracks } = record
  if (tracks === null) return
  try {
    const split = await Promise.all(mono.map(({ samples }) => keptTrack(samples, startMs)))
    record.tracks = { ...tracks, split }
    record.trackCount += split.length
  } catch {
    // The tracks are extra data, so the run keeps no audio track and states it.
    record.tracks = null
    record.notes.push(TRACKS_FAILED_NOTE)
  }
}

/** The marks of one singer track of a run, with the label of the track. */
export type TrackMarks = { label: SingerTrackLabel; marks: readonly Mark[] }

/**
 * Writes the marks of the singer tracks on two new voices, as one undo step, and records the voices and the word counts.
 * @param voiceId The voice of the run. The step clears its range too.
 * @param range The target range of the run.
 * @param tracks The marks of each singer track, in voice order.
 * @param replaced The voices of the last run that the run replaces.
 * Rejects as cancelled when the voice of the run no longer exists, and with NoSplitRoomError when the song has no room.
 */
export function writeSplit(
  voiceId: string,
  range: TimeRange,
  tracks: readonly TrackMarks[],
  replaced: readonly ReplacedVoice[],
  record: RunRecord,
): void {
  const voices = useSongStore.getState().current?.voices ?? []
  if (!voices.some((voice) => voice.id === voiceId))
    throw new TranscribeError('cancelled', 'The voice of the transcribe run no longer exists.')
  const named = tracks.map((track) => ({ name: SPLIT_VOICE_NAME[track.label], marks: track.marks }))
  const voiceIds = writeSplitRun(voiceId, range, named, replaced)
  if (voiceIds === null) throw new NoSplitRoomError()
  record.splitVoiceIds = voiceIds
  const after = useSongStore.getState().current?.voices ?? []
  record.split = tracks.map((track, index) => ({
    label: track.label,
    voiceName: after.find((voice) => voice.id === voiceIds[index])?.name ?? '',
    wordCount: track.marks.filter((mark) => mark.layer === 'word').length,
  }))
}

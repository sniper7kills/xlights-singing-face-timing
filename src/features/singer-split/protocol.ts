// Issue #193 fixed this interface. The real engine of issue #194 builds against it, so keep each field as it is.
import type { SingerTrackLabel, SplitMode } from '../../lib/singers/splitRules.ts'
import type { StereoAudio } from '../vocal-separation/protocol.ts'

export type { SingerTrackLabel, SplitMode } from '../../lib/singers/splitRules.ts'

/** One singer track of a singer split: stereo audio at 44 100 Hz with the length of the input, and its label. */
export interface SingerTrack {
  label: SingerTrackLabel
  audio: StereoAudio
}

/** The result of one singer split: two tracks, one for each label of the mode. */
export type SplitResult = {
  tracks: SingerTrack[]
}

/** The cause of a failed singer split. `not-available` is an engine that this version of the app does not have. */
export type SplitFailureKind = 'download' | 'memory' | 'model' | 'not-available' | 'unknown'

/** A message from the page to the split worker. `cancel` stops the run with the same `runId`. */
export type SplitRequest =
  | { type: 'split'; runId: number; vocals: StereoAudio; mode: SplitMode }
  | { type: 'cancel'; runId: number }

/** A message from the split worker to the page. */
export type SplitMessage =
  | { type: 'download'; runId: number; loadedBytes: number; totalBytes: number }
  | { type: 'progress'; runId: number; doneMs: number; totalMs: number }
  | { type: 'result'; runId: number; tracks: SingerTrack[] }
  | { type: 'error'; runId: number; kind: SplitFailureKind; detail: string }

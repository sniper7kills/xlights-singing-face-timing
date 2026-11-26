// Issue #193 fixed this interface. The real engine of issue #194 builds against it, so keep each field as it is.
import type { StereoAudio } from '../vocal-separation/protocol.ts'
import type { SplitMode, SplitResult } from './protocol.ts'

/** The functions that receive the progress of one singer split. */
export type SplitterEvents = {
  /** Receives the bytes of the model files that the browser has, and the size of the files. */
  download(loadedBytes: number, totalBytes: number): void
  /** Receives the audio time that is complete, and the audio time of the run. */
  progress(doneMs: number, totalMs: number): void
}

/** An engine that divides the vocals into two singer tracks. It uses no DOM, so it runs in a worker. */
export type Splitter = {
  /**
   * Returns two singer tracks, one for each label of the mode, each with the length of the input.
   * @param vocals The separated vocals at 44 100 Hz. A mono source gives two equal channels.
   * @param mode The mode that the person selected.
   * @param on The functions that receive the progress.
   * @param signal Aborts when the person cancels. The engine then rejects as soon as it can.
   * Rejects with `SplitFailure` for a known cause, else with any error.
   */
  split(
    vocals: StereoAudio,
    mode: SplitMode,
    on: SplitterEvents,
    signal: AbortSignal,
  ): Promise<SplitResult>
}

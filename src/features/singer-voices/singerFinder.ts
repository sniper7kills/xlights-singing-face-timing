import type { SingerSegment } from './protocol.ts'

/** The functions that receive the progress of one singer search. */
export type SingerFinderEvents = {
  /** Receives the bytes of the model files that the browser has, and the size of the files. */
  download(loadedBytes: number, totalBytes: number): void
  /** Receives the audio time that is complete, and the audio time of the run. */
  progress(doneMs: number, totalMs: number): void
}

/** An engine that finds the time ranges of each singer in the vocals. It uses no DOM, so it runs in a worker. */
export type SingerFinder = {
  /**
   * Returns the time ranges in which each singer sings, with times from the start of the vocals.
   * @param vocals One channel at 16 000 Hz.
   * @param on The functions that receive the progress.
   * @param singerCount The count of singers that the person gives. Without it, the engine estimates the count.
   * Rejects with `SingerFailure` for a known cause, else with any error.
   */
  find(vocals: Float32Array, on: SingerFinderEvents, singerCount?: number): Promise<SingerSegment[]>
}

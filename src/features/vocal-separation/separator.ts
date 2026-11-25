import type { StereoAudio } from './protocol.ts'

/** The functions that receive the progress of one vocal separation. */
export type SeparatorEvents = {
  /** Receives the bytes of the model files that the browser has, and the size of the files. */
  download(loadedBytes: number, totalBytes: number): void
  /** Receives the audio time that is complete, and the audio time of the run. */
  progress(doneMs: number, totalMs: number): void
}

/** An engine that removes the instruments from stereo audio. It uses no DOM, so it runs in a worker. */
export type Separator = {
  /**
   * Returns the vocals of the audio: one channel at 44 100 Hz, with the length of the input.
   * @param audio The stereo audio of the run.
   * @param on The functions that receive the progress.
   * Rejects with `SeparationFailure` for a known cause, else with any error.
   */
  separate(audio: StereoAudio, on: SeparatorEvents): Promise<Float32Array>
}

import type { SeparatedAudio, StereoAudio } from '../protocol.ts'
import type { Separator, SeparatorEvents } from '../separator.ts'

const FIXTURE_TOTAL_BYTES = 2_000_000
const DOWNLOAD_STEP_MS = 50
// A real separation takes time, so an E2E test must have time to see the step.
const PROGRESS_STEP_MS = 100
const PROGRESS_STEPS = 10

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

/** Returns the mono mix of the two channels. */
export function monoMix(audio: StereoAudio): Float32Array {
  return audio.left.map((left, index) => (left + (audio.right[index] ?? left)) / 2)
}

/**
 * Returns an engine for the tests that downloads no model.
 * It sends a short download and the progress of about one second, and then returns the mono mix as the vocals.
 * The instruments are the mono mix at half level with the sign inverted, so a test can tell the two tracks apart.
 */
export function createFixtureSeparator(): Separator {
  return {
    async separate(
      audio: StereoAudio,
      on: SeparatorEvents,
      instruments: boolean,
    ): Promise<SeparatedAudio> {
      for (const share of [0, 0.5, 1]) {
        on.download(share * FIXTURE_TOTAL_BYTES, FIXTURE_TOTAL_BYTES)
        await wait(DOWNLOAD_STEP_MS)
      }
      const totalMs = (audio.left.length / audio.sampleRate) * 1000
      for (let step = 0; step <= PROGRESS_STEPS; step++) {
        on.progress((totalMs * step) / PROGRESS_STEPS, totalMs)
        if (step < PROGRESS_STEPS) await wait(PROGRESS_STEP_MS)
      }
      const vocals = monoMix(audio)
      return instruments ? { vocals, instruments: vocals.map((value) => -value / 2) } : { vocals }
    },
  }
}

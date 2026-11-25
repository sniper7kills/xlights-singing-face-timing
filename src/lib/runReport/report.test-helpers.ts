import type { PcmTrack } from '../audio/pcm.ts'
import type { RunReport } from './runReport.ts'

/** Returns the report of a run on the full song of 4 seconds with Spleeter and no singer step. */
export function makeReport(change: Partial<RunReport> = {}): RunReport {
  return {
    startedAt: '2026-11-24T10:00:00.000Z',
    source: 'browser',
    endpointHost: null,
    mode: 'model',
    speechModel: 'whisper-base',
    device: 'wasm',
    separationModel: 'spleeter',
    separationFallback: false,
    trackCount: 2,
    tracksKept: true,
    singers: {
      status: 'option-off',
      failureKind: null,
      diagnostics: null,
      rangeCount: null,
      singersWithPhrases: null,
      phrasesWithNoSinger: null,
      phrasesWithMoreSingers: null,
      voicesMade: null,
    },
    voices: [{ name: 'Lead Vocals', phraseCount: 1 }],
    phraseCount: 1,
    wordCount: 2,
    estimatedCount: 0,
    unknownCount: 0,
    range: { startMs: 0, endMs: 4000 },
    frameMs: 50,
    durationsMs: { prepare: 10 },
    notes: [],
    ...change,
  }
}

/** Returns a kept audio track with `sampleCount` samples at 22 050 Hz. */
export function makeTrack(sampleCount: number, startMs = 0): PcmTrack {
  return { startMs, sampleRate: 22_050, samples: new Int16Array(sampleCount).fill(100) }
}

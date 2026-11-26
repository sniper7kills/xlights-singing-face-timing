// The entity types of the data model in docs/specs/spec.md. Times are whole milliseconds.
import type { SingerCountChoice } from '../features/singer-voices/singerCount.ts'
import type { SeparationModelId } from '../features/vocal-separation/protocol.ts'
import type { PcmTrack } from '../lib/audio/pcm.ts'
import type { RemoteEndpoint } from '../lib/remote/endpoint.ts'
import type { SplitMode } from '../lib/singers/splitRules.ts'
import type { ReportSingerRange, RunReport } from '../lib/runReport/runReport.ts'

/** The length of one xLights frame in milliseconds. */
export type FrameMs = 25 | 50

export type Song = {
  /** A UUID. */
  id: string
  name: string
  durationMs: number
  frameMs: FrameMs
  /** An ISO 8601 date and time. */
  createdAt: string
  /** An ISO 8601 date and time. Each save of the song sets it. */
  updatedAt: string
}

export type AudioFile = {
  songId: string
  /** The original bytes of the file that the person loads. */
  data: Blob
  fileName: string
  mimeType: string
  byteLength: number
}

export type Voice = {
  id: string
  songId: string
  /** Unique in a song, 1 to 60 characters. */
  name: string
  /** Sets the row order and the export order. */
  order: number
  color: string
  /** True when the face preview shows no face for the voice. No value means not muted. The export does not read it. */
  previewMuted?: boolean
}

export type Section = {
  id: string
  songId: string
  /** 1 to 40 characters. */
  name: string
  startMs: number
  endMs: number
}

export type Layer = 'phrase' | 'word' | 'phoneme'

export type Mark = {
  id: string
  voiceId: string
  layer: Layer
  label: string
  startMs: number
  endMs: number
  /** A word has a phrase as its parent, and a phoneme has a word. A phrase has no parent. */
  parentId: string | null
  /** True after the person changes the mark by hand. */
  edited: boolean
  /**
   * True when no word of the speech model gave the time of this word.
   * A transcribe run sets it on each word. Phrases, phonemes and marks from before the field have no value.
   */
  estimated?: boolean
  /**
   * True when no dictionary has the word, so its phonemes come from the rule-based guess.
   * Each break down sets it on the word. Phrases, phonemes and words with no break down have no value.
   */
  unknown?: boolean
}

export type CustomEntry = {
  /** Upper case. */
  word: string
  /** CMU symbols separated by spaces. */
  symbols: string
  updatedAt: string
}

/**
 * The measured speed of each device for one speech model, in seconds of audio for each second of run.
 * A failed or stalled device has the speed 0.
 */
export type DeviceSpeeds = Partial<Record<'webgpu' | 'wasm', number>> & {
  /**
   * The `Date.now()` of the last failure of each device with the speed 0.
   * A record from an earlier version of the app has no failure time.
   */
  failedAtMs?: Partial<Record<'webgpu' | 'wasm', number>>
}

export type AppSettings = {
  speechModelId: string
  /** The measured speeds in this browser for each speech model id. The app selects the faster device. */
  deviceSpeeds: Record<string, DeviceSpeeds>
  defaultFrameMs: FrameMs
  theme: 'light' | 'dark'
  /** The last "Where to transcribe" choice of the transcribe dialog. */
  transcribeSource: TranscribeSource
  /**
   * The remote endpoint that the person typed. An empty base URL means no endpoint.
   * The API key stays in this record and in the `Authorization` header to the base URL only.
   */
  remoteEndpoint: RemoteEndpoint
  /** The last choice of the check box "Separate the vocals first" of the transcribe dialog. */
  separateVocals: boolean
  /** The last choice of the check box "Put each singer on its own voice" of the transcribe dialog. */
  singerVoices: boolean
  /** The last choice of "Singers" of the transcribe dialog. */
  singerCount: SingerCountChoice
  /** The last choice of "Separation model" of the transcribe dialog. */
  separationModel: SeparationModelId
  /** The last choice of the check box "Keep the separated tracks" of the transcribe dialog. */
  keepTracks: boolean
  /** The last choice of the check box "Split the singers" of the transcribe dialog. A record from before issue #193 has no value. */
  splitSingers?: boolean
  /** The last choice of "Split mode" of the transcribe dialog. A record from before issue #193 has no value. */
  splitMode?: SplitMode
}

/** The two audio tracks of the vocal separation of a run, as 16-bit PCM at `KEPT_TRACK_SAMPLE_RATE`. */
export type KeptTracks = {
  vocals: PcmTrack
  instruments: PcmTrack
  /**
   * The two singer tracks of a run with the singer split, in voice order. `RunVoice.splitTrack` gives the index.
   * A run with no singer split has no value.
   */
  split?: PcmTrack[]
}

/** One voice that a transcribe run wrote marks to, by its id, which stays the same after a rename. */
export type RunVoice = {
  voiceId: string
  /** The singer numbers of the singer search whose ranges belong to the voice. Empty when the run found no singer ranges. */
  singers: number[]
  /** True for a voice that the singer step or the singer split of the run added. */
  made: boolean
  /** The index of the singer track of the voice in `KeptTracks.split`. A voice that the singer split did not add has no value. */
  splitTrack?: number
}

/**
 * The data of the last completed transcribe run of a song. A new run replaces the full record.
 * Lyrics, labels and the API key are never in it.
 */
export type RunData = {
  songId: string
  /**
   * The voices that the run wrote marks to, in the voice order at the end of the run.
   * A record from before issue #173 has no value. The app then finds the voices of the run by their names in the report.
   */
  voices?: RunVoice[]
  /**
   * The audio tracks of the vocal separation of the run. A range run keeps the tracks of the range only.
   * A run that kept no tracks, and a record from before issue #129, have no value.
   */
  tracks?: KeptTracks
  /** The singer ranges of the singer step, with song times. Empty when the step did not return ranges. */
  singerSegments: ReportSingerRange[]
  report: RunReport
}

/** Where a transcribe run finds the words: the speech model in this browser, or a remote endpoint. */
export type TranscribeSource = 'browser' | 'remote'

/** One song with all voices, sections and marks that belong to it, without the audio bytes. */
export type SongContent = {
  song: Song
  voices: Voice[]
  sections: Section[]
  marks: Mark[]
}

import { foldShortGroups, groupSingers, NO_GROUP } from './clustering.ts'
import { decodePowerset } from './powerset.ts'
import type { SingerSegment } from '../protocol.ts'
import { activityToRanges, renumberByFirstRange } from './segments.ts'
import { planWindows, windowSamplesAt } from './windows.ts'

/** The two models that the diarization calls. Tests replace them. */
export interface DiarizeModels {
  /** Returns the 7 class scores of each frame of one window, frame after frame. */
  segment(window: Float32Array): Promise<Float32Array>
  /** Returns the speaker embedding of the samples. */
  embed(samples: Float32Array): Promise<Float32Array>
}

/** The settings of the diarization. All counts are in samples of the input. */
export interface DiarizeSettings {
  sampleRate: number
  windowSamples: number
  stepSamples: number
  /** A local speaker with fewer samples than this gets no embedding, and its frames count for no singer. */
  minEmbedSamples: number
  /** The merge threshold of the clustering: a distance between the centroids of unit-length embeddings. */
  threshold: number
  /** A group with fewer local speakers than this joins the closest larger group. */
  minGroupSize: number
  maxSingers: number
  /** A singer with less sung time than this share of all sung time joins the closest other singer. */
  minSingerShare: number
  /** A singer with less sung time than this joins the closest other singer, whatever the share. */
  minSingerMs: number
  minGapMs: number
  minRangeMs: number
  /** The count of singers that the person gives. With a count, the threshold and the rule for short singers do not apply. */
  singerCount?: number
}

/** One speaker of one window, with its frames and its embedding. */
interface LocalSpeaker {
  windowStart: number
  activity: Uint8Array
  embedding: Float32Array
  /** The samples that the embedding model read. */
  samples: number
}

/** Returns the samples of the frames that are set, in order. */
function framesSamples(
  window: Float32Array,
  frames: readonly boolean[],
  frameSamples: number,
): Float32Array {
  const parts = frames.flatMap((on, frame) =>
    on
      ? [window.subarray(Math.round(frame * frameSamples), Math.round((frame + 1) * frameSamples))]
      : [],
  )
  const samples = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    samples.set(part, offset)
    offset += part.length
  }
  return samples
}

/**
 * Returns the samples for the embedding of one local speaker: the frames in which it sings alone, as pyannote.audio does.
 * If those are too short, the frames in which it sings with another speaker count too.
 */
function speakerSamples(
  window: Float32Array,
  activity: readonly Uint8Array[],
  speaker: Uint8Array,
  frameSamples: number,
  minEmbedSamples: number,
): Float32Array {
  const alone = Array.from(
    speaker,
    (on, frame) => on === 1 && activity.every((other) => other === speaker || other[frame] === 0),
  )
  const aloneSamples = framesSamples(window, alone, frameSamples)
  if (aloneSamples.length >= minEmbedSamples) return aloneSamples
  return framesSamples(
    window,
    Array.from(speaker, (on) => on === 1),
    frameSamples,
  )
}

async function windowSpeakers(
  window: Float32Array,
  windowStart: number,
  models: DiarizeModels,
  settings: DiarizeSettings,
): Promise<LocalSpeaker[]> {
  const activity = decodePowerset(await models.segment(window))
  const frameSamples = settings.windowSamples / (activity[0]?.length ?? 1)
  const speakers: LocalSpeaker[] = []
  for (const speaker of activity) {
    const samples = speakerSamples(
      window,
      activity,
      speaker,
      frameSamples,
      settings.minEmbedSamples,
    )
    if (samples.length >= settings.minEmbedSamples) {
      speakers.push({
        windowStart,
        activity: speaker,
        embedding: await models.embed(samples),
        samples: samples.length,
      })
    }
  }
  return speakers
}

/** The frame grid of the whole input. It starts at sample 0 and has the frame duration of the model. */
interface Grid {
  frameSamples: number
  frames: number
  /** The frames of one window. */
  windowFrames: number
}

function gridIndex(grid: Grid, windowStart: number, frame: number): number {
  return Math.round(windowStart / grid.frameSamples) + frame
}

/**
 * Returns, for each singer, the share of the windows over each grid frame that give the frame to the singer.
 * A share of 1 means that every window over the frame hears the singer.
 */
function singerShares(
  speakers: readonly LocalSpeaker[],
  singers: readonly number[],
  windowStarts: readonly number[],
  grid: Grid,
): Float32Array[] {
  const coverage = new Float32Array(grid.frames)
  for (const start of windowStarts) {
    const first = gridIndex(grid, start, 0)
    coverage.subarray(first, first + grid.windowFrames).forEach((_, offset, part) => {
      part[offset] = (part[offset] ?? 0) + 1
    })
  }
  const votes = Array.from(
    { length: Math.max(...singers) + 1 },
    () => new Float32Array(grid.frames),
  )
  speakers.forEach((speaker, index) => {
    const singerVotes = votes[singers[index] ?? 0] ?? new Float32Array()
    const first = gridIndex(grid, speaker.windowStart, 0)
    speaker.activity.forEach((on, frame) => {
      if (on === 1) singerVotes[first + frame] = (singerVotes[first + frame] ?? 0) + 1
    })
  })
  return votes.map((singerVotes) =>
    singerVotes.map((value, frame) => value / Math.max(1, coverage[frame] ?? 0)),
  )
}

/**
 * Returns the time ranges in which each singer sings, sorted by start, with singers numbered in the order of their first range.
 * The segmentation model reads overlapping windows and finds up to 3 local speakers in each.
 * The embedding model and the clustering give the same singer number to the same voice in all windows.
 * A frame belongs to a singer when at least half of the windows over it give it to that singer.
 * Then a singer with too little sung time joins the closest other singer. This limits the singers that a split of one voice can add.
 * @param vocals The audio, mono, at `settings.sampleRate`.
 * @param models The segmentation model and the embedding model.
 * @param settings The window plan, the clustering and the range limits.
 * @param onProgress Called after each window with the samples done and the total samples.
 * Rejects with the error of a model call.
 */
export async function diarize(
  vocals: Float32Array,
  models: DiarizeModels,
  settings: DiarizeSettings,
  onProgress: (doneSamples: number, totalSamples: number) => void,
): Promise<SingerSegment[]> {
  const starts = planWindows(vocals.length, settings.windowSamples, settings.stepSamples)
  const found: LocalSpeaker[] = []
  for (const start of starts) {
    const window = windowSamplesAt(vocals, start, settings.windowSamples)
    found.push(...(await windowSpeakers(window, start, models, settings)))
    onProgress(Math.min(vocals.length, start + settings.windowSamples), vocals.length)
  }
  const owners = groupSingers(
    found.map((speaker) => speaker.embedding),
    found.map((speaker) => speaker.samples),
    {
      threshold: settings.threshold,
      minGroupSize: settings.minGroupSize,
      maxGroups: settings.maxSingers,
      minShare: settings.minSingerShare,
    },
    settings.singerCount,
  )
  // A speaker with an embedding that is not finite has no group, so its frames count for no singer, as silence does.
  const speakers = found.filter((_, index) => owners[index] !== NO_GROUP)
  const singers = owners.filter((owner) => owner !== NO_GROUP)
  const first = speakers[0]
  if (first === undefined) return []
  const frameSamples = settings.windowSamples / first.activity.length
  const grid = {
    frameSamples,
    frames: Math.ceil(vocals.length / frameSamples),
    windowFrames: first.activity.length,
  }
  const frameMs = (frameSamples / settings.sampleRate) * 1000
  const active = singerActivity(singerShares(speakers, singers, starts, grid))
  // A count of the person is a fact, so no group joins another for its short time.
  const folded =
    settings.singerCount !== undefined
      ? singers
      : foldShortGroups(
          singers,
          speakers.map((speaker) => speaker.embedding),
          active.map((frames) => frames.filter(Boolean).length * frameMs),
          shortSingerLimitMs(active, frameMs, settings),
        )
  const rangeSettings = { frameMs, minGapMs: settings.minGapMs, minRangeMs: settings.minRangeMs }
  return renumberByFirstRange(
    singerActivity(singerShares(speakers, folded, starts, grid)).flatMap((frames, singer) =>
      activityToRanges(frames, singer, rangeSettings),
    ),
  )
}

/** Returns, for each singer, true for each frame that at least half of the windows over it give to the singer. */
function singerActivity(shares: readonly Float32Array[]): boolean[][] {
  return shares.map((share) => Array.from(share, (value) => value >= 0.5))
}

/** Returns the sung time under which a singer joins another singer: a share of the sung time, but not less than a fixed time. */
function shortSingerLimitMs(
  active: readonly boolean[][],
  frameMs: number,
  settings: DiarizeSettings,
): number {
  const frames = active[0]?.length ?? 0
  let sungFrames = 0
  for (let frame = 0; frame < frames; frame++) {
    if (active.some((singer) => singer[frame] === true)) sungFrames++
  }
  return Math.max(settings.minSingerShare * sungFrames * frameMs, settings.minSingerMs)
}

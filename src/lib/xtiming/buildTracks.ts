import type { Mark, Section, Song, Voice } from '../../store/types.ts'
import { snap } from '../time/snap.ts'
import { defaultTrackName, trackKey, UNSECTIONED } from './names.ts'
import type { ExportMark, ExportOptions, ExportTrack } from './types.ts'

/**
 * Returns the timing tracks to export, with every time snapped to the frame size of the song.
 *
 * The rules:
 * - Grouping `voice` gives one timing track for each voice in `options.voiceIds`, also with no phrase.
 * - Grouping `voice-section` gives one timing track for each voice and section that holds a phrase.
 *   A phrase belongs to a section when the middle of the stored phrase is at or after the section start and before the section end.
 *   The phrases outside every section go to the `Unsectioned` timing track, last for the voice.
 * - The timing tracks follow `Voice.order`, then the section start.
 * - A word belongs to the timing track of its parent phrase. A phoneme belongs to the timing track of its parent word.
 * - An edited name in `options.trackNames` replaces the default name.
 * - A layer has the order of start time.
 * - No time is before 0. A stored time before the start of the song becomes 0.
 * - If the snap or the limit at 0 makes a mark zero length, the mark gets the length of one frame size.
 * - A mark never starts before the end of the mark before it on the layer.
 *   If an extension overlaps the next mark, the next mark moves later by the overlap, and so on.
 *   The `short-mark` check of `checkTracks` warns about each mark that is shorter than the frame size after the snap.
 * - With `options.writeRest`, a `rest` phoneme fills each gap of the phoneme layer between the first phrase start and the last phrase end.
 *
 * The function returns new objects and changes no input.
 *
 * @param song The song. `song.frameMs` gives the frame size.
 * @param voices The voices of the song.
 * @param sections The sections of the song. They do not overlap.
 * @param marks The marks of the song.
 * @param options The export options.
 */
export function buildTracks(
  song: Song,
  voices: readonly Voice[],
  sections: readonly Section[],
  marks: readonly Mark[],
  options: ExportOptions,
): ExportTrack[] {
  const selected = voices
    .filter((voice) => options.voiceIds.includes(voice.id))
    .sort((a, b) => a.order - b.order)
  const sortedSections = [...sections].sort((a, b) => a.startMs - b.startMs)
  const tracks: ExportTrack[] = []

  for (const voice of selected) {
    const phrases = marks.filter((mark) => mark.voiceId === voice.id && mark.layer === 'phrase')
    if (options.grouping === 'voice') {
      tracks.push(makeTrack(song, voice, null, null, phrases, marks, options))
      continue
    }
    const groups = sortedSections.map((section) => ({
      id: section.id,
      name: section.name,
      phrases: phrases.filter((phrase) => contains(section, middle(phrase))),
    }))
    groups.push({
      id: UNSECTIONED,
      name: UNSECTIONED,
      phrases: phrases.filter((phrase) => !sections.some((s) => contains(s, middle(phrase)))),
    })
    for (const group of groups) {
      if (group.phrases.length === 0) continue
      tracks.push(makeTrack(song, voice, group.id, group.name, group.phrases, marks, options))
    }
  }
  return tracks
}

function middle(mark: Mark): number {
  return (mark.startMs + mark.endMs) / 2
}

function contains(section: Section, ms: number): boolean {
  return ms >= section.startMs && ms < section.endMs
}

function makeTrack(
  song: Song,
  voice: Voice,
  sectionId: string | null,
  sectionName: string | null,
  phrases: readonly Mark[],
  marks: readonly Mark[],
  options: ExportOptions,
): ExportTrack {
  const key = trackKey(voice.id, sectionId)
  const phraseIds = new Set(phrases.map((phrase) => phrase.id))
  const words = marks.filter(
    (mark) => mark.layer === 'word' && mark.parentId !== null && phraseIds.has(mark.parentId),
  )
  const wordIds = new Set(words.map((word) => word.id))
  const phonemes = marks.filter(
    (mark) => mark.layer === 'phoneme' && mark.parentId !== null && wordIds.has(mark.parentId),
  )

  const frameMs = song.frameMs
  const phraseLayer = snapLayer(phrases, frameMs, false)
  const wordLayer = snapLayer(words, frameMs, true)
  let phonemeLayer = snapLayer(phonemes, frameMs, false)
  const firstPhrase = phraseLayer[0]
  if (options.writeRest && firstPhrase) {
    const last = Math.max(...phraseLayer.map((phrase) => phrase.endMs))
    phonemeLayer = fillRests(phonemeLayer, firstPhrase.startMs, last)
  }

  return {
    name: options.trackNames[key] ?? defaultTrackName(voice.name, sectionName),
    layers: [phraseLayer, wordLayer, phonemeLayer],
    key,
    voiceId: voice.id,
  }
}

function snapLayer(marks: readonly Mark[], frameMs: number, isWord: boolean): ExportMark[] {
  const sorted = [...marks].sort((a, b) => a.startMs - b.startMs)
  const layer: ExportMark[] = []
  // xLights has no time before the start of the song, so the first mark starts at 0 or later.
  let previousEnd = 0
  for (const mark of sorted) {
    const startMs = Math.max(snap(mark.startMs, frameMs), previousEnd)
    const endMs = Math.max(snap(mark.endMs, frameMs), startMs + frameMs)
    previousEnd = endMs
    const exported: ExportMark = { label: mark.label, startMs, endMs, markId: mark.id }
    if (isWord) {
      exported.unknown = mark.unknown ?? false
      exported.estimated = mark.estimated ?? false
    }
    layer.push(exported)
  }
  return layer
}

function fillRests(phonemes: ExportMark[], firstMs: number, lastMs: number): ExportMark[] {
  const filled: ExportMark[] = []
  let cursor = firstMs
  for (const phoneme of phonemes) {
    if (phoneme.startMs > cursor && cursor < lastMs) {
      filled.push({ label: 'rest', startMs: cursor, endMs: Math.min(phoneme.startMs, lastMs) })
    }
    filled.push(phoneme)
    cursor = Math.max(cursor, phoneme.endMs)
  }
  if (cursor < lastMs) filled.push({ label: 'rest', startMs: cursor, endMs: lastMs })
  return filled
}

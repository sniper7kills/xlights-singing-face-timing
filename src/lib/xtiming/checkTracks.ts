import type { Mark, Song, Voice } from '../../store/types.ts'
import { PHONEME_LABELS } from '../dictionary/cmuSymbols.ts'
import { formatTime } from '../time/formatTime.ts'
import { snap } from '../time/snap.ts'
import { nameAfterImport } from './names.ts'
import type { ExportMark, ExportOptions, ExportTrack, Finding } from './types.ts'

const PHONEME_LABEL_SET: ReadonlySet<string> = new Set(PHONEME_LABELS)

/**
 * Returns the findings of the checks before export, errors first, then warnings.
 *
 * Each check has one name in `Finding.check`:
 * - Errors: `voice-no-marks`, `duplicate-name`, `empty-name`, `import-name-empty`, `bad-phoneme-label`,
 *   `end-not-after-start`.
 * - Warnings: `import-name-changed`, `import-name-same`, `word-no-phoneme`, `unknown-word`, `estimated-word`,
 *   `short-mark`, `ends-after-song`.
 *
 * The rules:
 * - A selected voice has no marks when no timing track of the voice holds a mark.
 *   Grouping `voice-section` omits such a voice, so the check reads `options.voiceIds`.
 * - A name with only spaces is empty. Two empty names give two `empty-name` errors and no `duplicate-name` error.
 * - The import checks use `nameAfterImport`. A name with only spaces after the import gives `import-name-empty`.
 * - Two different names that give the same name after the import give `import-name-same`, because xLights adds
 *   `_1` to the second name (src-core/render/SequenceFile.cpp:903-926 of xLights 2026.21).
 * - A word has a phoneme when a stored phoneme has the word as its parent.
 * - A mark is short when the snap of its stored start and end times gives less than one frame size.
 *   A stored time before 0 counts as 0, as in `buildTracks`.
 *   `buildTracks` extends such a mark to one frame size, so the output alone does not show it.
 * - A mark ends after the song when its time in the output ends after `song.durationMs`.
 *
 * Each message names the label and the time of the mark in the output.
 *
 * @param tracks The timing tracks from `buildTracks`.
 * @param song The song. `song.frameMs` gives the frame size and `song.durationMs` the end.
 * @param voices The voices of the song. The messages use their names.
 * @param marks The stored marks that `buildTracks` received. `ExportMark.markId` finds each one.
 * @param options The export options. The check reads `options.voiceIds`.
 */
export function checkTracks(
  tracks: readonly ExportTrack[],
  song: Song,
  voices: readonly Voice[],
  marks: readonly Mark[],
  options: ExportOptions,
): Finding[] {
  const voiceName = (voiceId: string | undefined): string =>
    voices.find((voice) => voice.id === voiceId)?.name ?? voiceId ?? ''
  const storedById = new Map(marks.map((mark) => [mark.id, mark]))
  const wordsWithPhoneme = new Set(
    marks.filter((mark) => mark.layer === 'phoneme').map((mark) => mark.parentId),
  )

  const findings = [
    ...voiceFindings(tracks, options.voiceIds, voiceName),
    ...nameFindings(tracks, voiceName),
    ...importNameFindings(tracks),
  ]
  for (const track of tracks) {
    const [phrases, words, phonemes] = track.layers
    for (const mark of [...phrases, ...words, ...phonemes]) {
      const stored = mark.markId === undefined ? undefined : storedById.get(mark.markId)
      findings.push(...timeFindings(track, mark, stored, song))
    }
    for (const mark of phonemes) {
      if (!PHONEME_LABEL_SET.has(mark.label)) {
        findings.push(finding('error', 'bad-phoneme-label', track, mark, 'is not a phoneme label.'))
      }
    }
    for (const word of words) findings.push(...wordFindings(track, word, wordsWithPhoneme))
  }

  return [
    ...findings.filter((item) => item.type === 'error'),
    ...findings.filter((item) => item.type === 'warning'),
  ]
}

function voiceFindings(
  tracks: readonly ExportTrack[],
  voiceIds: readonly string[],
  voiceName: (voiceId: string) => string,
): Finding[] {
  return voiceIds
    .filter(
      (voiceId) =>
        !tracks.some(
          (track) => track.voiceId === voiceId && track.layers.some((layer) => layer.length > 0),
        ),
    )
    .map((voiceId) => ({
      type: 'error',
      check: 'voice-no-marks',
      message: `“${voiceName(voiceId)}” has no marks.`,
      voiceId,
    }))
}

function nameFindings(
  tracks: readonly ExportTrack[],
  voiceName: (voiceId: string | undefined) => string,
): Finding[] {
  const findings: Finding[] = []
  const seenNames = new Set<string>()
  for (const track of tracks) {
    if (track.name.trim() === '') {
      findings.push({
        type: 'error',
        check: 'empty-name',
        message: `A timing track of “${voiceName(track.voiceId)}” has no name.`,
        voiceId: track.voiceId,
      })
    } else if (seenNames.has(track.name)) {
      findings.push({
        type: 'error',
        check: 'duplicate-name',
        message: `Two timing tracks have the name “${track.name}”.`,
        voiceId: track.voiceId,
      })
    }
    seenNames.add(track.name)
  }
  return findings
}

/**
 * Returns the findings about the name changes of the xLights import.
 * A name that is empty or a duplicate before the import has its own finding, so these checks skip it.
 */
function importNameFindings(tracks: readonly ExportTrack[]): Finding[] {
  const findings: Finding[] = []
  // The key is the name after the import. The value is the first name in the file that gives it.
  const firstByName = new Map<string, string>()
  for (const track of tracks) {
    if (track.name.trim() === '') continue
    const after = nameAfterImport(track.name)
    const { voiceId } = track
    if (after.trim() === '') {
      findings.push({
        type: 'error',
        check: 'import-name-empty',
        message: `xLights cannot use the timing track name “${track.name}”. Use letters from A to Z, digits or spaces.`,
        voiceId,
      })
      continue
    }
    if (after !== track.name) {
      findings.push({
        type: 'warning',
        check: 'import-name-changed',
        message: `xLights shows the timing track “${track.name}” as “${after}”. xLights removes = < > & " ' and characters that are not ASCII from a name.`,
        voiceId,
      })
    }
    const first = firstByName.get(after)
    if (first === undefined) firstByName.set(after, track.name)
    else if (first !== track.name) {
      findings.push({
        type: 'warning',
        check: 'import-name-same',
        message: `xLights gives these timing tracks almost the same name: “${after}” and “${after}_1”. Change a voice name or a section name.`,
        voiceId,
      })
    }
  }
  return findings
}

function timeFindings(
  track: ExportTrack,
  mark: ExportMark,
  stored: Mark | undefined,
  song: Song,
): Finding[] {
  const findings: Finding[] = []
  if (mark.endMs <= mark.startMs || (stored !== undefined && stored.endMs <= stored.startMs)) {
    findings.push(
      finding('error', 'end-not-after-start', track, mark, 'ends at or before its start.'),
    )
  } else if (
    stored !== undefined &&
    Math.max(snap(stored.endMs, song.frameMs), 0) -
      Math.max(snap(stored.startMs, song.frameMs), 0) <
      song.frameMs
  ) {
    findings.push(
      finding(
        'warning',
        'short-mark',
        track,
        mark,
        'is shorter than one frame. The export makes it one frame long.',
      ),
    )
  }
  if (mark.endMs > song.durationMs) {
    findings.push(
      finding('warning', 'ends-after-song', track, mark, 'ends after the end of the song.'),
    )
  }
  return findings
}

function wordFindings(
  track: ExportTrack,
  word: ExportMark,
  wordsWithPhoneme: ReadonlySet<string | null>,
): Finding[] {
  const findings: Finding[] = []
  if (word.markId === undefined || !wordsWithPhoneme.has(word.markId)) {
    findings.push(finding('warning', 'word-no-phoneme', track, word, 'has no phoneme.'))
  }
  if (word.unknown === true) {
    findings.push(
      finding(
        'warning',
        'unknown-word',
        track,
        word,
        'is an unknown word. Its phonemes are a guess.',
      ),
    )
  }
  if (word.estimated === true) {
    findings.push(finding('warning', 'estimated-word', track, word, 'has an estimated time.'))
  }
  return findings
}

function finding(
  type: Finding['type'],
  check: string,
  track: ExportTrack,
  mark: ExportMark,
  text: string,
): Finding {
  return {
    type,
    check,
    message: `“${mark.label}” at ${formatTime(mark.startMs)} ${text}`,
    markId: mark.markId,
    voiceId: track.voiceId,
  }
}

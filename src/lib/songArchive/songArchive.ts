import {
  writeCustomDictionary,
  type CustomDictionaryLine,
} from '../dictionary/customDictionaryFile.ts'
import { exportFiles } from '../xtiming/exportFiles.ts'
import type { ExportOptions, ExportTrack } from '../xtiming/types.ts'
import { importStepsText } from '../xtiming/importSteps.ts'
import { entryPath, safeEntryName, uniquePathMaker } from '../zip/entryNames.ts'
import type { ZipEntry } from '../zip/writeZip.ts'
import type { SongContent } from '../../store/types.ts'
import { lyricsText } from './lyricsText.ts'
import { songJson } from './songJson.ts'

/** One file that a caller adds to the zip file of a song, with the line that `README.txt` shows for it. */
export interface ArchiveFile {
  /** The folder of the file, for example `tracks`. `null` for the top of the zip file. */
  folder: string | null
  /** The file name. `safeEntryName` makes it legal. */
  fileName: string
  /** One sentence for `README.txt` that states what the file is. */
  description: string
  /** The bytes of the file. */
  data: Uint8Array<ArrayBuffer>
}

/** The input of `songArchiveEntries`. */
export interface SongArchiveInput {
  /** The song with its voices, sections and marks. */
  content: SongContent
  /** The timing tracks from `buildTracks`. `exportFiles` writes them into `timing/`, so the bytes match a normal export. */
  tracks: ExportTrack[]
  /** The packaging of the export options. With `file-per-track`, `timing/` also gets `<song name> - all.xtiming`. */
  packaging: ExportOptions['packaging']
  /** The audio file of the song: its original name and bytes. They go into `audio/`. */
  audio: { fileName: string; data: Uint8Array<ArrayBuffer> }
  /** The custom entries. With no entry, the zip file has no `custom-dictionary.txt`. */
  customEntries: readonly CustomDictionaryLine[]
  /**
   * More files for the zip file. Issue #129 adds the separated tracks `tracks/vocals.wav` and
   * `tracks/instruments.wav`, and the run report `report.txt`. They go after the files of the song and before `README.txt`.
   */
  extraFiles: readonly ArchiveFile[]
  /** The date and time of each entry. */
  modified: Date
}

const encoder = new TextEncoder()

/**
 * Returns the name of the zip file of a song: `<song name>.zip` with the unsafe characters replaced.
 * @param songName The name of the song.
 */
export function songArchiveName(songName: string): string {
  return safeEntryName(`${songName}.zip`)
}

function textFile(folder: string | null, fileName: string, description: string, text: string) {
  return { folder, fileName, description, data: encoder.encode(text) }
}

function timingFiles({ tracks, content, packaging }: SongArchiveInput): ArchiveFile[] {
  const songName = content.song.name
  const files = exportFiles(tracks, songName, packaging).map((file) =>
    textFile('timing', file.name, 'A timing file for xLights.', file.text),
  )
  if (packaging === 'one-file') return files
  const all = exportFiles(tracks, songName, 'one-file').map((file) =>
    textFile(
      'timing',
      `${songName} - all.xtiming`,
      'A timing file for xLights with all timing tracks.',
      file.text,
    ),
  )
  return [...files, ...all]
}

function songFiles(input: SongArchiveInput): ArchiveFile[] {
  const { content } = input
  const lyrics = lyricsText(content.voices, content.marks)
  return [
    ...timingFiles(input),
    {
      folder: 'audio',
      fileName: input.audio.fileName,
      description: 'The audio file of the song, with its original bytes.',
      data: input.audio.data,
    },
    textFile(
      null,
      'song.json',
      'The song, the voices, the sections and the marks, for backup and for other programs. The app does not import this file.',
      songJson(content),
    ),
    ...(lyrics === ''
      ? []
      : [textFile(null, 'lyrics.txt', 'The phrases of each voice as text.', lyrics)]),
    ...(input.customEntries.length === 0
      ? []
      : [
          textFile(
            null,
            'custom-dictionary.txt',
            'The custom dictionary, in the format of its export.',
            writeCustomDictionary(input.customEntries),
          ),
        ]),
    ...input.extraFiles,
  ]
}

function readmeText(songName: string, lines: readonly string[], frameMs: number): string {
  return [
    `Singing Face Timing: ${songName}`,
    '',
    'This zip file holds these files:',
    ...lines,
    '',
    'To import a timing file into xLights, do these steps. The app shows the same steps after an export.',
    importStepsText(frameMs),
    '',
  ].join('\n')
}

/**
 * Returns the entries of the zip file of a song, in this order:
 * 1. The `.xtiming` files in `timing/`, then the file with all timing tracks.
 * 2. The audio file in `audio/`.
 * 3. `song.json`, then `lyrics.txt` when a voice has a phrase.
 * 4. `custom-dictionary.txt` when the custom dictionary has an entry.
 * 5. The extra files of the caller.
 * 6. `README.txt`, with one line for each entry of this zip file and the xLights import steps.
 *
 * Each path is legal and unique in the zip file.
 * @param input The files of the song. See `SongArchiveInput`.
 */
export function songArchiveEntries(input: SongArchiveInput): ZipEntry[] {
  const unique = uniquePathMaker()
  const entries = songFiles(input).map((file) => ({
    name: unique(entryPath(file.folder, file.fileName)),
    description: file.description,
    data: file.data,
    modified: input.modified,
  }))
  const readmeName = unique('README.txt')
  const lines = [
    ...entries.map((entry) => `- ${entry.name}: ${entry.description}`),
    `- ${readmeName}: This file: the list of the files and the xLights import steps.`,
  ]
  const { song } = input.content
  const readme = encoder.encode(readmeText(song.name, lines, song.frameMs))
  return [
    ...entries.map(({ name, data, modified }) => ({ name, data, modified })),
    { name: readmeName, data: readme, modified: input.modified },
  ]
}

import type { PcmTrack } from '../../lib/audio/pcm.ts'
import { runArchiveFiles, trackWavBytes } from '../../lib/songArchive/runFiles.ts'
import { songArchiveEntries, songArchiveName } from '../../lib/songArchive/songArchive.ts'
import type { ExportOptions, ExportTrack } from '../../lib/xtiming/types.ts'
import { writeZip, zipLength } from '../../lib/zip/writeZip.ts'
import { formatMegabytes } from '../audio-import/libraryFormat.ts'
import type { SongContent } from '../../store/types.ts'
import {
  AUDIO_READ_MESSAGE,
  RUN_DATA_READ_MESSAGE,
  type ZipSource,
  type ZipSourceState,
} from './useZipSource.ts'

/** The zip file that the dialog gives to the browser. */
export type ZipDownload = { name: string; blob: Blob }

/** The export that the zip file holds: the song, its timing tracks and the packaging. */
export type ZipExport = {
  content: SongContent
  tracks: ExportTrack[]
  packaging: ExportOptions['packaging']
}

const BYTES_PER_KB = 1024

// A text-only song is a few KB, and "0.0 MB" would hide its size.
function formatSize(bytes: number): string {
  const kilobytes = bytes / BYTES_PER_KB
  return kilobytes < BYTES_PER_KB
    ? `${Math.max(1, Math.round(kilobytes))} KB`
    : `${formatMegabytes(bytes)} MB`
}

function entries(
  zipExport: ZipExport,
  source: ZipSource,
  audioData: Uint8Array<ArrayBuffer>,
  wav?: (track: PcmTrack) => Uint8Array<ArrayBuffer>,
) {
  return songArchiveEntries({
    ...zipExport,
    audio: { fileName: source.audio.fileName, data: audioData },
    customEntries: source.customEntries,
    extraFiles: runArchiveFiles(source.runData, wav),
    modified: new Date(),
  })
}

/** Returns the bytes of the WAV files of the kept audio tracks of the song, or 0 when the song has none. */
function trackBytes(source: ZipSource): number {
  const tracks = source.runData?.tracks
  if (tracks === undefined) return 0
  const all = [tracks.vocals, tracks.instruments, ...(tracks.split ?? [])]
  return all.reduce((sum, track) => sum + trackWavBytes(track), 0)
}

/**
 * Returns the note under "Everything as one zip file": the entries of the zip file and its size.
 * After a failed read of the run data, the note starts with `RUN_DATA_READ_MESSAGE`, and the list has no track and no report.
 * The note uses the stored length of the audio file and of the audio tracks, so the dialog converts no audio for it.
 * @param zipExport The export that the zip file holds.
 * @param state The state of the read of the audio file and the custom entries.
 */
export function zipNote(zipExport: ZipExport, state: ZipSourceState): string {
  if (state === 'loading') return 'The app reads the audio file of the song.'
  if (state === 'failed') return AUDIO_READ_MESSAGE
  const list = entries(zipExport, state, new Uint8Array(0), () => new Uint8Array(0)).map(
    (entry) => ({
      name: entry.name,
      size: entry.data.length,
    }),
  )
  const size = zipLength(list) + state.audio.byteLength + trackBytes(state)
  const names = list.map((entry) => entry.name).join(', ')
  const note = `The zip file holds ${list.length} files: ${names}. Size: ${formatSize(size)}.`
  return state.runDataUnread === true ? `${RUN_DATA_READ_MESSAGE} ${note}` : note
}

/**
 * Returns the zip file of the song with the audio bytes from storage.
 * The peak memory is two copies of the audio and of each audio track: the bytes that the function makes, and the `Blob`.
 * @param zipExport The export that the zip file holds.
 * @param source The audio file record and the custom entries.
 * Rejects when the browser cannot read the audio bytes. Throws `ZipLimitError` for a zip file that needs ZIP64.
 */
export async function buildSongZip(zipExport: ZipExport, source: ZipSource): Promise<ZipDownload> {
  const audioData = new Uint8Array(await source.audio.data.arrayBuffer())
  const parts = writeZip(entries(zipExport, source, audioData))
  return {
    name: songArchiveName(zipExport.content.song.name),
    blob: new Blob(parts, { type: 'application/zip' }),
  }
}

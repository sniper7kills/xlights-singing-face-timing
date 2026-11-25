import { type PcmTrack, trackToWav, WAV_HEADER_BYTES } from '../audio/pcm.ts'
import { reportToText } from '../runReport/reportText.ts'
import type { RunData } from '../../store/types.ts'
import type { ArchiveFile } from './songArchive.ts'

/** Returns the bytes of the WAV file of a kept audio track, with no conversion. */
export function trackWavBytes(track: PcmTrack): number {
  return WAV_HEADER_BYTES + track.samples.length * 2
}

function trackFile(
  fileName: string,
  name: string,
  track: PcmTrack,
  wav: (track: PcmTrack) => Uint8Array<ArrayBuffer>,
): ArchiveFile {
  return {
    folder: 'tracks',
    fileName,
    description: `The ${name} of the last vocal separation, as 16-bit PCM at ${track.sampleRate} Hz. The first sample is at ${track.startMs} ms of the song.`,
    data: wav(track),
  }
}

/**
 * Returns the files of the last run of a song for its zip file: `tracks/vocals.wav` and `tracks/instruments.wav` when the run kept the tracks, then `report.txt`.
 * A song with no run data gives no file.
 * @param runData The data of the last run of the song.
 * @param wav Returns the bytes of the WAV file of a track. The size note gives empty bytes and counts `trackWavBytes`, so it converts no audio.
 */
export function runArchiveFiles(
  runData: RunData | undefined,
  wav: (track: PcmTrack) => Uint8Array<ArrayBuffer> = trackToWav,
): ArchiveFile[] {
  if (runData === undefined) return []
  const { tracks } = runData
  const trackFiles =
    tracks === undefined
      ? []
      : [
          trackFile('vocals.wav', 'vocals', tracks.vocals, wav),
          trackFile('instruments.wav', 'instruments', tracks.instruments, wav),
        ]
  const report: ArchiveFile = {
    folder: null,
    fileName: 'report.txt',
    description: 'The report of the last transcribe run of the song.',
    data: new TextEncoder().encode(reportToText(runData.report)),
  }
  return [...trackFiles, report]
}

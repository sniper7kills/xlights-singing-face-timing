import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { trackToWav } from '../../lib/audio/pcm.ts'
import { peakLevels, type TrackPeaks } from '../../lib/audio/peaks.ts'
import { audibleRows, playsText, SONG_ROW } from '../../lib/audio/trackMix.ts'
import { useSongStore } from '../../store/songStore.ts'
import {
  openTrackMix,
  setBlockedRows,
  setFolded,
  setShownRows,
  useTrackMixStore,
} from '../../store/trackMixStore.ts'
import { type TrackRow, trackRows } from '../../store/trackRows.ts'
import type { KeptTracks, Mark, Voice } from '../../store/types.ts'
import {
  RUN_DATA_FAILED,
  RUN_DATA_FAILED_NOTE,
  runDataOf,
  useRunData,
} from '../../store/useRunData.ts'
import { usePlayerStore } from './playerStore.ts'
import { RowControls } from './RowControls.tsx'
import { createTrackMixer, type FollowerTrack, type TrackMixer } from './trackMixer.ts'
import { TrackWave } from './TrackWave.tsx'

const SINGER_TOOLTIP = 'This row is the vocals track, limited to the times of this singer.'
const SONG_TOOLTIP = 'This row is the song audio. Its waveform is at the top of the stage.'
/** The line under the heading while the person has not changed a mute or a solo of the song. */
export const START_NOTE = 'The tracks start muted. Select "Solo" on a track to hear it alone.'

const NO_VOICES: readonly Voice[] = []
const NO_MARKS: readonly Mark[] = []

type TrackName = keyof KeptTracks

/**
 * Returns the peaks of each kept track. The app computes one track in each task, so a long song does not block a frame
 * for both tracks. The peaks cover all zoom levels, so a zoom computes nothing.
 */
function useTrackPeaks(tracks: KeptTracks | undefined): Partial<Record<TrackName, TrackPeaks>> {
  const [peaks, setPeaks] = useState<{
    tracks: KeptTracks
    value: Partial<Record<TrackName, TrackPeaks>>
  } | null>(null)
  useEffect(() => {
    if (tracks === undefined) return
    const timers: number[] = []
    for (const name of ['vocals', 'instruments'] as const)
      timers.push(
        window.setTimeout(() => {
          const track = tracks[name]
          const value: TrackPeaks = {
            levels: peakLevels(track.samples),
            sampleRate: track.sampleRate,
            startMs: track.startMs,
            sampleCount: track.samples.length,
          }
          setPeaks((previous) => ({
            tracks,
            value: { ...(previous?.tracks === tracks ? previous.value : {}), [name]: value },
          }))
        }),
      )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [tracks])
  return peaks !== null && peaks.tracks === tracks ? peaks.value : {}
}

/** Returns a Blob URL of a WAV file for each kept track, and revokes the URLs when the tracks change or the rows go. */
function useTrackUrls(tracks: KeptTracks | undefined): Record<TrackName, string> | null {
  const [urls, setUrls] = useState<{ tracks: KeptTracks; value: Record<TrackName, string> } | null>(
    null,
  )
  useEffect(() => {
    if (tracks === undefined) return
    const value = {
      vocals: URL.createObjectURL(new Blob([trackToWav(tracks.vocals)], { type: 'audio/wav' })),
      instruments: URL.createObjectURL(
        new Blob([trackToWav(tracks.instruments)], { type: 'audio/wav' }),
      ),
    }
    setUrls({ tracks, value })
    return () => {
      URL.revokeObjectURL(value.vocals)
      URL.revokeObjectURL(value.instruments)
    }
  }, [tracks])
  return urls !== null && urls.tracks === tracks ? urls.value : null
}

/** Returns the follower of each row that has a mounted audio element. */
function followersOf(
  rows: readonly TrackRow[],
  tracks: KeptTracks,
  elements: ReadonlyMap<string, HTMLAudioElement>,
): FollowerTrack[] {
  return rows.flatMap((row) => {
    const media = elements.get(row.id)
    const track = tracks[row.track]
    return media === undefined
      ? []
      : [
          {
            rowId: row.id,
            media,
            startMs: track.startMs,
            durationMs: (track.samples.length / track.sampleRate) * 1000,
            gate: row.gate,
          },
        ]
  })
}

/**
 * Connects the audio element of each row to the song audio, and sets the rows that sound.
 * One mixer lives as long as the song audio, so a change of the rows never unmutes the song audio or restarts a track.
 * The mixer records the rows whose play the browser refused in the track mix store.
 * Returns the handler of a click on "Mute" or "Solo" of a row.
 */
function useMixer(
  rows: readonly TrackRow[],
  tracks: KeptTracks | undefined,
  urls: Record<TrackName, string> | null,
  elements: Map<string, HTMLAudioElement>,
) {
  const leader = usePlayerStore((state) => state.player?.media)
  const mix = useTrackMixStore()
  const mixer = useRef<TrackMixer | null>(null)
  const rowIds = useMemo(() => [SONG_ROW, ...rows.map((row) => row.id)], [rows])

  useEffect(() => {
    if (leader === undefined) return
    const created = createTrackMixer(leader, {
      songRowId: SONG_ROW,
      onBlockedChange: setBlockedRows,
    })
    mixer.current = created
    return () => {
      created.destroy()
      mixer.current = null
      setBlockedRows([])
    }
  }, [leader])

  // This effect runs after the effect above in the same commit, so a new mixer gets its rows before any sound.
  useEffect(() => {
    const followers =
      tracks === undefined || urls === null ? [] : followersOf(rows, tracks, elements)
    // With no row, the editor shows no "Song" controls, so the song audio sounds.
    const audible = rows.length === 0 ? new Set([SONG_ROW]) : audibleRows(mix, rowIds)
    mixer.current?.update(followers, audible)
  }, [leader, rows, tracks, urls, elements, mix, rowIds])

  const activate = useCallback(
    (rowId: string) =>
      mixer.current?.activate(rowId, audibleRows(useTrackMixStore.getState(), rowIds)),
    [rowIds],
  )
  return activate
}

/**
 * Returns the rows of the last render while the rows have the same content.
 * Each edit of a mark gives new marks. Rows with the same content keep their identity, so the canvases and the mixer do no extra work.
 */
function useSameRows(rows: TrackRow[]): TrackRow[] {
  const [kept, setKept] = useState({ key: JSON.stringify(rows), rows })
  const key = JSON.stringify(rows)
  if (key === kept.key) return kept.rows
  setKept({ key, rows })
  return rows
}

/** Shows the fold button "Audio tracks", the rows that sound, and the start note while the mix has no choice of the person. */
function TrackHeading() {
  const folded = useTrackMixStore((state) => state.folded)
  const plays = useTrackMixStore(playsText)
  const untouched = useTrackMixStore(
    (state) => Object.keys(state.muted).length === 0 && state.soloed.length === 0,
  )
  return (
    <>
      <div className="track-heading">
        <button
          type="button"
          className="track-fold"
          aria-expanded={!folded}
          onClick={() => setFolded(!folded)}
        >
          <span aria-hidden="true">{folded ? '▸' : '▾'}</span> Audio tracks
        </button>
        <span className="track-plays" data-testid="track-plays">
          — {plays}
        </span>
      </div>
      {untouched && <p className="track-note">{START_NOTE}</p>}
    </>
  )
}

/** Returns the rows of the store: the "Song" row first, then each track row. No track row gives no row. */
function namedRows(rows: readonly TrackRow[]) {
  if (rows.length === 0) return []
  return [{ id: SONG_ROW, name: 'Song' }, ...rows.map(({ id, name }) => ({ id, name }))]
}

type TrackRowsProps = {
  songId: string
  /** The duration of the song in milliseconds. The time scale of the stage uses it. */
  durationMs: number
}

/**
 * Shows the group "Audio tracks": the "Song" row, and one row for each kept audio track and for each singer voice of the last run.
 * Each row has its name, whether it sounds now, "Mute" and "Solo" on a line above its waveform.
 * The waveform has the width of the stage, so it stays on the time scale of the time ruler.
 * The audio of each row plays in time with the song audio (ADR 0010).
 * A song with no kept audio tracks shows nothing. A failed read of the run data shows one line with the cause.
 * The memo keeps the rows out of the render of the waveform region on each play time.
 */
export const TrackRows = memo(function TrackRows({ songId, durationMs }: TrackRowsProps) {
  const read = useRunData(songId)
  const data = runDataOf(read)
  const voices = useSongStore((state) => state.current?.voices) ?? NO_VOICES
  const marks = useSongStore((state) => state.current?.marks) ?? NO_MARKS
  const folded = useTrackMixStore((state) => state.folded)
  const blocked = useTrackMixStore((state) => state.blocked)
  const tracks = data?.tracks
  const rows = useSameRows(trackRows(data, voices, marks))
  const peaks = useTrackPeaks(tracks)
  const urls = useTrackUrls(tracks)
  // The map keeps its identity, so the mixer gets an update only for new rows or new tracks.
  const elements = useRef(new Map<string, HTMLAudioElement>()).current
  const activate = useMixer(rows, tracks, urls, elements)

  useEffect(() => openTrackMix(songId), [songId])
  useEffect(() => {
    setShownRows(namedRows(rows))
    return () => setShownRows([])
  }, [rows])

  if (read === RUN_DATA_FAILED)
    return (
      <p className="message track-failed" role="alert">
        {RUN_DATA_FAILED_NOTE}
      </p>
    )
  if (rows.length === 0) return null
  return (
    <div className="track-rows" role="group" aria-label="Audio tracks">
      <TrackHeading />
      <div className="track-list" hidden={folded}>
        <div className="track-row track-row-song" data-row={SONG_ROW}>
          <RowControls rowId={SONG_ROW} name="Song" tooltip={SONG_TOOLTIP} onToggle={activate} />
        </div>
        {rows.map((row) => (
          <div key={row.id} className="track-row" data-row={row.id}>
            <RowControls
              rowId={row.id}
              name={row.name}
              tooltip={row.gate === null ? undefined : SINGER_TOOLTIP}
              onToggle={activate}
            />
            <TrackWave
              peaks={peaks[row.track]}
              gate={row.gate}
              color={row.color}
              durationMs={durationMs}
            />
          </div>
        ))}
      </div>
      {rows
        .filter((row) => blocked.includes(row.id))
        .map((row) => (
          <p key={row.id} className="message" role="alert">
            The browser did not start the sound of {row.name}. Select "Mute" and then "Solo" on the
            row again.
          </p>
        ))}
      {urls !== null &&
        rows.map((row) => (
          <audio
            key={row.id}
            ref={(element) => {
              if (element === null) elements.delete(row.id)
              else elements.set(row.id, element)
            }}
            data-audio-row={row.id}
            src={urls[row.track]}
            preload="auto"
          />
        ))}
    </div>
  )
})

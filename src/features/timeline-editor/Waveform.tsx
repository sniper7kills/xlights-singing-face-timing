import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTime } from '../../lib/time/formatTime.ts'
import { getAudioFile, putRecord, StorageFullError } from '../../store/db.ts'
import { useViewStore } from '../../store/viewStore.ts'
import {
  ACCEPTED_EXTENSIONS,
  ImportError,
  isAcceptedAudioFile,
} from '../audio-import/createSongFromFile.ts'
import { createWaveformPlayer, type WaveformColors, type WaveformPlayer } from './waveformPlayer.ts'

type WaveformState = 'loading' | 'ready' | 'missing' | 'error'

type WaveformProps = {
  songId: string
}

// A focused control uses the space bar itself, so a toggle here would apply the key two times.
const CONTROL_SELECTOR = 'input, textarea, select, button, a[href], [contenteditable]'

function readColors(element: HTMLElement): WaveformColors {
  // wavesurfer.js draws on a canvas, so it needs the colour values and not the CSS variables.
  const style = getComputedStyle(element)
  return {
    wave: style.getPropertyValue('--wave').trim(),
    progress: style.getPropertyValue('--wave-hi').trim(),
  }
}

function isSpaceForPlay(event: KeyboardEvent): boolean {
  if (event.key !== ' ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
    return false
  }
  return !(event.target instanceof Element && event.target.closest(CONTROL_SELECTOR))
}

/**
 * Shows the waveform region of the editor: the waveform of the song, a play button and
 * the play time. If the song has no audio file, it asks the person for the file again.
 */
export function Waveform({ songId }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const playerRef = useRef<WaveformPlayer | null>(null)
  const [state, setState] = useState<WaveformState>('loading')
  const [playing, setPlaying] = useState(false)
  const [fileMessage, setFileMessage] = useState<string | null>(null)
  // A new audio file for a song without one starts the load again.
  const [loadCount, setLoadCount] = useState(0)
  const playTimeMs = useViewStore((view) => view.playTimeMs)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let player: WaveformPlayer | undefined

    async function load(element: HTMLElement) {
      const audioFile = await getAudioFile(songId)
      if (cancelled) return
      if (!audioFile) {
        setState('missing')
        return
      }
      const created = await createWaveformPlayer(element, audioFile.data, readColors(element), {
        onTime: (ms) => useViewStore.getState().setPlayTime(ms),
        onPlayChange: setPlaying,
      })
      if (cancelled) {
        created.destroy()
        return
      }
      player = created
      playerRef.current = created
      setState('ready')
    }

    load(container).catch(() => {
      if (!cancelled) setState('error')
    })
    return () => {
      cancelled = true
      player?.destroy()
      playerRef.current = null
      setPlaying(false)
    }
  }, [songId, loadCount])

  useEffect(() => {
    const player = playerRef.current
    const container = containerRef.current
    if (state !== 'ready' || !player || !container) return
    // The theme switch and the system colour scheme both change this attribute.
    const observer = new MutationObserver(() => player.setColors(readColors(container)))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [state])

  const togglePlay = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    if (player.isPlaying()) player.pause()
    else void player.play()
  }, [])

  useEffect(() => {
    if (state !== 'ready') return
    function onKeyDown(event: KeyboardEvent) {
      if (!isSpaceForPlay(event)) return
      // The space bar scrolls the page unless the editor cancels the event.
      event.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, togglePlay])

  async function storeAudioFile(file: File) {
    if (!isAcceptedAudioFile(file)) {
      setFileMessage(new ImportError({ kind: 'type' }).message)
      return
    }
    try {
      await putRecord('audioFiles', {
        songId,
        data: file,
        fileName: file.name,
        mimeType: file.type,
        byteLength: file.size,
      })
    } catch (error) {
      if (!(error instanceof StorageFullError)) throw error
      setFileMessage(error.message)
      return
    }
    setFileMessage(null)
    setState('loading')
    setLoadCount((count) => count + 1)
  }

  const ready = state === 'ready'
  return (
    <section className="waveform-region" aria-label="Waveform" data-state={state}>
      {state === 'missing' && (
        <div className="message waveform-missing" role="alert">
          <p>The audio for this song is missing. Load the file again.</p>
          <input
            ref={inputRef}
            type="file"
            hidden
            aria-label="Audio file"
            accept={['audio/*', ...ACCEPTED_EXTENSIONS].join(',')}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              // A second selection of the same file must fire change again.
              event.currentTarget.value = ''
              if (file) void storeAudioFile(file)
            }}
          />
          <button type="button" className="button" onClick={() => inputRef.current?.click()}>
            Load the audio file
          </button>
          {fileMessage && <p>{fileMessage}</p>}
        </div>
      )}
      {state === 'error' && (
        <p className="message" role="alert">
          This browser cannot decode this file. Convert it to MP3 or WAV and try again.
        </p>
      )}
      <div className="waveform-stage" hidden={state === 'missing' || state === 'error'}>
        {/* wavesurfer.js measures the container, so the container stays in the layout while it loads. */}
        <div ref={containerRef} className="waveform" />
        {state === 'loading' && (
          <div className="waveform-skeleton" role="status">
            Drawing waveform
          </div>
        )}
      </div>
      <div className="transport">
        <button
          type="button"
          className="play"
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={!ready}
          onClick={togglePlay}
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </button>
        <output className="play-time" aria-label="Play time">
          {formatTime(playTimeMs)}
        </output>
      </div>
    </section>
  )
}

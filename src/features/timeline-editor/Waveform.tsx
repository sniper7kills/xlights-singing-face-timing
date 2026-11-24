import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { formatTime } from '../../lib/time/formatTime.ts'
import { getAudioFile, putRecord, StorageFullError } from '../../store/db.ts'
import { useViewStore } from '../../store/viewStore.ts'
import {
  ACCEPTED_EXTENSIONS,
  checkAudioFile,
  ImportError,
} from '../audio-import/createSongFromFile.ts'
import { pauseOnRefusal } from './playerStore.ts'
import { PlayCursor } from './PlayCursor.tsx'
import { TimeRuler } from './TimeRuler.tsx'
import { TimeSelection } from './TimeSelection.tsx'
import {
  followCursor,
  makeTimeScale,
  rangeBetweenPx,
  scrollByPx,
  timeAtPx,
  wheelZoom,
} from './timeScale.ts'
import { currentStageInput, useStageScale } from './useStageScale.ts'
import { createWaveformPlayer, type WaveformColors, type WaveformPlayer } from './waveformPlayer.ts'

type WaveformState = 'loading' | 'ready' | 'missing' | 'error'

type WaveformProps = {
  songId: string
  /** The duration of the song in milliseconds. The time scale of the stage uses it. */
  durationMs: number
  /** The layers. They show between the waveform and the transport, also without audio. */
  children?: ReactNode
}

/** A pointer that moves less than this distance between press and release makes a click, not a drag. */
const DRAG_THRESHOLD_PX = 3

/** A wheel event in lines (`deltaMode` 1) moves about this many pixels for each line. */
const PX_PER_WHEEL_LINE = 16

const STORAGE_READ_MESSAGE =
  'The app could not read the audio from browser storage. Reload the page.'

function readColors(element: HTMLElement): WaveformColors {
  // wavesurfer.js draws on a canvas, so it needs the colour values and not the CSS variables.
  const style = getComputedStyle(element)
  return {
    wave: style.getPropertyValue('--wave').trim(),
    progress: style.getPropertyValue('--wave-hi').trim(),
  }
}

/**
 * Shows the waveform region of the editor: the stage and the transport.
 * The stage holds the time ruler, the waveform of the song, the children, the time selection
 * and the play cursor, on one time scale. The transport holds a play button and the play time.
 * If the song has no audio file, it asks the person for the file again.
 */
export function Waveform({ songId, durationMs, children }: WaveformProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ fromPx: number; moved: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const playerRef = useRef<WaveformPlayer | null>(null)
  const [state, setState] = useState<WaveformState>('loading')
  const [playing, setPlaying] = useState(false)
  const [loadMessage, setLoadMessage] = useState<string | null>(null)
  const [fileMessage, setFileMessage] = useState<string | null>(null)
  // A new audio file for a song without one starts the load again.
  const [loadCount, setLoadCount] = useState(0)
  const playTimeMs = useViewStore((view) => view.playTimeMs)
  const { input, scale } = useStageScale(durationMs)

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const update = () => useViewStore.getState().setStageWidth(stage.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

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

    load(container).catch((error: unknown) => {
      if (cancelled) return
      setLoadMessage(error instanceof ImportError ? error.message : STORAGE_READ_MESSAGE)
      setState('error')
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

  useEffect(() => {
    if (state !== 'ready') return
    playerRef.current?.setView(input.pxPerSecond, scale.scrollMs)
  }, [state, input.pxPerSecond, scale.scrollMs])

  useEffect(() => {
    if (!playing) return
    return useViewStore.subscribe((view, previous) => {
      if (view.playTimeMs === previous.playTimeMs) return
      const scrollMs = followCursor(currentStageInput(durationMs), view.playTimeMs)
      if (scrollMs !== null) view.setScroll(scrollMs)
    })
  }, [playing, durationMs])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      const view = useViewStore.getState()
      const stageInput = currentStageInput(durationMs)
      const lineScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? PX_PER_WHEEL_LINE : 1
      if (event.ctrlKey || event.metaKey) {
        // Without this call, Ctrl with the wheel also zooms the page.
        event.preventDefault()
        const pointerPx = event.clientX - stage.getBoundingClientRect().left
        const next = wheelZoom(stageInput, event.deltaY * lineScale, pointerPx)
        view.setZoom(next.pxPerSecond)
        view.setScroll(next.scrollMs)
        return
      }
      // At the default zoom the full song is in view, so the wheel scrolls the page.
      if (stageInput.pxPerSecond === null) return
      event.preventDefault()
      const deltaPx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      view.setScroll(scrollByPx(stageInput, deltaPx * lineScale))
    }
    // React adds a passive wheel listener, and a passive listener cannot cancel the page scroll.
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [durationMs])

  const seek = useCallback((ms: number) => {
    // The play cursor moves also without audio, so the person can place it before a load.
    useViewStore.getState().setPlayTime(ms)
    playerRef.current?.seek(ms)
  }, [])

  function pointerPx(event: PointerEvent<HTMLElement>): number {
    return event.clientX - event.currentTarget.getBoundingClientRect().left
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    dragRef.current = { fromPx: pointerPx(event), moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (drag === null) return
    const toPx = pointerPx(event)
    if (Math.abs(toPx - drag.fromPx) >= DRAG_THRESHOLD_PX) drag.moved = true
    if (!drag.moved) return
    const scaleNow = makeTimeScale(currentStageInput(durationMs))
    const range = rangeBetweenPx(scaleNow, drag.fromPx, toPx, durationMs)
    // A drag past the song end on both sides gives an empty range, which is no selection.
    useViewStore.getState().setSelection(range.endMs > range.startMs ? range : null)
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (drag === null || drag.moved) return
    useViewStore.getState().setSelection(null)
    seek(timeAtPx(makeTimeScale(currentStageInput(durationMs)), pointerPx(event), durationMs))
  }

  const togglePlay = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    if (player.isPlaying()) player.pause()
    else pauseOnRefusal(player, player.play())
  }, [])

  async function storeAudioFile(file: File) {
    try {
      await checkAudioFile(file)
      await putRecord('audioFiles', {
        songId,
        data: file,
        fileName: file.name,
        mimeType: file.type,
        byteLength: file.size,
      })
    } catch (error) {
      setFileMessage(
        error instanceof ImportError || error instanceof StorageFullError
          ? error.message
          : STORAGE_READ_MESSAGE,
      )
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
          {loadMessage}
        </p>
      )}
      <div ref={stageRef} className="stage">
        <TimeRuler durationMs={durationMs} onSeek={seek} />
        <div
          className="waveform-stage"
          data-testid="waveform-stage"
          hidden={state === 'missing' || state === 'error'}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => {
            dragRef.current = null
          }}
        >
          {/* wavesurfer.js measures the container, so the container stays in the layout while it loads. */}
          <div ref={containerRef} className="waveform" />
          {state === 'loading' && (
            <div className="waveform-skeleton" role="status">
              Drawing waveform
            </div>
          )}
        </div>
        {children}
        <TimeSelection durationMs={durationMs} />
        <PlayCursor durationMs={durationMs} />
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

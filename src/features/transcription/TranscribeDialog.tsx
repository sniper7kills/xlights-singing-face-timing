import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from 'react'
import { keepFocusInside, tabStops } from '../../app/modalFocus.ts'
import { formatTime } from '../../lib/time/formatTime.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from '../../store/settings.ts'
import { chooseDevice } from './device.ts'
import { parseLyrics } from './phrases.ts'
import { type Device, SPEECH_MODELS } from './protocol.ts'
import {
  type RunStage,
  runTranscription,
  type TranscribeMode,
  type TranscribeOutcome,
  type TranscribeRequest,
} from './runTranscription.ts'
import {
  createTranscribeClient,
  type DeviceChangeReason,
  type TranscribeClient,
} from './transcribeClient.ts'
import {
  type DialogEvent,
  type DialogState,
  deviceLine,
  downloadPercent,
  IDLE,
  isActive,
  isCancel,
  isRunState,
  lowMatchMessage,
  progressText,
  progressValue,
  type RunSpeed,
  runSpeed,
  shownRunState,
  showsElapsed,
  SLOW_GPU_MESSAGE,
  stateLabel,
  transcribeDialogReducer,
} from './transcribeDialogState.ts'

const DEVICE_NOTE: Record<Device, string> = {
  webgpu: 'Uses your graphics card (WebGPU)',
  wasm: 'WebGPU is not available. Transcription is slower on this browser.',
}

type TranscribeDialogProps = {
  /** The voice that receives the marks. */
  voiceId: string
  /** The duration of the song. */
  // TODO(#91): Remove the prop after #30 merges. The progress text reads the audio time from the run since #91, and EditorPage.tsx belongs to #30.
  durationMs: number
  /** The time selection of the editor. Without one, the dialog offers the full song only. */
  selection: TimeRange | null
  /** Receives true when a run starts and false when it stops. */
  onActiveChange: (active: boolean) => void
  /** Closes the dialog for "Close" and Escape. */
  onClose: () => void
  /** Receives the counts of a run that ends well. The parent closes the dialog and shows the toast. */
  onDone: (outcome: TranscribeOutcome) => void
}

/**
 * Shows the transcribe dialog: the speech model, the lyrics, the range, the progress and the buttons.
 * The dialog is modal and keeps the focus inside it until it closes.
 */
export function TranscribeDialog({
  voiceId,
  selection,
  onActiveChange,
  onClose,
  onDone,
}: TranscribeDialogProps) {
  const titleId = useId()
  const hintId = useId()
  const [speechModelId, setSpeechModelId] = useState(DEFAULT_SETTINGS.speechModelId)
  const [lyrics, setLyrics] = useState('')
  const [lyricsOnly, setLyricsOnly] = useState(false)
  const [range, setRange] = useState<TimeRange | undefined>(undefined)
  const dialogRef = useRef<HTMLDivElement>(null)
  const run = useTranscribeRun(onDone)
  const { state } = run
  const active = isActive(state)
  const meter = active ? run.meter : null
  // Lyrics with no word, such as one "[Chorus]" line, give no phrase, so they count as no lyrics.
  const hasLyrics = parseLyrics(lyrics).length > 0
  const needsLyrics = lyricsOnly && !hasLyrics

  useEffect(() => {
    let mounted = true
    void loadSettings().then((settings) => {
      if (mounted && SPEECH_MODELS.some((model) => model.id === settings.speechModelId))
        setSpeechModelId(settings.speechModelId)
    })
    if (dialogRef.current !== null) tabStops(dialogRef.current)[0]?.focus()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => onActiveChange(active), [active, onActiveChange])

  useEffect(() => {
    // A state change removes the button that had the focus, so the focus goes to the next action.
    const dialog = dialogRef.current
    if (dialog === null || dialog.contains(document.activeElement)) return
    dialog.querySelector<HTMLElement>('.dialog-actions button:not(:disabled)')?.focus()
  }, [state.status])

  function selectSpeechModel(id: string) {
    setSpeechModelId(id)
    // The choice applies to this run even when the browser storage is full.
    void updateSettings({ speechModelId: id }).catch(() => undefined)
  }

  function start() {
    void run.start({
      voiceId,
      speechModelId,
      mode: lyricsOnly ? 'lyrics-only' : 'model',
      lyrics: hasLyrics ? lyrics : undefined,
      range,
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !active) {
      event.stopPropagation()
      onClose()
    } else if (
      event.key === 'Escape' &&
      (state.status === 'confirm-replace' || state.status === 'low-match')
    ) {
      event.stopPropagation()
      run.answer(false)
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  function keepFocus(event: MouseEvent<HTMLDivElement>) {
    // A press on the backdrop moves the focus to the page, and the space bar then toggles play.
    if (event.target === event.currentTarget) event.preventDefault()
  }

  return (
    <div className="modal-backdrop" onMouseDown={keepFocus}>
      <div
        ref={dialogRef}
        className="dialog transcribe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h3 id={titleId}>Transcribe</h3>
        <fieldset className="dialog-fields" disabled={active}>
          <fieldset className="choice-group" disabled={lyricsOnly}>
            <legend>Speech model</legend>
            {SPEECH_MODELS.map((model) => (
              <label key={model.id} className="choice">
                <input
                  type="radio"
                  name="speech-model"
                  value={model.id}
                  checked={speechModelId === model.id}
                  onChange={() => selectSpeechModel(model.id)}
                />
                {model.label} <span className="choice-size">{model.downloadMb} MB</span>
              </label>
            ))}
          </fieldset>
          <DeviceNote device={run.device} meter={meter} />
          <label className="dialog-field">
            Lyrics (optional)
            <textarea rows={5} value={lyrics} onChange={(event) => setLyrics(event.target.value)} />
          </label>
          <label className="choice">
            <input
              type="checkbox"
              checked={lyricsOnly}
              onChange={(event) => setLyricsOnly(event.target.checked)}
            />
            Lyrics only
          </label>
          <fieldset className="choice-group">
            <legend>Range</legend>
            <RangeChoices selection={selection} range={range} onChange={setRange} />
          </fieldset>
        </fieldset>
        <ProgressArea state={state} meter={meter} />
        <DialogMessage state={state} />
        {needsLyrics && state.status === 'idle' && (
          <p id={hintId} className="dialog-note">
            Paste the lyrics to use Lyrics only.
          </p>
        )}
        <div className="dialog-actions">
          {state.status === 'idle' && (
            <button
              type="button"
              className="button primary"
              disabled={run.device === null || needsLyrics}
              aria-describedby={needsLyrics ? hintId : undefined}
              onClick={start}
            >
              Start
            </button>
          )}
          <DialogActions state={state} run={run} onRetry={start} onClose={onClose} />
        </div>
      </div>
    </div>
  )
}

type RangeChoicesProps = {
  selection: TimeRange | null
  /** The chosen range. Undefined chooses the full song. */
  range: TimeRange | undefined
  onChange: (range: TimeRange | undefined) => void
}

/** Shows "Full song" and, when the editor has a time selection, "The time selection" with its times. */
function RangeChoices({ selection, range, onChange }: RangeChoicesProps) {
  return (
    <>
      <label className="choice">
        <input
          type="radio"
          name="range"
          value="full"
          checked={range === undefined}
          onChange={() => onChange(undefined)}
        />
        Full song
      </label>
      {selection !== null && (
        <label className="choice">
          <input
            type="radio"
            name="range"
            value="selection"
            checked={range !== undefined}
            onChange={() => onChange(selection)}
          />
          The time selection{' '}
          <span className="choice-size">
            {formatTime(selection.startMs)} to {formatTime(selection.endMs)}
          </span>
        </label>
      )}
    </>
  )
}

type TranscribeRun = ReturnType<typeof useTranscribeRun>

/** The facts of the active run that the dialog shows beside its state. */
type RunMeter = {
  mode: TranscribeMode
  /** The `Date.now()` of the "Start" click. */
  startedAtMs: number
  /** The `Date.now()` of the start of the run in the worker, or null before it. */
  runAtMs: number | null
  /** The speed after the first chunk, or null before it. */
  speed: RunSpeed | null
  /** True after the watchdog moved the run from WebGPU to `wasm`. */
  slowDevice: boolean
}

/** Returns the meter after a step of the run. A new start of the run in the worker measures the speed again. */
function meterAfterStage(meter: RunMeter | null, stage: RunStage): RunMeter | null {
  if (meter === null || stage !== 'transcribing') return meter
  return { ...meter, runAtMs: Date.now(), speed: null }
}

/** Returns the meter after a progress of the run, with the speed once the first chunk is complete. */
function meterAfterProgress(meter: RunMeter | null, doneMs: number, totalMs: number) {
  if (meter === null || meter.runAtMs === null) return meter
  return { ...meter, speed: runSpeed(doneMs, totalMs, Date.now() - meter.runAtMs) ?? meter.speed }
}

/**
 * Returns the state of the transcribe run and the functions that start, answer and cancel it.
 * The hook owns one transcribe client for the life of the dialog.
 */
function useTranscribeRun(onDone: (outcome: TranscribeOutcome) => void) {
  const [state, dispatch] = useReducer(transcribeDialogReducer, IDLE)
  const [device, setDevice] = useState<Device | null>(null)
  const [meter, setMeter] = useState<RunMeter | null>(null)
  const clientRef = useRef<TranscribeClient | null>(null)
  const runRef = useRef<AbortController | null>(null)
  const answerRef = useRef<((value: boolean) => void) | null>(null)

  useEffect(() => {
    let mounted = true
    const onDeviceChange = (next: Device, reason: DeviceChangeReason) => {
      setDevice(next)
      if (reason === 'slow') setMeter((current) => current && { ...current, slowDevice: true })
    }
    void chooseDevice().then((first) => {
      if (!mounted) return
      setDevice(first)
      clientRef.current = createTranscribeClient({ device: first, onDeviceChange })
    })
    return () => {
      mounted = false
      runRef.current?.abort()
      clientRef.current?.dispose()
      clientRef.current = null
    }
  }, [])

  const start = useCallback(
    async (request: TranscribeRequest) => {
      const client = clientRef.current
      if (client === null) return
      const controller = new AbortController()
      runRef.current = controller
      // An event from a run that the person cancelled must not change the state of a later run.
      const send = (event: DialogEvent) => {
        if (!controller.signal.aborted) dispatch(event)
      }
      const ask = (event: DialogEvent) =>
        new Promise<boolean>((resolve) => {
          answerRef.current = resolve
          send(event)
        })
      setMeter({
        mode: request.mode,
        startedAtMs: Date.now(),
        runAtMs: null,
        speed: null,
        slowDevice: false,
      })
      send({ type: 'start', mode: request.mode })
      try {
        const outcome = await runTranscription(request, client, {
          signal: controller.signal,
          onDownload: (loaded, total) =>
            send({ type: 'download', percent: downloadPercent(loaded, total) }),
          onStage: (stage) => {
            if (controller.signal.aborted) return
            setMeter((current) => meterAfterStage(current, stage))
            send({ type: 'stage', stage })
          },
          onProgress: (doneMs, totalMs) => {
            if (controller.signal.aborted) return
            setMeter((current) => meterAfterProgress(current, doneMs, totalMs))
            send({ type: 'progress', doneMs, totalMs })
          },
          onFinishing: () => send({ type: 'finishing' }),
          confirmReplace: () => ask({ type: 'confirm-replace' }),
          confirmLowMatch: (ratio) => ask({ type: 'confirm-low-match', ratio }),
        })
        if (controller.signal.aborted) return
        send({ type: 'done' })
        onDone(outcome)
      } catch (error) {
        send(isCancel(error) ? { type: 'cancelled' } : { type: 'failed', error })
      }
    },
    [onDone],
  )

  function answer(value: boolean) {
    const resolve = answerRef.current
    answerRef.current = null
    dispatch({ type: 'answer' })
    resolve?.(value)
  }

  function cancel() {
    answer(false)
    runRef.current?.abort()
    clientRef.current?.cancel()
    dispatch({ type: 'cancelled' })
  }

  return { state, device, meter, start, answer, cancel }
}

/** Returns `Date.now()`, updated each second while `ticking` is true. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  // A value from before the "Start" click gives a negative elapsed time, and `formatClock` shows it as 0:00.
  return now
}

type DeviceNoteProps = {
  device: Device | null
  /** The meter of the active run, or null when no run is active. */
  meter: RunMeter | null
}

/** Shows the device note when no run is active, and the device line during a speech model run. */
function DeviceNote({ device, meter }: DeviceNoteProps) {
  if (device === null) return null
  if (meter === null || meter.mode !== 'model')
    return <p className="dialog-note">{DEVICE_NOTE[device]}</p>
  return <p className="dialog-note transcribe-device">{deviceLine(device, meter.speed)}</p>
}

type ProgressAreaProps = {
  state: DialogState
  /** The meter of the active run, or null when no run is active. */
  meter: RunMeter | null
}

/**
 * Shows the progress text and bar of the run, and the message after the watchdog.
 * The text changes each second before the first progress, so the live region holds only the name of the state.
 */
function ProgressArea({ state, meter }: ProgressAreaProps) {
  const runState = shownRunState(state)
  const now = useNow(runState !== null && showsElapsed(runState))
  const elapsedMs = now - (meter?.startedAtMs ?? now)
  return (
    <div className="dialog-progress">
      <p className="transcribe-progress">
        {runState === null ? '' : progressText(runState, elapsedMs)}
      </p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {runState === null ? '' : stateLabel(runState)}
      </p>
      {runState !== null && <progress aria-hidden="true" max={1} value={progressValue(runState)} />}
      {meter?.slowDevice === true && (
        <p className="dialog-note" role="status">
          {SLOW_GPU_MESSAGE}
        </p>
      )}
    </div>
  )
}

function DialogMessage({ state }: { state: DialogState }) {
  if (state.status === 'error')
    return (
      <p className="message" role="alert">
        {state.message}
      </p>
    )
  if (state.status === 'confirm-replace')
    return (
      <p className="dialog-confirm" role="alert">
        The run replaces the marks of this voice.
      </p>
    )
  if (state.status === 'low-match')
    return (
      <p className="dialog-confirm" role="alert">
        {lowMatchMessage(state.ratio)}
      </p>
    )
  return null
}

type DialogActionsProps = {
  state: DialogState
  run: TranscribeRun
  onRetry: () => void
  onClose: () => void
}

function DialogActions({ state, run, onRetry, onClose }: DialogActionsProps) {
  if (isRunState(state))
    return (
      <button type="button" className="button" onClick={run.cancel}>
        Cancel
      </button>
    )
  if (state.status === 'confirm-replace' || state.status === 'low-match')
    return (
      <>
        <button type="button" className="button primary" onClick={() => run.answer(true)}>
          Continue
        </button>
        <button type="button" className="button" onClick={() => run.answer(false)}>
          Cancel
        </button>
      </>
    )
  return (
    <>
      {state.status === 'error' && (
        <button type="button" className="button primary" onClick={onRetry}>
          Retry
        </button>
      )}
      <button type="button" className="button" onClick={onClose}>
        Close
      </button>
    </>
  )
}

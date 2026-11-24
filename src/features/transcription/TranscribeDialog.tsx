import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from 'react'
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from '../../store/settings.ts'
import { chooseDevice } from './device.ts'
import { type Device, SPEECH_MODELS } from './protocol.ts'
import {
  runTranscription,
  type TranscribeOutcome,
  type TranscribeRequest,
} from './runTranscription.ts'
import { createTranscribeClient, type TranscribeClient } from './transcribeClient.ts'
import {
  type DialogEvent,
  type DialogState,
  downloadPercent,
  IDLE,
  isActive,
  isCancel,
  isRunState,
  lowMatchMessage,
  progressText,
  progressValue,
  shownRunState,
  transcribeDialogReducer,
} from './transcribeDialogState.ts'

const DEVICE_NOTE: Record<Device, string> = {
  webgpu: 'Uses your graphics card (WebGPU)',
  wasm: 'WebGPU is not available. Transcription is slower on this browser.',
}

const FOCUSABLE = 'button, input, textarea, select, [tabindex]:not([tabindex="-1"])'

type TranscribeDialogProps = {
  /** The voice that receives the marks. */
  voiceId: string
  /** The duration of the song, for the first progress text. */
  durationMs: number
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
  durationMs,
  onActiveChange,
  onClose,
  onDone,
}: TranscribeDialogProps) {
  const titleId = useId()
  const hintId = useId()
  const [speechModelId, setSpeechModelId] = useState(DEFAULT_SETTINGS.speechModelId)
  const [lyrics, setLyrics] = useState('')
  const [lyricsOnly, setLyricsOnly] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const run = useTranscribeRun(durationMs, onDone)
  const { state } = run
  const active = isActive(state)
  const needsLyrics = lyricsOnly && lyrics.trim() === ''

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
      lyrics: lyrics.trim() === '' ? undefined : lyrics,
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !active) {
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  return (
    <div className="modal-backdrop">
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
          {run.device !== null && <p className="dialog-note">{DEVICE_NOTE[run.device]}</p>}
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
            {/* TODO(#18): Offer the time selection when the editor has one. */}
            <label className="choice">
              <input type="radio" name="range" value="full" checked readOnly />
              Full song
            </label>
          </fieldset>
        </fieldset>
        <ProgressArea state={state} />
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

type TranscribeRun = ReturnType<typeof useTranscribeRun>

/**
 * Returns the state of the transcribe run and the functions that start, answer and cancel it.
 * The hook owns one transcribe client for the life of the dialog.
 */
function useTranscribeRun(durationMs: number, onDone: (outcome: TranscribeOutcome) => void) {
  const [state, dispatch] = useReducer(transcribeDialogReducer, IDLE)
  const [device, setDevice] = useState<Device | null>(null)
  const clientRef = useRef<TranscribeClient | null>(null)
  const runRef = useRef<AbortController | null>(null)
  const answerRef = useRef<((value: boolean) => void) | null>(null)

  useEffect(() => {
    let mounted = true
    void chooseDevice().then((first) => {
      if (!mounted) return
      setDevice(first)
      clientRef.current = createTranscribeClient({ device: first, onDeviceChange: setDevice })
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
      send({ type: 'start', mode: request.mode, totalMs: durationMs })
      try {
        const outcome = await runTranscription(request, client, {
          signal: controller.signal,
          onDownload: (loaded, total) =>
            send({ type: 'download', percent: downloadPercent(loaded, total) }),
          onProgress: (doneMs, totalMs) => send({ type: 'progress', doneMs, totalMs }),
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
    [durationMs, onDone],
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

  return { state, device, start, answer, cancel }
}

/** Returns the controls that Tab visits, in order. Tab visits only the checked radio of a group. */
function tabStops(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      !element.matches(':disabled') &&
      !(element instanceof HTMLInputElement && element.type === 'radio' && !element.checked),
  )
}

function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
  const controls = tabStops(event.currentTarget)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (first === undefined || last === undefined) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function ProgressArea({ state }: { state: DialogState }) {
  const runState = shownRunState(state)
  return (
    <div className="dialog-progress">
      <p className="transcribe-progress" role="status" aria-live="polite">
        {runState === null ? '' : progressText(runState)}
      </p>
      {runState !== null && <progress aria-hidden="true" max={1} value={progressValue(runState)} />}
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

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
import { endpointHost, isMixedContent, type RemoteEndpoint } from '../../lib/remote/endpoint.ts'
import { formatTime } from '../../lib/time/formatTime.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from '../../store/settings.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { AppSettings, DeviceSpeeds, TranscribeSource } from '../../store/types.ts'
import { hasWebGpu, pickDevice, withFailureTimes, withSpeed } from './device.ts'
import { parseLyrics, parseSectionTags } from './phrases.ts'
import {
  isSeparationModelId,
  SEPARATION_MODELS,
} from '../vocal-separation/engine/separationModels.ts'
import {
  isSingerCountChoice,
  SINGER_COUNT_CHOICES,
  type SingerCountChoice,
  singerCountLabel,
  singerCountOf,
} from '../singer-voices/singerCount.ts'
import type { SeparationModelId } from '../vocal-separation/protocol.ts'
import { type Device, SPEECH_MODELS } from './protocol.ts'
import { RemoteEndpointPanel } from './RemoteEndpointPanel.tsx'
import {
  type RunStage,
  runTranscription,
  type SeparationAnswer,
  type TranscribeMode,
  type TranscribeOutcome,
  type TranscribeRequest,
} from './runTranscription.ts'
import { createTranscribeClient, type TranscribeClient } from './transcribeClient.ts'
import {
  DEMUCS_WASM_WARNING,
  type DialogEvent,
  type DialogState,
  deviceLine,
  downloadPercent,
  IDLE,
  isActive,
  isCancel,
  isQuestion,
  isRunState,
  keepTracksNote,
  lowMatchMessage,
  MIXED_CONTENT_MESSAGE,
  progressText,
  progressValue,
  remoteWarning,
  type RunSpeed,
  type RunState,
  separationModelLabel,
  separationNote,
  runSpeed,
  SINGER_COUNT_NOTE,
  SINGER_HINT,
  SINGER_MODEL_HINT,
  SINGER_NOTE,
  showsSingerModelHint,
  shownRunState,
  SLOW_GPU_MESSAGE,
  stateLabel,
  transcribeDialogReducer,
} from './transcribeDialogState.ts'

/** The message when the browser cannot store the remote endpoint. */
const ENDPOINT_UNSTORED_MESSAGE =
  'The app could not store the remote endpoint in this browser. It works until you reload the page.'

/** The message when the browser cannot store a choice of the dialog. All choices share it. */
const CHOICES_UNSTORED_MESSAGE =
  'The app could not store the choices of this dialog in this browser. They work until you reload the page.'

const DEVICE_NOTE: Record<Device, string> = {
  webgpu: 'Uses your graphics card (WebGPU)',
  wasm: 'WebGPU is not available. Transcription is slower on this browser.',
}

type TranscribeDialogProps = {
  /** The voice that receives the marks. */
  voiceId: string
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
  const [tagSections, setTagSections] = useState(true)
  const [separate, setSeparate] = useState(DEFAULT_SETTINGS.separateVocals)
  const [separationModel, setSeparationModel] = useState(DEFAULT_SETTINGS.separationModel)
  const [singers, setSingers] = useState(DEFAULT_SETTINGS.singerVoices)
  const [keepTracks, setKeepTracks] = useState(DEFAULT_SETTINGS.keepTracks)
  const [singerCount, setSingerCount] = useState(DEFAULT_SETTINGS.singerCount)
  const [range, setRange] = useState<TimeRange | undefined>(undefined)
  const [choicesUnstored, setChoicesUnstored] = useState(false)
  // The choice applies to this run even when the browser cannot store it, so a failed write only shows a message.
  const storeSetting = useCallback((change: Partial<AppSettings>) => {
    void updateSettings(change).catch(() => setChoicesUnstored(true))
  }, [])
  const remote = useRemoteChoice(storeSetting)
  const { restore } = remote
  const dialogRef = useRef<HTMLDivElement>(null)
  const run = useTranscribeRun(onDone)
  const { state } = run
  const active = isActive(state)
  const meter = active ? run.meter : null
  // Lyrics with no word, such as one "[Chorus]" line, give no phrase, so they count as no lyrics.
  const hasLyrics = parseLyrics(lyrics).length > 0
  const hasTags = offersTagSections(lyrics)
  const needsLyrics = lyricsOnly && !hasLyrics
  const usesRemote = remote.appliesTo(lyricsOnly)
  const canStart = remote.canStart(usesRemote, run.webgpu !== null) && !needsLyrics

  useEffect(() => {
    let mounted = true
    // A failed read keeps the default settings: the browser source and no remote endpoint.
    void loadSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then((settings) => {
        if (!mounted) return
        if (SPEECH_MODELS.some((model) => model.id === settings.speechModelId))
          setSpeechModelId(settings.speechModelId)
        setSeparate(settings.separateVocals)
        if (isSeparationModelId(settings.separationModel))
          setSeparationModel(settings.separationModel)
        setSingers(settings.singerVoices)
        setKeepTracks(settings.keepTracks)
        if (isSingerCountChoice(settings.singerCount)) setSingerCount(settings.singerCount)
        restore(settings)
      })
    if (dialogRef.current !== null) tabStops(dialogRef.current)[0]?.focus()
    return () => {
      mounted = false
    }
  }, [restore])

  useEffect(() => onActiveChange(active), [active, onActiveChange])

  useEffect(() => {
    // A state change removes the button that had the focus, so the focus goes to the next action.
    const dialog = dialogRef.current
    if (dialog === null || dialog.contains(document.activeElement)) return
    dialog.querySelector<HTMLElement>('.dialog-actions button:not(:disabled)')?.focus()
  }, [state.status])

  function selectSpeechModel(id: string) {
    setSpeechModelId(id)
    storeSetting({ speechModelId: id })
  }

  function selectSeparate(checked: boolean) {
    setSeparate(checked)
    storeSetting({ separateVocals: checked })
  }

  function selectSeparationModel(model: SeparationModelId) {
    setSeparationModel(model)
    storeSetting({ separationModel: model })
  }

  function selectKeepTracks(checked: boolean) {
    setKeepTracks(checked)
    storeSetting({ keepTracks: checked })
  }

  function selectSingers(checked: boolean) {
    setSingers(checked)
    storeSetting({ singerVoices: checked })
  }

  function selectSingerCount(choice: SingerCountChoice) {
    setSingerCount(choice)
    storeSetting({ singerCount: choice })
  }

  function start() {
    void run.start({
      voiceId,
      speechModelId,
      mode: lyricsOnly ? 'lyrics-only' : 'model',
      lyrics: hasLyrics ? lyrics : undefined,
      range,
      remote: usesRemote ? remote.endpoint : undefined,
      addSections: hasTags && tagSections,
      separateVocals: !lyricsOnly && separate,
      separationModel,
      keepTracks: !lyricsOnly && separate && keepTracks,
      singerVoices: !lyricsOnly && separate && singers,
      singerCount: singerCountOf(singerCount),
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !active) {
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Escape' && isQuestion(state)) {
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
            <legend>Where to transcribe</legend>
            <SourceChoices source={remote.source} onChange={remote.selectSource} />
          </fieldset>
          {remote.source === 'remote' ? (
            <fieldset className="choice-group remote-endpoint" disabled={lyricsOnly}>
              <legend>Remote endpoint</legend>
              <RemoteEndpointPanel
                endpoint={remote.endpoint}
                editing={remote.editing}
                onEdit={remote.edit}
                onSave={remote.save}
              />
              <AlertMessage shown={remote.endpointUnstored} text={ENDPOINT_UNSTORED_MESSAGE} />
            </fieldset>
          ) : (
            <>
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
              <DeviceNote webgpu={run.webgpu} device={run.device} meter={meter} />
            </>
          )}
          <label className="dialog-field">
            Lyrics (optional)
            <textarea rows={5} value={lyrics} onChange={(event) => setLyrics(event.target.value)} />
          </label>
          <TagSectionsChoice shown={hasTags} checked={tagSections} onChange={setTagSections} />
          <label className="choice">
            <input
              type="checkbox"
              checked={lyricsOnly}
              onChange={(event) => setLyricsOnly(event.target.checked)}
            />
            Lyrics only
          </label>
          <SeparateChoice
            shown={!lyricsOnly}
            checked={separate}
            remote={usesRemote}
            host={remote.host}
            onChange={selectSeparate}
            model={separationModel}
            webgpu={run.webgpu}
            onModelChange={selectSeparationModel}
          />
          <KeepTracksChoice
            shown={!lyricsOnly}
            separate={separate}
            checked={keepTracks}
            range={range}
            onChange={selectKeepTracks}
          />
          <SingerChoice
            shown={!lyricsOnly}
            enabled={separate}
            checked={singers}
            onChange={selectSingers}
            count={singerCount}
            onCountChange={selectSingerCount}
            modelHint={showsSingerModelHint(usesRemote, speechModelId)}
          />
          <fieldset className="choice-group">
            <legend>Range</legend>
            <RangeChoices selection={selection} range={range} onChange={setRange} />
          </fieldset>
        </fieldset>
        <AlertMessage shown={choicesUnstored} text={CHOICES_UNSTORED_MESSAGE} />
        {usesRemote && <RemoteNotice remote={remote} />}
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
              disabled={!canStart}
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

/** Shows a message in an alert while `shown` is true. */
function AlertMessage({ shown, text }: { shown: boolean; text: string }) {
  if (!shown) return null
  return (
    <p className="message" role="alert">
      {text}
    </p>
  )
}

/** Returns true when the lyrics have a `[Name]` tag and a word. A tag with no lyrics line gives no phrase, so it gives no section. */
function offersTagSections(lyrics: string): boolean {
  return parseSectionTags(lyrics).length > 0 && parseLyrics(lyrics).length > 0
}

type TagSectionsChoiceProps = {
  /** True when the lyrics have a `[Name]` tag and a word. */
  shown: boolean
  checked: boolean
  onChange: (checked: boolean) => void
}

/** Shows the check box that adds a section for each `[Name]` tag of the lyrics. */
function TagSectionsChoice({ shown, checked, onChange }: TagSectionsChoiceProps) {
  if (!shown) return null
  return (
    <label className="choice">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Add sections from the [Name] tags
    </label>
  )
}

type SeparateChoiceProps = {
  /** False for a lyrics-only run, which reads no audio. */
  shown: boolean
  checked: boolean
  /** True when the run uses the remote endpoint. */
  remote: boolean
  /** The host of the stored remote endpoint, or null when the person has stored none. */
  host: string | null
  onChange: (checked: boolean) => void
  /** The selected vocal separation model. */
  model: SeparationModelId
  /** True when the browser gives a WebGPU adapter, or null before the check ends. */
  webgpu: boolean | null
  onModelChange: (model: SeparationModelId) => void
}

/**
 * Shows the check box "Separate the vocals first", the note that tells where the audio goes, and the "Separation model" choice.
 * The choice shows only with the check box on.
 */
function SeparateChoice({
  shown,
  checked,
  remote,
  host,
  onChange,
  model,
  webgpu,
  onModelChange,
}: SeparateChoiceProps) {
  const noteId = useId()
  if (!shown) return null
  return (
    <>
      <label className="choice">
        <input
          type="checkbox"
          checked={checked}
          aria-describedby={noteId}
          onChange={(event) => onChange(event.target.checked)}
        />
        Separate the vocals first
      </label>
      <p id={noteId} className="dialog-note">
        {separationNote(remote ? host : null, model)}
      </p>
      {checked && <SeparationModelChoice model={model} webgpu={webgpu} onChange={onModelChange} />}
    </>
  )
}

type SeparationModelChoiceProps = {
  model: SeparationModelId
  /** True when the browser gives a WebGPU adapter, or null before the check ends. */
  webgpu: boolean | null
  onChange: (model: SeparationModelId) => void
}

/** Shows the "Separation model" choice, and the Demucs warning when the browser gives no WebGPU adapter. */
function SeparationModelChoice({ model, webgpu, onChange }: SeparationModelChoiceProps) {
  return (
    <>
      <fieldset className="choice-group">
        <legend>Separation model</legend>
        {SEPARATION_MODELS.map(({ id }) => (
          <label key={id} className="choice">
            <input
              type="radio"
              name="separation-model"
              value={id}
              checked={model === id}
              onChange={() => onChange(id)}
            />
            {separationModelLabel(id)}
          </label>
        ))}
      </fieldset>
      {model === 'demucs' && webgpu === false && (
        <p className="dialog-confirm">{DEMUCS_WASM_WARNING}</p>
      )}
    </>
  )
}

type KeepTracksChoiceProps = {
  /** False for a lyrics-only run, which reads no audio. */
  shown: boolean
  /** True when "Separate the vocals first" is on. The tracks come from the separation. */
  separate: boolean
  checked: boolean
  /** The range of the run. Undefined is the full song. */
  range: TimeRange | undefined
  onChange: (checked: boolean) => void
}

/** Shows the check box "Keep the separated tracks" and the note with the bytes that the tracks use. */
function KeepTracksChoice({ shown, separate, checked, range, onChange }: KeepTracksChoiceProps) {
  const noteId = useId()
  const songMs = useSongStore((state) => state.current?.song.durationMs ?? 0)
  if (!shown || !separate) return null
  const durationMs = range === undefined ? songMs : range.endMs - range.startMs
  return (
    <>
      <label className="choice">
        <input
          type="checkbox"
          checked={checked}
          aria-describedby={noteId}
          onChange={(event) => onChange(event.target.checked)}
        />
        Keep the separated tracks
      </label>
      <p id={noteId} className="dialog-note">
        {keepTracksNote(durationMs)}
      </p>
    </>
  )
}

type SingerChoiceProps = {
  /** False for a lyrics-only run, which reads no audio. */
  shown: boolean
  /** True when "Separate the vocals first" is on, because the step reads the separated vocals. */
  enabled: boolean
  checked: boolean
  onChange: (checked: boolean) => void
  count: SingerCountChoice
  onCountChange: (count: SingerCountChoice) => void
  /** True when the run uses a small speech model of this browser. See `showsSingerModelHint`. */
  modelHint: boolean
}

/**
 * Shows the check box "Put each singer on its own voice", its note, and the hint while it is disabled.
 * While the option is on, it also shows the hint for a small speech model and the "Singers" choice.
 */
function SingerChoice(props: SingerChoiceProps) {
  const { shown, enabled, checked, onChange } = props
  const noteId = useId()
  const hintId = useId()
  if (!shown) return null
  return (
    <>
      <label className="choice">
        <input
          type="checkbox"
          checked={enabled && checked}
          disabled={!enabled}
          aria-describedby={enabled ? noteId : `${hintId} ${noteId}`}
          onChange={(event) => onChange(event.target.checked)}
        />
        Put each singer on its own voice (experimental)
      </label>
      {!enabled && (
        <p id={hintId} className="dialog-note">
          {SINGER_HINT}
        </p>
      )}
      <p id={noteId} className="dialog-note">
        {SINGER_NOTE}
      </p>
      {enabled && checked && props.modelHint && <p className="dialog-note">{SINGER_MODEL_HINT}</p>}
      {enabled && checked && (
        <SingerCountChoices count={props.count} onChange={props.onCountChange} />
      )}
    </>
  )
}

type SingerCountChoicesProps = {
  count: SingerCountChoice
  onChange: (count: SingerCountChoice) => void
}

/** Shows the "Singers" choice: "Automatic" or a count that the person gives, with its note. */
function SingerCountChoices({ count, onChange }: SingerCountChoicesProps) {
  const noteId = useId()
  return (
    <fieldset className="choice-group" aria-describedby={noteId}>
      <legend>Singers</legend>
      {SINGER_COUNT_CHOICES.map((choice) => (
        <label key={choice} className="choice">
          <input
            type="radio"
            name="singer-count"
            value={choice}
            checked={count === choice}
            onChange={() => onChange(choice)}
          />
          {singerCountLabel(choice)}
        </label>
      ))}
      <p id={noteId} className="dialog-note">
        {SINGER_COUNT_NOTE}
      </p>
    </fieldset>
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

const SOURCE_LABEL: Record<TranscribeSource, string> = {
  browser: 'In this browser',
  remote: 'Remote endpoint',
}

/** Shows the "Where to transcribe" choices. */
function SourceChoices({
  source,
  onChange,
}: {
  source: TranscribeSource
  onChange: (source: TranscribeSource) => void
}) {
  return (
    <>
      {(['browser', 'remote'] as const).map((value) => (
        <label key={value} className="choice">
          <input
            type="radio"
            name="transcribe-source"
            value={value}
            checked={source === value}
            onChange={() => onChange(value)}
          />
          {SOURCE_LABEL[value]}
        </label>
      ))}
    </>
  )
}

type RemoteChoice = ReturnType<typeof useRemoteChoice>

/**
 * Returns the "Where to transcribe" choice, the stored remote endpoint and the functions that change them.
 * The endpoint fields open when the person selects "Remote endpoint" with no stored endpoint.
 */
function useRemoteChoice(storeSetting: (change: Partial<AppSettings>) => void) {
  const [source, setSource] = useState<TranscribeSource>(DEFAULT_SETTINGS.transcribeSource)
  const [endpoint, setEndpoint] = useState<RemoteEndpoint>(DEFAULT_SETTINGS.remoteEndpoint)
  const [editing, setEditing] = useState(false)
  const [endpointUnstored, setEndpointUnstored] = useState(false)
  const stored = endpoint.baseUrl !== ''
  const blocked = stored && isMixedContent(globalThis.location.protocol, endpoint.baseUrl)

  const restore = useCallback((settings: AppSettings) => {
    setSource(settings.transcribeSource)
    setEndpoint(settings.remoteEndpoint)
    setEditing(settings.remoteEndpoint.baseUrl === '')
  }, [])

  function selectSource(next: TranscribeSource) {
    setSource(next)
    if (next === 'remote' && !stored) setEditing(true)
    storeSetting({ transcribeSource: next })
  }

  function save(next: RemoteEndpoint) {
    setEndpoint(next)
    setEditing(false)
    setEndpointUnstored(false)
    // The endpoint works for the life of the page even when the browser cannot store it.
    void updateSettings({ remoteEndpoint: next }).catch(() => setEndpointUnstored(true))
  }

  return {
    source,
    endpoint,
    editing,
    /** True when the browser could not store the last saved endpoint. */
    endpointUnstored,
    /** The host of the stored endpoint, or null when the person has stored none. */
    host: stored ? endpointHost(endpoint.baseUrl) : null,
    /** True when the browser blocks the call to the stored endpoint as mixed content. */
    blocked,
    /** Returns true when the run uses the endpoint. A lyrics-only run sends no audio, so it never uses the endpoint. */
    appliesTo: (lyricsOnly: boolean) => source === 'remote' && !lyricsOnly,
    /** Returns true when the run can start: the endpoint is ready for a remote run, the device for a browser run. */
    canStart: (usesRemote: boolean, deviceReady: boolean) =>
      usesRemote ? stored && !editing && !blocked : deviceReady,
    restore,
    selectSource,
    save,
    edit: () => setEditing(true),
  }
}

/**
 * Shows the warning with the host before a remote run, or the mixed content message that blocks the run.
 * The warning stays visible during the run, so the person always sees where the audio goes.
 */
function RemoteNotice({ remote }: { remote: RemoteChoice }) {
  if (remote.host === null || remote.editing) return null
  if (remote.blocked)
    return (
      <p className="message" role="alert">
        {MIXED_CONTENT_MESSAGE}
      </p>
    )
  return <p className="dialog-confirm remote-warning">{remoteWarning(remote.host)}</p>
}

type TranscribeRun = ReturnType<typeof useTranscribeRun>

/** The facts of the active run that the dialog shows beside its state. */
type RunMeter = {
  mode: TranscribeMode
  /** The host of the remote endpoint of the run, or null for a run in the browser. */
  host: string | null
  /** The `Date.now()` of the "Start" click. */
  startedAtMs: number
  /** The `Date.now()` of the start of the run in the worker, or null before it. */
  runAtMs: number | null
  /** The speed after the first chunk, or null before it. */
  speed: RunSpeed | null
  /** True after the watchdog moved the run from WebGPU to `wasm`. */
  slowDevice: boolean
  /** The vocal separation model of the run. "Use the fast model" changes it to Spleeter. */
  separationModel: SeparationModelId
}

/** Returns the meter of a run at the "Start" click. */
function meterAtStart(request: TranscribeRequest): RunMeter {
  return {
    mode: request.mode,
    host: request.remote === undefined ? null : endpointHost(request.remote.baseUrl),
    startedAtMs: Date.now(),
    runAtMs: null,
    speed: null,
    slowDevice: false,
    separationModel: request.separationModel ?? 'spleeter',
  }
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
  const [webgpu, setWebgpu] = useState<boolean | null>(null)
  const [device, setDevice] = useState<Device | null>(null)
  const [meter, setMeter] = useState<RunMeter | null>(null)
  const clientRef = useRef<TranscribeClient | null>(null)
  const runRef = useRef<AbortController | null>(null)
  const answerRef = useRef<((value: SeparationAnswer) => void) | null>(null)
  const speedsRef = useRef<Record<string, DeviceSpeeds>>({})
  const speechModelRef = useRef('')

  useEffect(() => {
    let mounted = true
    const settings = loadSettings().catch(() => DEFAULT_SETTINGS)
    void Promise.all([hasWebGpu(), settings]).then(([available, { deviceSpeeds }]) => {
      if (!mounted) return
      const stamped = withFailureTimes(deviceSpeeds, Date.now())
      speedsRef.current = stamped
      // The failure time of an earlier record starts the wait before the app tries WebGPU again.
      // The speeds are measurements, not a choice of the person, and the next run measures again, so a failed write shows no message.
      if (stamped !== deviceSpeeds)
        void updateSettings({ deviceSpeeds: speedsRef.current }).catch(() => undefined)
      setWebgpu(available)
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
      const { speechModelId } = request
      speechModelRef.current = speechModelId
      // A client can outlive this run, so the handler reads the speech model of the active run.
      const recordSpeed = (measured: Device, speed: number) => {
        speedsRef.current = withSpeed(
          speedsRef.current,
          speechModelRef.current,
          measured,
          speed,
          Date.now(),
        )
        // The next run measures the speed again, so a failed write shows no message.
        void updateSettings({ deviceSpeeds: speedsRef.current }).catch(() => undefined)
      }
      // A remote run can start before the WebGPU check ends. It uses no device.
      const first = pickDevice(webgpu === true, speedsRef.current[speechModelId], Date.now())
      // The client keeps one device, so a run that needs the other device needs a new client.
      if (clientRef.current?.device !== first) {
        clientRef.current?.dispose()
        clientRef.current = createTranscribeClient({
          device: first,
          onDeviceChange: (next, reason) => {
            setDevice(next)
            // A failed or stalled WebGPU device gets the lowest speed, so the app selects it again only after RETRY_FAILED_DEVICE_MS.
            recordSpeed('webgpu', 0)
            if (reason === 'slow')
              setMeter((current) => current && { ...current, slowDevice: true })
          },
          onSpeed: recordSpeed,
        })
      }
      const client = clientRef.current
      setDevice(first)
      const controller = new AbortController()
      runRef.current = controller
      // An event from a run that the person cancelled must not change the state of a later run.
      const send = (event: DialogEvent) => {
        if (!controller.signal.aborted) dispatch(event)
      }
      const askAnswer = (event: DialogEvent) =>
        new Promise<SeparationAnswer>((resolve) => {
          answerRef.current = resolve
          send(event)
        })
      const ask = (event: DialogEvent) => askAnswer(event).then((value) => value === true)
      setMeter(meterAtStart(request))
      send({ type: 'start', mode: request.mode })
      try {
        const outcome = await runTranscription(request, client, {
          signal: controller.signal,
          onDownload: (loaded, total) =>
            send({ type: 'download', percent: downloadPercent(loaded, total) }),
          onSeparationDownload: (loaded, total) =>
            send({ type: 'separation-download', percent: downloadPercent(loaded, total) }),
          onSeparationProgress: (doneMs, totalMs) =>
            send({ type: 'separation-progress', doneMs, totalMs }),
          confirmNoSeparation: (error, model) =>
            askAnswer({ type: 'confirm-no-separation', error, model }),
          onSingersDownload: (loaded, total) =>
            send({ type: 'singers-download', percent: downloadPercent(loaded, total) }),
          onSingersProgress: (doneMs, totalMs) =>
            send({ type: 'singers-progress', doneMs, totalMs }),
          onUpload: (loaded, total) =>
            send({ type: 'upload', percent: downloadPercent(loaded, total) }),
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
        // A cancel during the singer step keeps the marks of the run, so the run ends as done and the toast says so.
        if (controller.signal.aborted && outcome.singers?.status !== 'cancelled') return
        dispatch({ type: 'done' })
        onDone(outcome)
      } catch (error) {
        send(isCancel(error) ? { type: 'cancelled' } : { type: 'failed', error })
      }
    },
    [onDone, webgpu],
  )

  function answer(value: SeparationAnswer) {
    const resolve = answerRef.current
    answerRef.current = null
    if (value === 'fast-model')
      setMeter((current) => current && { ...current, separationModel: 'spleeter' })
    dispatch({ type: 'answer' })
    resolve?.(value)
  }

  function cancel() {
    // The marks of the run exist during the singer step, so a cancel stops only the step and the run ends as done.
    if (SINGER_STATES.has(state.status)) {
      runRef.current?.abort()
      return
    }
    answer(false)
    runRef.current?.abort()
    clientRef.current?.cancel()
    dispatch({ type: 'cancelled' })
  }

  return { state, webgpu, device, meter, start, answer, cancel }
}

/** The run states of the singer step, after the run wrote its marks. */
const SINGER_STATES: ReadonlySet<DialogState['status']> = new Set([
  'singers-loading',
  'singers-downloading',
  'singers-started',
  'finding-singers',
])

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
  /** True when the browser gives a WebGPU adapter, or null before the check ends. */
  webgpu: boolean | null
  /** The device of the active run. The app selects it from the measured speeds. */
  device: Device | null
  /** The meter of the active run, or null when no run is active. */
  meter: RunMeter | null
}

/** Shows the device note when no run is active, and the device line during a speech model run. */
function DeviceNote({ webgpu, device, meter }: DeviceNoteProps) {
  if (webgpu === null) return null
  if (device === null || meter === null || meter.mode !== 'model')
    return <p className="dialog-note">{DEVICE_NOTE[webgpu ? 'webgpu' : 'wasm']}</p>
  return <p className="dialog-note transcribe-device">{deviceLine(device, meter.speed)}</p>
}

type ProgressAreaProps = {
  state: DialogState
  /** The meter of the active run, or null when no run is active. */
  meter: RunMeter | null
}

/** Returns the progress text and the live region text of a run state, or two empty texts when no run is active. */
function runTexts(runState: RunState | null, elapsedMs: number, meter: RunMeter | null) {
  if (runState === null) return { progress: '', label: '' }
  const host = meter?.host ?? ''
  const model = meter?.separationModel ?? 'spleeter'
  return {
    progress: progressText(runState, elapsedMs, host, model),
    label: stateLabel(runState, host, model),
  }
}

/**
 * Shows the progress text and bar of the run, and the message after the watchdog.
 * The text changes each second before the first progress, so the live region holds only the name of the state.
 */
function ProgressArea({ state, meter }: ProgressAreaProps) {
  const runState = shownRunState(state)
  // The clock runs for the full run. A clock that starts again after the download shows an old elapsed time for up to one second.
  const now = useNow(runState !== null)
  const texts = runTexts(runState, now - (meter?.startedAtMs ?? now), meter)
  return (
    <div className="dialog-progress">
      <p className="transcribe-progress">{texts.progress}</p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {texts.label}
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
  if (state.status === 'error' || state.status === 'separation-failed')
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
  if (state.status === 'separation-failed')
    return <SeparationFailedActions fastModel={state.fastModel} run={run} />
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

/** Shows the actions after a failed vocal separation. "Use the fast model" shows only after a Demucs memory failure. */
function SeparationFailedActions({ fastModel, run }: { fastModel: boolean; run: TranscribeRun }) {
  return (
    <>
      {fastModel && (
        <button type="button" className="button primary" onClick={() => run.answer('fast-model')}>
          Use the fast model
        </button>
      )}
      <button
        type="button"
        className={fastModel ? 'button' : 'button primary'}
        onClick={() => run.answer(true)}
      >
        Continue with no separation
      </button>
      <button type="button" className="button" onClick={run.cancel}>
        Cancel
      </button>
    </>
  )
}

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { buildTracks } from '../../lib/xtiming/buildTracks.ts'
import { checkTracks } from '../../lib/xtiming/checkTracks.ts'
import { exportFiles, type ExportFile } from '../../lib/xtiming/exportFiles.ts'
import { defaultTrackNames } from '../../lib/xtiming/names.ts'
import type { ExportOptions } from '../../lib/xtiming/types.ts'
import { saveExportOptions, StorageFullError } from '../../store/db.ts'
import type { SongContent } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { ChecksList } from './ChecksList.tsx'
import { FilePreview } from './FilePreview.tsx'
import { ImportSteps } from './ImportSteps.tsx'
import { PackagingGroup } from './PackagingGroup.tsx'
import { plural } from './plural.ts'

const FOCUSABLE = 'button, input, summary, [tabindex="0"]'

type ExportDialogProps = {
  /** The open song with its voices, sections and marks. */
  content: SongContent
  /** The options that the dialog opens with. */
  initialOptions: ExportOptions
  onClose: () => void
  /**
   * Receives the files of the export after the person selects "Download".
   * The dialog stores the export options of the song before the call, and shows the done state after it.
   */
  onDownload: (files: ExportFile[]) => void
}

// The dialog is modal, so the Tab key cycles through the controls of the dialog only.
function keepFocusInside(event: KeyboardEvent<HTMLDivElement>): void {
  const dialog = event.currentTarget
  const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (control) => !control.matches(':disabled'),
  )
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!first || !last) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

function doneLine(trackCount: number, files: ExportFile[]): string {
  const target = files.length === 1 && files[0] ? files[0].name : plural(files.length, 'file')
  return `${plural(trackCount, 'timing track')} written to ${target}`
}

/**
 * Shows the export dialog: the voices, the grouping, the packaging, the options, the timing
 * track names, the checks, a preview of the file and the xLights import steps.
 * "Download" is disabled while an error finding exists or the export has no timing track.
 * After a download the dialog stays open in the done state: a confirmation line and the import steps expanded.
 */
export function ExportDialog({ content, initialOptions, onClose, onDownload }: ExportDialogProps) {
  const { song, voices, sections, marks } = content
  const [options, setOptions] = useState(initialOptions)
  const [storageMessage, setStorageMessage] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [stepsOpen, setStepsOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const sectionHintId = useId()
  const voiceHintId = useId()

  const tracks = useMemo(
    () => buildTracks(song, voices, sections, marks, options),
    [song, voices, sections, marks, options],
  )
  const findings = useMemo(
    () => checkTracks(tracks, song, voices, marks, options),
    [tracks, song, voices, marks, options],
  )
  const files = useMemo(
    () => exportFiles(tracks, song.name, options.packaging),
    [tracks, song.name, options.packaging],
  )

  const defaultNames = useMemo(() => defaultTrackNames(voices, sections), [voices, sections])

  const empty = marks.length === 0
  const noVoice = options.voiceIds.length === 0
  const blocked = findings.some((finding) => finding.type === 'error')
  const firstFile = files[0]

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  function change(update: Partial<ExportOptions>) {
    setDone(null)
    setOptions((current) => ({ ...current, ...update }))
  }

  function toggleVoice(voiceId: string, checked: boolean) {
    change({
      voiceIds: voices
        .filter((voice) => (voice.id === voiceId ? checked : options.voiceIds.includes(voice.id)))
        .map((voice) => voice.id),
    })
  }

  function rename(key: string, name: string) {
    change({ trackNames: { ...options.trackNames, [key]: name } })
  }

  function showMark(markId: string) {
    onClose()
    const view = useViewStore.getState()
    const mark = marks.find((stored) => stored.id === markId)
    // The layers show one voice, so the voice of the mark comes before the selection.
    if (mark) view.selectVoice(mark.voiceId)
    view.selectMarks([markId])
    // At the default zoom the full song is in the width, so every mark is in view already.
    if (mark && view.pxPerSecond !== null) view.setScroll(mark.startMs)
  }

  async function download() {
    try {
      await saveExportOptions(song.id, {
        ...options,
        knownVoiceIds: voices.map((voice) => voice.id),
      })
    } catch (error) {
      if (!(error instanceof StorageFullError)) throw error
      setStorageMessage(error.message)
      return
    }
    onDownload(files)
    setDone(doneLine(tracks.length, files))
    setStepsOpen(true)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The dialog is modal, so a key such as the space bar must not reach the editor shortcuts.
    event.stopPropagation()
    if (event.key === 'Escape') {
      onClose()
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  return (
    <div className="export-backdrop">
      <div
        ref={dialogRef}
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="export-head">
          <h2 id={titleId}>Export to xLights</h2>
          <span>
            {song.name} · Frame size: {song.frameMs} ms
          </span>
        </div>
        <div className="export-body">
          <div className="export-column">
            <fieldset className="export-group">
              <legend>Voices</legend>
              {voices.map((voice) => (
                <label key={voice.id} className="export-option">
                  <input
                    type="checkbox"
                    checked={options.voiceIds.includes(voice.id)}
                    onChange={(event) => toggleVoice(voice.id, event.currentTarget.checked)}
                  />
                  <span className="chip" style={{ background: voice.color }} aria-hidden="true" />
                  {voice.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="export-group">
              <legend>Timing tracks</legend>
              <label className="export-option">
                <input
                  type="radio"
                  name="grouping"
                  checked={options.grouping === 'voice'}
                  onChange={() => change({ grouping: 'voice' })}
                />
                One timing track for each voice
              </label>
              <label className="export-option">
                <input
                  type="radio"
                  name="grouping"
                  checked={options.grouping === 'voice-section'}
                  disabled={sections.length === 0}
                  aria-describedby={sections.length === 0 ? sectionHintId : undefined}
                  onChange={() => change({ grouping: 'voice-section' })}
                />
                One timing track for each voice and section
              </label>
              {sections.length === 0 && (
                <small id={sectionHintId} className="export-hint">
                  This song has no sections.
                </small>
              )}
            </fieldset>
            <PackagingGroup
              packaging={options.packaging}
              fileCount={files.length}
              onChange={(packaging) => change({ packaging })}
            />
            <fieldset className="export-group">
              <legend>Options</legend>
              <label className="export-option">
                <input
                  type="checkbox"
                  checked={options.writeRest}
                  onChange={(event) => change({ writeRest: event.currentTarget.checked })}
                />
                Write rest phonemes in gaps
              </label>
            </fieldset>
          </div>
          <div className="export-column">
            {empty ? (
              <p className="export-empty">No marks to export. Transcribe the song first.</p>
            ) : (
              <>
                <fieldset className="export-group">
                  <legend>Timing track names in xLights</legend>
                  <ol className="export-tracks">
                    {tracks.map((track) => (
                      <li key={track.key}>
                        <input
                          className="text-field"
                          // The default name stays the same while the person edits the name.
                          aria-label={`Name of the timing track for ${defaultNames.get(track.key) ?? track.name}`}
                          value={track.name}
                          onChange={(event) => rename(track.key, event.currentTarget.value)}
                        />
                        <span>3 layers · {plural(track.layers.flat().length, 'mark')}</span>
                      </li>
                    ))}
                  </ol>
                </fieldset>
                <ChecksList findings={findings} onSelectMark={showMark} />
                {firstFile && <FilePreview file={firstFile} />}
              </>
            )}
            <ImportSteps frameMs={song.frameMs} open={stepsOpen} onToggle={setStepsOpen} />
          </div>
        </div>
        {storageMessage && (
          <p className="message" role="alert">
            {storageMessage}
          </p>
        )}
        <div className="export-foot">
          <small>
            {plural(tracks.length, 'timing track')} · {plural(files.length, 'file')}
          </small>
          <span className="spacer" />
          {/* The live region exists before the done line, so a screen reader announces the line. */}
          <span className="export-done" role="status">
            {done}
          </span>
          {noVoice && (
            <small id={voiceHintId} className="export-hint">
              Select one voice or more.
            </small>
          )}
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="button primary"
            disabled={empty || blocked || files.length === 0}
            aria-describedby={noVoice ? voiceHintId : undefined}
            onClick={() => void download()}
          >
            Download
          </button>
        </div>
      </div>
    </div>
  )
}

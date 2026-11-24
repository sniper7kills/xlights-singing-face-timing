import { type KeyboardEvent, useId, useState } from 'react'
import { PHONEME_LABELS } from '../../lib/dictionary/cmuSymbols.ts'
import { formatLength } from '../../lib/time/formatLength.ts'
import { formatTime } from '../../lib/time/formatTime.ts'
import { parseTime } from '../../lib/time/parseTime.ts'
import { resizeMark } from '../../store/actions/resizeMark.ts'
import { setPhonemeLabel } from '../../store/actions/setPhonemeLabel.ts'
import type { Mark } from '../../store/types.ts'
import { saveLabel } from './markCommands.ts'

/** The field error for a typed time that is not a time. The copy is in the feature file. */
const TIME_ERROR = 'Use m:ss.mmm'

/**
 * Keeps the text that the person types in a field until `Enter` or a lost focus saves it.
 * `Escape` gives back the stored value.
 */
function useDraft(stored: string, save: (text: string) => boolean) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && save(draft)) setDraft(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit()
    else if (event.key === 'Escape') setDraft(null)
  }
  return {
    value: draft ?? stored,
    onChange: (event: { currentTarget: HTMLInputElement }) => setDraft(event.currentTarget.value),
    onBlur: commit,
    onKeyDown,
  }
}

type TimeFieldProps = { mark: Mark; edge: 'start' | 'end'; name: string }

/**
 * Shows the time of one edge of a mark as `m:ss.mmm`. A typed time calls `resizeMark`, which is one undo step.
 * The resize rules can move the edge to the nearest legal time, so the field then shows that time.
 * A text that is not a time shows "Use m:ss.mmm" and changes nothing.
 */
function TimeField({ mark, edge, name }: TimeFieldProps) {
  const errorId = useId()
  const [invalid, setInvalid] = useState(false)
  const storedMs = edge === 'start' ? mark.startMs : mark.endMs
  const field = useDraft(formatTime(storedMs), (text) => {
    const ms = parseTime(text)
    setInvalid(ms === null)
    if (ms === null) return false
    if (ms !== storedMs) resizeMark(mark.id, edge, ms)
    return true
  })
  return (
    <div className="inspector-field">
      <label>
        <span>{name}</span>
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          {...field}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setInvalid(false)
            field.onKeyDown(event)
          }}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
        />
      </label>
      {invalid && (
        <p id={errorId} className="field-error" role="alert">
          {TIME_ERROR}
        </p>
      )}
    </div>
  )
}

/**
 * Shows the label of a phrase or a word as a text field.
 * A saved label goes through `saveLabel`, so a phrase label that changes the words opens the same confirm dialog
 * as the label field on the layers.
 */
function TextLabelField({ mark }: { mark: Mark }) {
  const field = useDraft(mark.label, (text) => {
    if (text !== mark.label) saveLabel({ kind: 'edit', id: mark.id }, text, false)
    return true
  })
  return (
    <div className="inspector-field">
      <label>
        <span>Label</span>
        <input type="text" {...field} />
      </label>
    </div>
  )
}

/** Shows the label of a phoneme as a list of the ten phoneme labels. A choice calls `setPhonemeLabel`. */
function PhonemeLabelField({ mark }: { mark: Mark }) {
  return (
    <div className="inspector-field">
      <label>
        <span>Label</span>
        <select
          value={mark.label}
          onChange={(event) => {
            const label = PHONEME_LABELS.find((item) => item === event.currentTarget.value)
            if (label !== undefined) setPhonemeLabel(mark.id, label)
          }}
        >
          {PHONEME_LABELS.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

type MarkFieldsProps = {
  /** The only selected mark. */
  mark: Mark
  /** The frame size of the song in milliseconds. */
  frameMs: number
}

/**
 * Shows the label, the start, the end and the length of the selected mark (FR-editor-27).
 * The person types a start time or an end time (FR-editor-28).
 * The parent gives the component a new key for each mark, so a draft text does not move to another mark.
 */
export function MarkFields({ mark, frameMs }: MarkFieldsProps) {
  return (
    <section className="mark-fields" aria-labelledby="mark-fields-title">
      <h3 id="mark-fields-title">Selected {mark.layer}</h3>
      {mark.layer === 'phoneme' ? (
        <PhonemeLabelField mark={mark} />
      ) : (
        <TextLabelField mark={mark} />
      )}
      <TimeField mark={mark} edge="start" name="Start" />
      <TimeField mark={mark} edge="end" name="End" />
      <div className="inspector-field">
        <span>Length</span>
        <span className="inspector-value">{formatLength(mark.endMs - mark.startMs, frameMs)}</span>
      </div>
    </section>
  )
}

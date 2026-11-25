import { type KeyboardEvent, useId, useState } from 'react'
import { PHONEME_LABELS } from '../../lib/dictionary/cmuSymbols.ts'
import { formatLength } from '../../lib/time/formatLength.ts'
import { formatTime } from '../../lib/time/formatTime.ts'
import { readTime } from '../../lib/time/parseTime.ts'
import { setPhonemeLabel } from '../../store/actions/setPhonemeLabel.ts'
import type { Mark } from '../../store/types.ts'
import { saveLabel, typeEdgeTime } from './markCommands.ts'
import { reportStatus } from './statusStore.ts'

/**
 * Keeps the text that the person types in a field until `Enter` or a lost focus saves it.
 * `Escape` gives back the stored value.
 * A text that `save` refuses shows its field error after `Enter`. After a lost focus, the field gives back
 * the stored value and the status line shows the error, so a wrong text does not stay in the field.
 * @param stored The stored value as text.
 * @param save Saves the text. Returns null, or the field error when the text is wrong.
 */
function useDraft(stored: string, save: (text: string) => string | null) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const commit = (leaving: boolean) => {
    if (draft === null) return
    const refused = save(draft)
    if (refused !== null && !leaving) {
      setError(refused)
      return
    }
    setDraft(null)
    setError(null)
    if (refused !== null) reportStatus(refused)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit(false)
    else if (event.key === 'Escape') {
      setDraft(null)
      setError(null)
    }
  }
  return {
    error,
    input: {
      value: draft ?? stored,
      onChange: (event: { currentTarget: HTMLInputElement }) => setDraft(event.currentTarget.value),
      onBlur: () => commit(true),
      onKeyDown,
    },
  }
}

type TimeFieldProps = { mark: Mark; edge: 'start' | 'end'; name: string; durationMs: number }

/**
 * Shows the time of one edge of a mark as `m:ss.mmm`. A typed time goes to `typeEdgeTime`, which is one undo step.
 * The resize rules can move the edge to the nearest legal time. The field then shows that time, and the status line states the rule.
 * A wrong text shows a field error that states the cause, and changes nothing.
 */
function TimeField({ mark, edge, name, durationMs }: TimeFieldProps) {
  const errorId = useId()
  const storedMs = edge === 'start' ? mark.startMs : mark.endMs
  const { error, input } = useDraft(formatTime(storedMs), (text) => {
    const typed = readTime(text, durationMs)
    if ('error' in typed) return typed.error
    if (typed.ms !== storedMs) typeEdgeTime(mark.id, edge, typed.ms)
    return null
  })
  return (
    <div className="inspector-field">
      <label>
        <span>{name}</span>
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          {...input}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
        />
      </label>
      {error !== null && (
        <p id={errorId} className="field-error" role="alert">
          {error}
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
  const { input } = useDraft(mark.label, (text) => {
    if (text !== mark.label) saveLabel({ kind: 'edit', id: mark.id }, text, false)
    return null
  })
  return (
    <div className="inspector-field">
      <label>
        <span>Label</span>
        <input type="text" {...input} />
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
  /** The length of the song in milliseconds. A typed time after it is an error. */
  durationMs: number
}

/**
 * Shows the label, the start, the end and the length of the selected mark (FR-editor-27).
 * The person types a start time or an end time (FR-editor-28).
 * The parent gives the component a new key for each mark, so a draft text does not move to another mark.
 */
export function MarkFields({ mark, frameMs, durationMs }: MarkFieldsProps) {
  return (
    <section className="mark-fields" aria-labelledby="mark-fields-title">
      <h3 id="mark-fields-title">Selected {mark.layer}</h3>
      {mark.layer === 'phoneme' ? (
        <PhonemeLabelField mark={mark} />
      ) : (
        <TextLabelField mark={mark} />
      )}
      <TimeField mark={mark} edge="start" name="Start" durationMs={durationMs} />
      <TimeField mark={mark} edge="end" name="End" durationMs={durationMs} />
      <div className="inspector-field">
        <span>Length</span>
        <span className="inspector-value">{formatLength(mark.endMs - mark.startMs, frameMs)}</span>
      </div>
    </section>
  )
}

import { type KeyboardEvent, useRef } from 'react'

type LabelEditorProps = {
  /** The text that the field shows first. */
  initial: string
  /** The accessible name of the field. */
  name: string
  /**
   * Receives the text after `Enter` or when the field loses the focus.
   * `refocus` is false when the focus goes to another control, so the mark must not take it back.
   */
  onSave: (text: string, refocus: boolean) => void
  /** Receives `Escape`. */
  onCancel: () => void
  /** Receives the text after each change. */
  onTextChange?: (text: string) => void
}

/**
 * Shows a text field in place of a label. `Enter` and a lost focus save the text, and `Escape` cancels.
 * The field reports one result only, because a save or a cancel removes the field and the removal can blur it.
 */
export function LabelEditor({ initial, name, onSave, onCancel, onTextChange }: LabelEditorProps) {
  const done = useRef(false)

  function finish(run: () => void) {
    if (done.current) return
    done.current = true
    run()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      const text = event.currentTarget.value
      finish(() => onSave(text, true))
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finish(onCancel)
    }
  }

  return (
    <input
      className="label-editor"
      aria-label={name}
      defaultValue={initial}
      // The field opens from a double-click or a key, so the person types at once.
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      onChange={(event) => onTextChange?.(event.currentTarget.value)}
      onBlur={(event) => {
        const text = event.currentTarget.value
        const refocus = event.relatedTarget === null
        finish(() => onSave(text, refocus))
      }}
    />
  )
}

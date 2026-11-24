import { type KeyboardEvent, useId } from 'react'
import { keepFocusInside } from '../../app/modalFocus.ts'
import { endPending } from './markCommands.ts'
import { useMarkUiStore } from './markUiStore.ts'

/**
 * Shows the confirm dialog for a phrase label that changes the words of the phrase.
 * "Continue" sets the label and rebuilds the words. "Cancel" and `Escape` keep the old label.
 * The dialog shows only while a label waits in the mark control store.
 */
export function PhraseLabelDialog() {
  const pending = useMarkUiStore((ui) => ui.pending)
  const textId = useId()
  if (pending === null) return null

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      endPending(false)
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  return (
    // The backdrop keeps the focus in the dialog, so a press outside it does not reach the editor.
    <div className="modal-backdrop" onMouseDown={(event) => event.preventDefault()}>
      <div
        className="dialog phrase-label-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={textId}
        onKeyDown={onKeyDown}
      >
        <p id={textId}>The app rebuilds the words and phonemes of this phrase.</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button primary"
            // The person confirms with Enter, the same as the label field before the dialog.
            autoFocus
            onClick={() => endPending(true)}
          >
            Continue
          </button>
          <button type="button" className="button" onClick={() => endPending(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

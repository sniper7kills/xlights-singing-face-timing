import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { keepFocusInside } from '../../app/modalFocus.ts'

type DeleteVoiceDialogProps = {
  /** The name of the voice that the person deletes. */
  name: string
  /** Receives true for "Delete", and false for "Cancel" or `Escape`. */
  onClose: (confirmed: boolean) => void
}

/**
 * Shows the confirm dialog for the delete of a voice with its marks.
 * When the dialog closes, the focus goes back to the control that had it before the dialog, if that control still exists.
 */
export function DeleteVoiceDialog({ name, onClose }: DeleteVoiceDialogProps) {
  const textId = useId()
  // The first render runs before `autoFocus` moves the focus, so it still sees the control that opened the dialog.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    return () => {
      // A delete removes the row of the opener, so the caller moves the focus then.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [opener])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose(false)
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  return (
    // The backdrop keeps the focus in the dialog, so a press outside it does not reach the editor.
    <div className="modal-backdrop" onMouseDown={(event) => event.preventDefault()}>
      <div
        className="dialog delete-voice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={textId}
        onKeyDown={onKeyDown}
      >
        <p id={textId}>The app deletes “{name}” and its marks.</p>
        <div className="dialog-actions">
          <button type="button" className="button danger" onClick={() => onClose(true)}>
            Delete
          </button>
          {/* A delete has an undo step, but the safe choice still gets the focus. */}
          <button type="button" className="button" autoFocus onClick={() => onClose(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

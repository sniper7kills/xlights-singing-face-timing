import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { keepFocusInside } from '../../app/modalFocus.ts'
import type { FrameMs } from '../../store/types.ts'

type FrameSizeDialogProps = {
  /** The frame size that the person chose. */
  frameMs: FrameMs
  /** Receives true for "Continue", and false for "Cancel" or `Escape`. */
  onClose: (confirmed: boolean) => void
}

/**
 * Shows the confirm dialog for a frame size change, which moves every mark of the song.
 * When the dialog closes, the focus goes back to the control that had it before the dialog.
 */
export function FrameSizeDialog({ frameMs, onClose }: FrameSizeDialogProps) {
  const textId = useId()
  // The first render runs before `autoFocus` moves the focus, so it still sees the control that opened the dialog.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
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
        className="dialog frame-size-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={textId}
        onKeyDown={onKeyDown}
      >
        <p id={textId}>The app moves every mark of this song to a multiple of {frameMs} ms.</p>
        <div className="dialog-actions">
          <button type="button" className="button primary" autoFocus onClick={() => onClose(true)}>
            Continue
          </button>
          <button type="button" className="button" onClick={() => onClose(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

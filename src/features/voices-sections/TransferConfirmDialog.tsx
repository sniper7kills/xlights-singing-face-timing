import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { keepFocusInside } from '../../app/modalFocus.ts'
import { useSongStore } from '../../store/songStore.ts'
import { plural } from '../xtiming-export/plural.ts'
import { endTransfer, useTransferStore } from './transferCommands.ts'

type DialogProps = {
  voiceName: string
  count: number
}

function ConfirmDialog({ voiceName, count }: DialogProps) {
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
      endTransfer(false)
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  return (
    // The backdrop keeps the focus in the dialog, so a press outside it does not reach the editor.
    <div className="modal-backdrop" onMouseDown={(event) => event.preventDefault()}>
      <div
        className="dialog transfer-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={textId}
        onKeyDown={onKeyDown}
      >
        <p id={textId}>
          {voiceName} has {plural(count, 'phrase')} in this range.{' '}
          {count === 1 ? 'Replace it?' : 'Replace them?'}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button primary" onClick={() => endTransfer(true)}>
            Continue
          </button>
          {/* A replace has an undo step, but the safe choice still gets the focus. */}
          <button type="button" className="button" autoFocus onClick={() => endTransfer(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Shows the confirm dialog of the pending transfer, when one exists:
 * "<voice name> has <n> phrases in this range. Replace them?" with "Continue" and "Cancel". `Escape` is "Cancel".
 * When the dialog closes, the focus goes back to the control that had it before the dialog, if that control can take it.
 */
export function TransferConfirmDialog() {
  const pending = useTransferStore((state) => state.pending)
  const voices = useSongStore((state) => state.current?.voices)
  const voice = voices?.find((item) => item.id === pending?.toVoiceId)
  if (pending === null || voice === undefined) return null
  return <ConfirmDialog voiceName={voice.name} count={pending.count} />
}

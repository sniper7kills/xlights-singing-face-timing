import { blockText } from '../../lib/marks/editBlocks.ts'
import { useSongStore } from '../../store/songStore.ts'
import { ReasonButton } from './ReasonButton.tsx'
import { reportStatus } from './statusStore.ts'

/**
 * Shows the "Undo" and "Redo" buttons of the transport.
 * A button does not act when the history has no step in its direction, and its tooltip states the reason.
 */
export function UndoRedoButtons() {
  const canUndo = useSongStore((state) => state.history.past.length > 0)
  const canRedo = useSongStore((state) => state.history.future.length > 0)
  return (
    <div className="undo-redo" role="group" aria-label="Undo and redo">
      <ReasonButton
        reason={canUndo ? null : blockText('no-undo')}
        hint="Undo"
        shortcut="Ctrl+Z"
        aria-keyshortcuts="Control+Z Meta+Z"
        onBlocked={reportStatus}
        onAct={() => useSongStore.getState().undo()}
      >
        Undo
      </ReasonButton>
      <ReasonButton
        reason={canRedo ? null : blockText('no-redo')}
        hint="Redo"
        shortcut="Ctrl+Shift+Z"
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        onBlocked={reportStatus}
        onAct={() => useSongStore.getState().redo()}
      >
        Redo
      </ReasonButton>
    </div>
  )
}

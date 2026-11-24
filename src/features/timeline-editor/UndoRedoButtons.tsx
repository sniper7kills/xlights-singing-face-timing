import { useSongStore } from '../../store/songStore.ts'

/**
 * Shows the "Undo" and "Redo" buttons of the transport.
 * Each button is disabled when the history has no step in its direction.
 */
export function UndoRedoButtons() {
  const canUndo = useSongStore((state) => state.history.past.length > 0)
  const canRedo = useSongStore((state) => state.history.future.length > 0)
  return (
    <div className="undo-redo" role="group" aria-label="Undo and redo">
      <button
        type="button"
        className="button"
        disabled={!canUndo}
        aria-keyshortcuts="Control+Z Meta+Z"
        title="Undo (Ctrl+Z)"
        onClick={() => useSongStore.getState().undo()}
      >
        Undo
      </button>
      <button
        type="button"
        className="button"
        disabled={!canRedo}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        title="Redo (Ctrl+Shift+Z)"
        onClick={() => useSongStore.getState().redo()}
      >
        Redo
      </button>
    </div>
  )
}

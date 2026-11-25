import { useSyncExternalStore } from 'react'
import { isFolded, type SidePanel, usePanelFolds } from '../../store/panelFolds.ts'

function subscribeToResize(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

function windowWidth(): number {
  return window.innerWidth
}

/** Returns true when the side panel is folded now. See `isFolded`. */
export function useFolded(panel: SidePanel): boolean {
  const choice = usePanelFolds((state) => state.choices[panel])
  return isFolded(choice, useSyncExternalStore(subscribeToResize, windowWidth))
}

/** Returns the fold state of both side panels as the data attributes of the editor, which CSS reads for the grid. */
export function useFoldAttributes(): { 'data-voices': string; 'data-inspector': string } {
  const voices = useFolded('voices')
  const inspector = useFolded('inspector')
  return {
    'data-voices': voices ? 'folded' : 'open',
    'data-inspector': inspector ? 'folded' : 'open',
  }
}

const NAMES: Record<SidePanel, string> = { voices: 'Voices', inspector: 'Inspector' }

/**
 * Shows the fold button of a side panel, on the edge of the panel next to the stage.
 * The editor reads the same state and gives the column of a folded panel only the width of this button.
 * The arrow points to the side where the panel moves, and `aria-expanded` gives the state to a screen reader.
 */
export function PanelFold({ panel }: { panel: SidePanel }) {
  const folded = useFolded(panel)
  const toStage = (panel === 'voices') === folded
  const name = NAMES[panel]
  return (
    <button
      type="button"
      className="panel-fold"
      data-panel={panel}
      aria-expanded={!folded}
      title={
        folded ? `Show the ${name.toLowerCase()} panel` : `Hide the ${name.toLowerCase()} panel`
      }
      onClick={() => usePanelFolds.getState().setFolded(panel, !folded)}
    >
      <span aria-hidden="true">{toStage ? '›' : '‹'}</span>
      <span className="visually-hidden">{name}</span>
    </button>
  )
}

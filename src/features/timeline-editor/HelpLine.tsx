import { findMark } from '../../lib/marks/family.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { rangeToPx } from './timeScale.ts'
import { useStageScale } from './useStageScale.ts'

/** The help texts of the layers. The copy is in the timeline editor feature file. */
export const HELP_TEXTS = {
  none: 'Click a mark to select it. Double-click a mark to change its label. Double-click an empty place to add a mark.',
  mark: 'Drag an edge to change the time. Drag the mark to move it.',
  phoneme: 'Click the phoneme again to choose a mouth shape.',
  shift: 'Hold Shift and click to select more than one mark.',
  keys: 'Press [ or ] to select the previous or the next mark.',
  zoom: 'Zoom in to edit short marks. Press Z.',
} as const

/** A selected phoneme narrower than this width gets the zoom hint. */
const ZOOM_HINT_PX = 12

type HelpState = 'none' | 'mark' | 'phoneme'

function helpState(layer: string | undefined, count: number): HelpState {
  if (count === 0) return 'none'
  return count === 1 && layer === 'phoneme' ? 'phoneme' : 'mark'
}

/**
 * Shows one line of help under the layers. The text changes with the selection:
 * no selected mark, a selected phrase or word (or more than one mark), or one selected phoneme.
 * With no selected mark or one selected mark, the line also tells how to select more than one mark.
 * With one selected mark, it also names the keys that select the previous or the next mark.
 * With one selected phoneme narrower than 12 px, it also offers the zoom.
 */
export function HelpLine() {
  const ids = useViewStore((view) => view.selectedMarkIds)
  const mark = useSongStore((state) => findMark(state.current?.marks ?? [], ids[0] ?? ''))
  const durationMs = useSongStore((state) => state.current?.song.durationMs ?? 0)
  const { scale } = useStageScale(durationMs)
  const state = helpState(mark?.layer, ids.length)
  const narrow =
    state === 'phoneme' && mark !== undefined && rangeToPx(scale, mark).widthPx < ZOOM_HINT_PX
  return (
    <p className="help-line" data-state={state}>
      {HELP_TEXTS[state]}
      {ids.length <= 1 && ` ${HELP_TEXTS.shift}`}
      {ids.length === 1 && ` ${HELP_TEXTS.keys}`}
      {narrow && ` ${HELP_TEXTS.zoom}`}
    </p>
  )
}

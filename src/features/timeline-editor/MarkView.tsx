import { useEffect, useRef } from 'react'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { editLabel } from './markCommands.ts'
import { useMarkUiStore } from './markUiStore.ts'
import { rangeToPx, type TimeScale } from './timeScale.ts'
import { useMarkDrag } from './useMarkDrag.ts'

type MarkViewProps = {
  mark: Mark
  scale: TimeScale
  /** True for the one mark of the layer that `Tab` reaches from outside the layer. No value means false. */
  tabStop?: boolean
}

/** Returns the value of a state attribute: `'true'` when the state is on, and no attribute when it is off. */
function flag(on: boolean): 'true' | undefined {
  return on ? 'true' : undefined
}

/** Returns the word states that the layer shows. Only a word can be unknown or estimated. */
function wordStates(mark: Mark): { unknown: boolean; estimated: boolean } {
  const word = mark.layer === 'word'
  return { unknown: word && mark.unknown === true, estimated: word && mark.estimated === true }
}

/**
 * Shows one mark at its time, with the pointer controls of `useMarkDrag`.
 * CSS cuts a long label with an ellipsis, and the tooltip shows the full label.
 * A selected mark has `aria-current`, and CSS gives it an outline and two edge handles.
 * An unknown word has `data-unknown`, and CSS gives it a dotted border.
 * An estimated word has `data-estimated`, and CSS gives it an inner dashed frame.
 * A double-click opens the label control of the mark.
 */
export function MarkView({ mark: stored, scale, tabStop = false }: MarkViewProps) {
  // During a drag, the preview gives the state of this mark. Null hides a phoneme that the drag removes.
  const preview = useMarkUiStore((ui) => ui.preview.get(stored.id))
  const focus = useMarkUiStore((ui) => ui.focusId === stored.id)
  const selected = useViewStore((view) => view.selectedMarkIds.includes(stored.id))
  const handlers = useMarkDrag(stored.id)
  const element = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (!focus) return
    element.current?.focus()
    useMarkUiStore.getState().requestFocus(null)
  }, [focus])

  if (preview === null) return null
  const mark = preview ?? stored
  const { leftPx, widthPx } = rangeToPx(scale, mark)
  const { unknown, estimated } = wordStates(mark)
  return (
    <li
      ref={element}
      className={`mark mark-${mark.layer}`}
      data-mark-id={mark.id}
      // The phoneme colour comes from the label, so CSS selects it by this attribute.
      data-label={mark.layer === 'phoneme' ? mark.label : undefined}
      // A list item has no `aria-selected`, so `aria-current` tells a screen reader which mark is selected.
      aria-current={flag(selected)}
      data-unknown={flag(unknown)}
      data-estimated={flag(estimated)}
      // Each mark takes the focus from a click or a key. Only one mark of each layer is a Tab stop.
      tabIndex={tabStop ? 0 : -1}
      title={mark.label}
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
      onDoubleClick={() => editLabel(mark.id)}
      {...handlers}
    >
      <span className="mark-label">{mark.label}</span>
      {/* A screen reader cannot see the border styles, so it reads these texts. */}
      {estimated && <span className="visually-hidden"> (estimated time)</span>}
      {unknown && <span className="visually-hidden"> (unknown word)</span>}
      {selected && (
        <>
          <span className="mark-handle" data-edge="start" aria-hidden="true" />
          <span className="mark-handle" data-edge="end" aria-hidden="true" />
        </>
      )}
    </li>
  )
}

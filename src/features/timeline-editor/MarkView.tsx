import { useEffect, useRef } from 'react'
import { isShortMark } from '../../lib/marks/limits.ts'
import { formatTime } from '../../lib/time/formatTime.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { editLabel } from './markCommands.ts'
import { useMarkUiStore } from './markUiStore.ts'
import { markShape, rangeToPx, type TimeScale } from './timeScale.ts'
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

/**
 * Returns true when the mark has the short look. A phoneme is often one frame long, so only a phrase and a word can be short.
 * @param frameMs The frame size of the open song. Undefined when no song is open.
 */
function shortLook(mark: Mark, frameMs: number | undefined): boolean {
  return mark.layer !== 'phoneme' && frameMs !== undefined && isShortMark(mark, frameMs)
}

/** Returns the data attributes of the drawn states of a mark, which CSS reads. */
function markData(mark: Mark, selected: boolean, frameMs: number | undefined, widthPx: number) {
  const { unknown, estimated } = wordStates(mark)
  const shape = markShape(widthPx)
  const handles = shape.outerHandles ? 'outer' : 'inner'
  return {
    'data-unknown': flag(unknown),
    'data-estimated': flag(estimated),
    'data-short': flag(shortLook(mark, frameMs)),
    'data-narrow': flag(shape.narrow),
    'data-handles': selected ? handles : undefined,
  }
}

/** The texts that a screen reader reads for the drawn states of a mark, in this order. */
const STATE_TEXTS = [
  ['data-estimated', ' (estimated time)'],
  ['data-unknown', ' (unknown word)'],
  ['data-short', ' (short mark)'],
] as const

/** Returns the word states that the layer shows. Only a word can be unknown or estimated. */
function wordStates(mark: Mark): { unknown: boolean; estimated: boolean } {
  const word = mark.layer === 'word'
  return { unknown: word && mark.unknown === true, estimated: word && mark.estimated === true }
}

/**
 * Shows one mark at its time, with the pointer controls of `useMarkDrag`.
 * CSS cuts a long label with an ellipsis, and the tooltip shows the full label with the start and the end.
 * A selected mark has `aria-current`, and CSS gives it an outline and two edge handles.
 * An unknown word has `data-unknown`, and CSS gives it a dotted border.
 * An estimated word has `data-estimated`, and CSS gives it an inner dashed frame.
 * A phrase or a word shorter than 3 frames has `data-short`, and CSS gives it a lower bar with stripes.
 * The mark draws from its start to its end and no wider, so it never covers the next mark of the layer.
 * A mark narrower than `LABEL_MIN_PX` has `data-narrow`: it shows no label and no border, and only a screen reader reads the label.
 * A selected mark narrower than `INNER_HANDLES_MIN_PX` has `data-handles="outer"`: its handles hang under the bar, outside the mark.
 * A double-click opens the label control of the mark.
 */
export function MarkView({ mark: stored, scale, tabStop = false }: MarkViewProps) {
  // During a drag, the preview gives the state of this mark. Null hides a phoneme that the drag removes.
  const preview = useMarkUiStore((ui) => ui.preview.get(stored.id))
  const focus = useMarkUiStore((ui) => ui.focusId === stored.id)
  const selected = useViewStore((view) => view.selectedMarkIds.includes(stored.id))
  const frameMs = useSongStore((state) => state.current?.song.frameMs)
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
  const data = markData(mark, selected, frameMs, widthPx)
  const stateText = STATE_TEXTS.filter(([key]) => data[key] === 'true')
    .map(([, text]) => text)
    .join('')
  return (
    <li
      ref={element}
      className={`mark mark-${mark.layer}`}
      data-mark-id={mark.id}
      // The phoneme colour comes from the label, so CSS selects it by this attribute.
      data-label={mark.layer === 'phoneme' ? mark.label : undefined}
      // A list item has no `aria-selected`, so `aria-current` tells a screen reader which mark is selected.
      aria-current={flag(selected)}
      {...data}
      // Each mark takes the focus from a click or a key. Only one mark of each layer is a Tab stop, and `[` and `]` move along the layer.
      tabIndex={tabStop ? 0 : -1}
      title={`${mark.label}\n${formatTime(mark.startMs)} to ${formatTime(mark.endMs)}`}
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
      onDoubleClick={() => editLabel(mark.id)}
      {...handlers}
    >
      <span className={data['data-narrow'] ? 'visually-hidden' : 'mark-label'}>{mark.label}</span>
      {/* A screen reader cannot see the border styles, so it reads these texts. */}
      {stateText !== '' && <span className="visually-hidden">{stateText}</span>}
      {selected && (
        <>
          <span className="mark-handle" data-edge="start" aria-hidden="true" />
          <span className="mark-handle" data-edge="end" aria-hidden="true" />
        </>
      )}
    </li>
  )
}

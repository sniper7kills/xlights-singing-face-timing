import { type MouseEvent, useId } from 'react'
import { findMark } from '../../lib/marks/family.ts'
import { addRangeAt } from '../../lib/marks/selection.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { canAddMark } from '../../store/actions/addMark.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Layer, Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { LabelEditor } from './LabelEditor.tsx'
import { choosePhoneme, closeLabel, saveLabel } from './markCommands.ts'
import { type OpenLabel, useMarkUiStore } from './markUiStore.ts'
import { MarkView } from './MarkView.tsx'
import { PhonemeLabelMenu } from './PhonemeLabelMenu.tsx'
import { rangeToPx, type TimeScale, timeAtPx } from './timeScale.ts'

type LayerRowProps = {
  /** The name of the layer that the row shows above its marks. */
  name: string
  layer: Layer
  /** The voice that the layers show. */
  voiceId: string
  /** The marks of the layer that are in view. */
  marks: Mark[]
  scale: TimeScale
}

const FIELD_NAMES: Record<Layer, string> = {
  phrase: 'Phrase label',
  word: 'Word label',
  phoneme: 'Phoneme label',
}

type RowControl = {
  control: OpenLabel['control']
  target: OpenLabel['target']
  /** The range of the control: the mark that it changes, or the range of the mark that it adds. */
  range: TimeRange
  /** The label of the mark that the control changes. Undefined for a new mark. */
  label: string | undefined
}

/**
 * Returns the open label control when it belongs to this row, or undefined.
 * @param open The open label control of the mark control store.
 * @param marks The marks of the row that are in view. A mark out of view gets no control.
 */
function controlInRow(
  open: OpenLabel | null,
  marks: readonly Mark[],
  layer: Layer,
  voiceId: string,
): RowControl | undefined {
  if (open === null) return undefined
  const { control, target } = open
  if (target.kind === 'add')
    return target.layer === layer && target.voiceId === voiceId
      ? { control, target, range: target, label: undefined }
      : undefined
  const mark = findMark(marks, target.id)
  return mark && { control, target, range: mark, label: mark.label }
}

/**
 * Shows one layer: its name, its marks on the time scale and the open label control of the layer.
 * A click in an empty range clears the selection. A double-click in an empty range adds a mark there,
 * after the person types its label or chooses its phoneme label.
 */
export function LayerRow({ name, layer, voiceId, marks, scale }: LayerRowProps) {
  const nameId = useId()
  const selectedMarkIds = useViewStore((view) => view.selectedMarkIds)
  const open = controlInRow(
    useMarkUiStore((ui) => ui.open),
    marks,
    layer,
    voiceId,
  )
  // `Tab` reaches the selected mark of the layer, or else the first mark in view.
  const tabStopId = marks.find((mark) => selectedMarkIds.includes(mark.id))?.id ?? marks[0]?.id

  function onEmptyClick(event: MouseEvent<HTMLUListElement>) {
    if (event.target === event.currentTarget) useViewStore.getState().selectMarks([])
  }

  function onEmptyDoubleClick(event: MouseEvent<HTMLUListElement>) {
    const content = useSongStore.getState().current
    if (event.target !== event.currentTarget || !content) return
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left
    const range = addRangeAt(timeAtPx(scale, x, content.song.durationMs), content.song.frameMs)
    if (!canAddMark(voiceId, layer, range.startMs, range.endMs)) return
    useMarkUiStore.getState().openLabel({
      control: layer === 'phoneme' ? 'menu' : 'text',
      target: { kind: 'add', voiceId, layer, ...range },
    })
  }

  return (
    <div className="layer-row">
      <span id={nameId} className="layer-name">
        {name}
      </span>
      <div className="layer-body">
        <ul
          className="layer-track"
          aria-labelledby={nameId}
          onClick={onEmptyClick}
          onDoubleClick={onEmptyDoubleClick}
        >
          {marks.map((mark) => (
            <MarkView key={mark.id} mark={mark} scale={scale} tabStop={mark.id === tabStopId} />
          ))}
        </ul>
        {open && (
          <div
            className="label-control"
            style={{ left: `${Math.max(0, rangeToPx(scale, open.range).leftPx)}px` }}
          >
            {open.control === 'text' ? (
              <LabelEditor
                initial={open.label ?? ''}
                name={FIELD_NAMES[layer]}
                onSave={(text, refocus) => saveLabel(open.target, text, refocus)}
                onCancel={() => closeLabel(open.target)}
              />
            ) : (
              <PhonemeLabelMenu
                current={open.label}
                onChoose={(label) => choosePhoneme(open.target, label)}
                onClose={(refocus) => closeLabel(open.target, refocus)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

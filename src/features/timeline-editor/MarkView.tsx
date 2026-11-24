import type { Mark } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { rangeToPx, type TimeScale } from './timeScale.ts'

type MarkViewProps = {
  mark: Mark
  scale: TimeScale
}

/**
 * Shows one mark at its time. CSS cuts a long label with an ellipsis, and the
 * tooltip shows the full label. A selected mark has `aria-current`, and CSS gives it an outline.
 */
export function MarkView({ mark, scale }: MarkViewProps) {
  const selected = useViewStore((view) => view.selectedMarkIds.includes(mark.id))
  const { leftPx, widthPx } = rangeToPx(scale, mark)
  return (
    <li
      className={`mark mark-${mark.layer}`}
      // The phoneme colour comes from the label, so CSS selects it by this attribute.
      data-label={mark.layer === 'phoneme' ? mark.label : undefined}
      // A list item has no `aria-selected`, so `aria-current` tells a screen reader which mark is selected.
      aria-current={selected ? 'true' : undefined}
      title={mark.label}
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
    >
      <span className="mark-label">{mark.label}</span>
    </li>
  )
}

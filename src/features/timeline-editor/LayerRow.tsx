import { useId } from 'react'
import type { Mark } from '../../store/types.ts'
import { MarkView } from './MarkView.tsx'
import type { TimeScale } from './timeScale.ts'

type LayerRowProps = {
  /** The name of the layer that the row shows above its marks. */
  name: string
  /** The marks of the layer that are in view. */
  marks: Mark[]
  scale: TimeScale
}

/** Shows one layer: its name and its marks on the time scale. */
export function LayerRow({ name, marks, scale }: LayerRowProps) {
  const nameId = useId()
  return (
    <div className="layer-row">
      <span id={nameId} className="layer-name">
        {name}
      </span>
      <ul className="layer-track" aria-labelledby={nameId}>
        {marks.map((mark) => (
          <MarkView key={mark.id} mark={mark} scale={scale} />
        ))}
      </ul>
    </div>
  )
}

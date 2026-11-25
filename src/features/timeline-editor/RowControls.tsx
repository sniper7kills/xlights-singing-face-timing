import { isMuted } from '../../lib/audio/trackMix.ts'
import { toggleMute, toggleSolo, useTrackMixStore } from '../../store/trackMixStore.ts'

type RowControlsProps = {
  rowId: string
  /** The row name. The control names end with it. */
  name: string
  /** The tooltip of the row name, if the name needs an explanation. */
  tooltip?: string
}

/** Shows the name of a track row and its "Mute" and "Solo" toggle buttons. */
export function RowControls({ rowId, name, tooltip }: RowControlsProps) {
  const muted = useTrackMixStore((state) => isMuted(state, rowId))
  const soloed = useTrackMixStore((state) => state.soloed.includes(rowId))
  return (
    // A press on a control must not start a time selection or a seek on the waveform under it.
    <div className="row-controls" onPointerDown={(event) => event.stopPropagation()}>
      <span className="row-name" title={tooltip}>
        {name}
      </span>
      <button
        type="button"
        className="row-toggle"
        aria-label={`Mute ${name}`}
        title={`Mute ${name}`}
        aria-pressed={muted}
        onClick={() => toggleMute(rowId)}
      >
        M
      </button>
      <button
        type="button"
        className="row-toggle"
        aria-label={`Solo ${name}`}
        title={`Solo ${name}`}
        aria-pressed={soloed}
        onClick={() => toggleSolo(rowId)}
      >
        S
      </button>
    </div>
  )
}

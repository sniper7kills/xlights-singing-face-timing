import { memo } from 'react'
import { isMutePressed, rowSound, rowSoundText } from '../../lib/audio/trackMix.ts'
import { toggleMute, toggleSolo, useTrackMixStore } from '../../store/trackMixStore.ts'

/** The tooltip of "Mute". The name for assistive technology stays "Mute <row name>". */
export const MUTE_NOTE = 'Mute: do not play this track.'
/** The tooltip of "Solo". The name for assistive technology stays "Solo <row name>". */
export const SOLO_NOTE = 'Solo: play only this track.'

type RowControlsProps = {
  rowId: string
  /** The row name. The control names end with it. */
  name: string
  /** The tooltip of the row name, if the name needs an explanation. */
  tooltip?: string
  /**
   * Receives the row id in the click on "Mute" or "Solo", after the change of the state.
   * The track rows start the audio element of the row in it, because a browser can accept a play only in an action of the person.
   */
  onToggle?: (rowId: string) => void
}

/**
 * Shows the name of a track row, the sign that tells whether the row sounds now, and its "Mute" and "Solo" toggle buttons.
 * The memo keeps the controls out of the render of the waveform region on each play time.
 */
export const RowControls = memo(function RowControls({
  rowId,
  name,
  tooltip,
  onToggle,
}: RowControlsProps) {
  const muted = useTrackMixStore((state) => isMutePressed(state, rowId))
  const soloed = useTrackMixStore((state) => state.soloed.includes(rowId))
  const plays = useTrackMixStore((state) => rowSound(state, rowId).plays)
  const soundText = useTrackMixStore((state) => rowSoundText(rowSound(state, rowId)))
  return (
    // A press on a control must not start a time selection or a seek on the waveform.
    <div className="row-controls" onPointerDown={(event) => event.stopPropagation()}>
      <span className="row-name" title={tooltip}>
        {name}
      </span>
      <span className="row-sound" data-plays={plays} title={soundText}>
        <span aria-hidden="true">{plays ? '🔊' : '🔇'}</span>
        <span className="visually-hidden">{plays ? 'plays' : 'silent'}</span>
      </span>
      <button
        type="button"
        className="row-toggle"
        aria-label={`Mute ${name}`}
        title={MUTE_NOTE}
        aria-pressed={muted}
        onClick={() => {
          toggleMute(rowId)
          onToggle?.(rowId)
        }}
      >
        Mute
      </button>
      <button
        type="button"
        className="row-toggle"
        aria-label={`Solo ${name}`}
        title={SOLO_NOTE}
        aria-pressed={soloed}
        onClick={() => {
          toggleSolo(rowId)
          onToggle?.(rowId)
        }}
      >
        Solo
      </button>
    </div>
  )
})

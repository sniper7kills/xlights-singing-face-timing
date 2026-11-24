import { useState } from 'react'
import { loopRange } from '../../lib/marks/loopRange.ts'
import { setFrameMs } from '../../store/actions/setFrameMs.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { FrameMs } from '../../store/types.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { FrameSizeDialog } from './FrameSizeDialog.tsx'
import { loopSelection, PLAY_RATES, setPlayRate, usePlayerStore } from './playerStore.ts'
import { useEditorKeys } from './useEditorKeys.ts'

const FRAME_SIZES: readonly FrameMs[] = [25, 50]

/** The loop shortcut. `L` is the same key with Shift or with Caps Lock. */
const LOOP_KEYS = ['l', 'L'] as const

function SegmentButton({
  label,
  pressed,
  disabled,
  onClick,
}: {
  label: string
  pressed: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="segment"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/**
 * Shows the play tools of the transport: the "Loop" button, the play speed and the frame size, and registers the `L` key.
 * The loop and the play speed are disabled until the audio is ready, so they stay disabled when the audio is missing.
 * The frame size is an edit, so it works with no audio. A change of the frame size asks for a confirm first when the song has marks.
 */
export function TransportControls() {
  const content = useSongStore((state) => state.current)
  const selectedMarkIds = useViewStore((view) => view.selectedMarkIds)
  const selection = useViewStore((view) => view.selection)
  const { player, looping, playRate } = usePlayerStore()
  const [pendingFrameMs, setPendingFrameMs] = useState<FrameMs | null>(null)
  // loopSelection returns false with nothing to loop, so the key goes on to the next registration.
  useEditorKeys(Object.fromEntries(LOOP_KEYS.map((key) => [key, loopSelection])))
  if (content === null) return null
  const { song, marks } = content
  const canLoop = player !== null && loopRange(marks, selectedMarkIds, selection) !== null

  function chooseFrameMs(frameMs: FrameMs) {
    if (frameMs === song.frameMs) return
    if (marks.length === 0) setFrameMs(song.id, frameMs)
    else setPendingFrameMs(frameMs)
  }

  return (
    <div className="transport-controls">
      <button
        type="button"
        className="button"
        aria-pressed={looping}
        aria-keyshortcuts="L"
        // A loop that plays stays stoppable after the person clears the selection.
        disabled={!looping && !canLoop}
        title="Play the selection in a loop (L)"
        onClick={() => (looping ? player?.pause() : loopSelection())}
      >
        Loop
      </button>
      <div className="segments" role="group" aria-label="Play speed">
        {PLAY_RATES.map((rate) => (
          <SegmentButton
            key={rate}
            label={`${rate * 100}%`}
            pressed={rate === playRate}
            disabled={player === null}
            onClick={() => setPlayRate(rate)}
          />
        ))}
      </div>
      <div className="segments" role="group" aria-label="Frame size">
        {FRAME_SIZES.map((frameMs) => (
          <SegmentButton
            key={frameMs}
            label={`${frameMs} ms`}
            pressed={frameMs === song.frameMs}
            onClick={() => chooseFrameMs(frameMs)}
          />
        ))}
      </div>
      {pendingFrameMs !== null && (
        <FrameSizeDialog
          frameMs={pendingFrameMs}
          onClose={(confirmed) => {
            if (confirmed) setFrameMs(song.id, pendingFrameMs)
            setPendingFrameMs(null)
          }}
        />
      )}
    </div>
  )
}

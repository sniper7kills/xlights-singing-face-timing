import type { FrameMs } from '../../store/types.ts'

type ImportStepsProps = {
  /** The frame size of the song. Step 2 shows it. */
  frameMs: FrameMs
  /** True when the steps are expanded. */
  open: boolean
  /** Receives the new state after the person expands or collapses the steps. */
  onToggle: (open: boolean) => void
}

/**
 * Shows the import steps region of the export dialog: the seven xLights import steps and two notes.
 * The step text is the "Import steps text" of `docs/specs/features/06-xtiming-export.md`.
 */
export function ImportSteps({ frameMs, open, onToggle }: ImportStepsProps) {
  return (
    <details
      className="export-group export-steps"
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary>Next, in xLights</summary>
      <ol>
        <li>Open the sequence in xLights. Use the same audio file, so the times match.</li>
        <li>
          Check the frame size: Sequence Settings shows 25 ms or 50 ms. It must match the frame size
          in this dialog: <b>{frameMs} ms</b>.
          <small className="export-hint">
            If the song has a frame size of 25 ms and the sequence has 50 ms, xLights moves each
            time down to a multiple of 50 ms.
          </small>
        </li>
        <li>
          Right-click a timing row heading and select <b>&quot;Import Timing Track&quot;</b>.
        </li>
        <li>
          Select the <b>.xtiming</b> file. If the file has several timing tracks, xLights adds one
          timing track for each.
          <small className="export-hint">
            If a timing track with the same name exists in the sequence, xLights renames the
            imported timing track.
          </small>
        </li>
        <li>Drop a Faces effect on the row of the face model.</li>
        <li>
          In the effect settings, under &quot;Mouth Movements&quot;, select the timing track for
          that face model.
        </li>
        <li>Repeat steps 5 and 6 for each face model.</li>
      </ol>
    </details>
  )
}

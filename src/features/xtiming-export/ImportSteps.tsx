import {
  FACE_MODEL_STEPS_HEADING,
  faceModelSteps,
  importSteps,
  type ImportStep,
} from '../../lib/xtiming/importSteps.ts'
import type { FrameMs } from '../../store/types.ts'

type ImportStepsProps = {
  /** The frame size of the song. Step 2 shows it. */
  frameMs: FrameMs
  /** True when the steps are expanded. */
  open: boolean
  /** Receives the new state after the person expands or collapses the steps. */
  onToggle: (open: boolean) => void
}

function StepList({ steps, label }: { steps: ImportStep[]; label: string }) {
  return (
    <ol aria-label={label}>
      {steps.map((step, index) => (
        // The steps are a fixed list, so the index is a stable key.
        <li key={index}>
          {step.parts.map((part, partIndex) =>
            typeof part === 'string' ? part : <b key={partIndex}>{part.bold}</b>,
          )}
          {step.note !== undefined && <small className="export-hint">{step.note}</small>}
        </li>
      ))}
    </ol>
  )
}

/**
 * Shows the import steps region of the export dialog: the seven xLights import steps,
 * then the steps for several face models.
 * The step text comes from `importSteps` and `faceModelSteps`, which the `README.txt` of the zip file also reads.
 */
export function ImportSteps({ frameMs, open, onToggle }: ImportStepsProps) {
  return (
    <details
      className="export-group export-steps"
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary>Next, in xLights</summary>
      <StepList steps={importSteps(frameMs)} label="Import steps" />
      <p className="export-steps-heading">{FACE_MODEL_STEPS_HEADING}</p>
      <StepList steps={faceModelSteps()} label={FACE_MODEL_STEPS_HEADING} />
    </details>
  )
}

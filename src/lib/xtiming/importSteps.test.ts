import { describe, expect, it } from 'vitest'
import { importSteps, importStepsText } from './importSteps.ts'

describe('importSteps', () => {
  it('gives seven steps with the frame size in step 2', () => {
    const steps = importSteps(25)

    expect(steps).toHaveLength(7)
    expect(steps[1]?.parts).toContainEqual({ bold: '25 ms' })
  })
})

describe('importStepsText', () => {
  it('gives one numbered line for each step and indents each note under its step', () => {
    expect(importStepsText(50)).toBe(
      [
        '1. Open the sequence in xLights. Use the same audio file, so the times match.',
        '2. Check the frame size: Sequence Settings shows 25 ms or 50 ms. It must match the frame size in this dialog: 50 ms.',
        '   If the song has a frame size of 25 ms and the sequence has 50 ms, xLights moves each time down to a multiple of 50 ms.',
        '3. Right-click a timing row heading and select "Import Timing Track".',
        '4. Select the .xtiming file. If the file has several timing tracks, xLights adds one timing track for each.',
        '   If a timing track with the same name exists in the sequence, xLights renames the imported timing track.',
        '5. Drop a Faces effect on the row of the face model.',
        '6. In the effect settings, under "Mouth Movements", select the timing track for that face model.',
        '7. Repeat steps 5 and 6 for each face model.',
      ].join('\n'),
    )
  })
})

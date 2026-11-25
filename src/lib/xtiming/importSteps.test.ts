import { describe, expect, it } from 'vitest'
import { faceModelSteps, importSteps, importStepsText } from './importSteps.ts'

describe('importSteps', () => {
  it('gives seven steps with the frame size in step 2', () => {
    const steps = importSteps(25)

    expect(steps).toHaveLength(7)
    expect(steps[1]?.parts).toContainEqual({ bold: '25 ms' })
  })
})

describe('faceModelSteps', () => {
  it('names the ten phoneme labels in the first step', () => {
    expect(faceModelSteps()[0]?.parts).toContainEqual({
      bold: 'AI, E, etc, FV, L, MBP, O, rest, U, WQ',
    })
  })
})

describe('importStepsText', () => {
  it('gives the import steps, then the steps for several face models, each step on a numbered line', () => {
    expect(importStepsText(50)).toBe(
      [
        '1. Open the sequence in xLights. Use the same audio file, so the times match.',
        '2. Check the frame size: in "Sequence Settings", the tab "Info / Media" shows "Sequence Timing". It must match the frame size in this dialog: 50 ms.',
        '   If the song has a frame size of 25 ms and the sequence has 50 ms, xLights moves each time down to a multiple of 50 ms.',
        '3. Right-click a timing row heading and select "Import Timing Track".',
        '4. Select the .xtiming file. If the file has several timing tracks, xLights adds one timing track for each.',
        '   If a timing track with the same name exists in the sequence, xLights adds "_1" to the new name. xLights also removes & < > " \' = and each character that is not ASCII from a timing track name.',
        '5. Drop a Faces effect on the row of the face model. Make the effect as long as the song.',
        '   The effect moves the mouth only during its own time.',
        '6. In the effect settings, under "Mouth Movements", select "Timing Track" and the timing track for that face model.',
        '   The list shows only the timing tracks with three layers.',
        '7. Repeat steps 5 and 6 for each face model.',
        '',
        'Use the timing tracks with several face models:',
        '1. Check that each face model has a face definition with a mouth for each phoneme label: AI, E, etc, FV, L, MBP, O, rest, U, WQ.',
        '   A singing tree or a singing pumpkin from a vendor comes with a face definition. xLights shows no mouth for a phoneme label that the face definition does not have.',
        '2. Drop one Faces effect on the face model that sings the lead.',
        '3. Under "Mouth Movements", select "Timing Track" and the timing track of the lead voice.',
        '4. Drop one Faces effect on each face model that sings the chorus.',
        '   Put the effect on each face model, not on a model group. On a model group, xLights shows only a face definition of the type "Matrix".',
        '5. In each of these effects, select the same timing track: the timing track of the chorus voice.',
      ].join('\n'),
    )
  })
})

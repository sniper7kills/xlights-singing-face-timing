/** One part of the text of an import step. An object part is text that the dialog shows in bold. */
export type ImportStepPart = string | { bold: string }

/** One xLights import step: its text and an optional note under it. */
export interface ImportStep {
  parts: ImportStepPart[]
  note?: string
}

/** The place that shows the steps. Step 2 names the frame size of the song in a different sentence for each. */
export type StepsPlace = 'dialog' | 'file'

/** The heading of the second list: the steps for a show with more than one face model. */
export const FACE_MODEL_STEPS_HEADING = 'Use the timing tracks with several face models'

/**
 * Returns the seven xLights import steps: the "Import steps text" of `docs/specs/features/06-xtiming-export.md`.
 * The export dialog and the `README.txt` of the zip file both show these steps, so the two texts differ only in step 2.
 * The control names are the names in xLights 2026.21.
 * @param frameMs The frame size of the song. Step 2 states it.
 * @param place The place that shows the steps. A file has no dialog, so its step 2 names the song.
 */
export function importSteps(frameMs: number, place: StepsPlace): ImportStep[] {
  const frameParts: ImportStepPart[] =
    place === 'dialog'
      ? ['It must match the frame size in this dialog: ', { bold: `${frameMs} ms` }, '.']
      : [
          'The frame size of this song is ',
          { bold: `${frameMs} ms` },
          '. The frame size of the sequence must be the same.',
        ]
  return [
    { parts: ['Open the sequence in xLights. Use the same audio file, so the times match.'] },
    {
      parts: [
        'Check the frame size: in "Sequence Settings", the tab "Info / Media" shows "Sequence Timing". ',
        ...frameParts,
      ],
      note: 'If the song has a frame size of 25 ms and the sequence has 50 ms, xLights moves each time down to a multiple of 50 ms.',
    },
    {
      parts: [
        'Right-click a timing row heading and select ',
        { bold: '"Import Timing Track"' },
        '.',
      ],
    },
    {
      parts: [
        'Select the ',
        { bold: '.xtiming' },
        ' file. If the file has several timing tracks, xLights adds one timing track for each.',
      ],
      note: 'If a timing track with the same name exists in the sequence, xLights adds "_1" to the new name. xLights also removes & < > " \' = and each character that is not ASCII from a timing track name.',
    },
    {
      parts: [
        'Drop a Faces effect on the row of the face model, from the start to the end of the song.',
      ],
      note: 'The effect moves the mouth only during its own time.',
    },
    {
      parts: [
        'In the effect settings, under "Mouth Movements", select "Timing Track" and the timing track for that face model.',
      ],
      note: 'The list shows only the timing tracks with three layers.',
    },
    { parts: ['Repeat steps 5 and 6 for each face model.'] },
  ]
}

/**
 * Returns the steps for a show with more than one face model: one face model sings the lead, and other face models
 * sing the chorus together. The export dialog and the `README.txt` of the zip file both show these steps.
 * The facts come from a real import into xLights 2026.21.
 */
export function faceModelSteps(): ImportStep[] {
  return [
    {
      parts: [
        'Check that each face model has a face definition with a mouth for each phoneme label: ',
        { bold: 'AI, E, etc, FV, L, MBP, O, rest, U, WQ' },
        '.',
      ],
      note: 'A singing tree or a singing pumpkin from a vendor comes with a face definition. xLights shows no mouth for a phoneme label that the face definition does not have.',
    },
    { parts: ['Drop one Faces effect on the face model that sings the lead.'] },
    {
      parts: [
        'Under "Mouth Movements", select "Timing Track" and the timing track of the lead voice.',
      ],
    },
    {
      parts: ['Drop one Faces effect on each face model that sings the chorus.'],
      note: 'Put the effect on each face model, not on a model group. On a model group, xLights shows only a face definition of the type "Matrix".',
    },
    {
      parts: [
        'In each of these effects, select the same timing track: the timing track of the chorus voice.',
      ],
    },
  ]
}

function stepsText(steps: ImportStep[]): string {
  return steps
    .map((step, index) => {
      const text = step.parts.map((part) => (typeof part === 'string' ? part : part.bold)).join('')
      const line = `${index + 1}. ${text}`
      return step.note === undefined ? line : `${line}\n   ${step.note}`
    })
    .join('\n')
}

/**
 * Returns the import steps and the steps for several face models as plain text.
 * Each list has one numbered line for each step and each note indented under its step.
 * A blank line and the heading of the second list separate the two lists.
 * @param frameMs The frame size of the song.
 */
export function importStepsText(frameMs: number): string {
  return [
    stepsText(importSteps(frameMs, 'file')),
    '',
    `${FACE_MODEL_STEPS_HEADING}:`,
    stepsText(faceModelSteps()),
  ].join('\n')
}

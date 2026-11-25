/** One part of the text of an import step. An object part is text that the dialog shows in bold. */
export type ImportStepPart = string | { bold: string }

/** One xLights import step: its text and an optional note under it. */
export interface ImportStep {
  parts: ImportStepPart[]
  note?: string
}

/**
 * Returns the seven xLights import steps: the "Import steps text" of `docs/specs/features/06-xtiming-export.md`.
 * The export dialog and the `README.txt` of the zip file both show these steps, so the two texts cannot differ.
 * @param frameMs The frame size of the song. Step 2 states it.
 */
export function importSteps(frameMs: number): ImportStep[] {
  return [
    { parts: ['Open the sequence in xLights. Use the same audio file, so the times match.'] },
    {
      parts: [
        'Check the frame size: Sequence Settings shows 25 ms or 50 ms. It must match the frame size in this dialog: ',
        { bold: `${frameMs} ms` },
        '.',
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
      note: 'If a timing track with the same name exists in the sequence, xLights renames the imported timing track.',
    },
    { parts: ['Drop a Faces effect on the row of the face model.'] },
    {
      parts: [
        'In the effect settings, under "Mouth Movements", select the timing track for that face model.',
      ],
    },
    { parts: ['Repeat steps 5 and 6 for each face model.'] },
  ]
}

/**
 * Returns the import steps as plain text: one numbered line for each step, and each note indented under its step.
 * @param frameMs The frame size of the song.
 */
export function importStepsText(frameMs: number): string {
  return importSteps(frameMs)
    .map((step, index) => {
      const text = step.parts.map((part) => (typeof part === 'string' ? part : part.bold)).join('')
      const line = `${index + 1}. ${text}`
      return step.note === undefined ? line : `${line}\n   ${step.note}`
    })
    .join('\n')
}

/**
 * The local speakers of each output class of the pyannote segmentation model, in the order of its `id2label`.
 * The model gives one class for each frame: no speaker, one of three speakers, or one of three pairs.
 */
const POWERSET_CLASSES: readonly (readonly number[])[] = [[], [0], [1], [2], [0, 1], [0, 2], [1, 2]]

/** The count of speakers that the segmentation model tells apart in one window. */
export const LOCAL_SPEAKERS = 3

function maxIndex(values: Float32Array, from: number, count: number): number {
  let best = 0
  for (let index = 1; index < count; index++) {
    if ((values[from + index] ?? 0) > (values[from + best] ?? 0)) best = index
  }
  return best
}

/**
 * Returns the activity of each local speaker in one window: one array for each speaker, with 1 for each frame in which the speaker sings.
 * The class with the highest score wins in each frame. The softmax keeps the order of the scores, so the decoder reads the raw logits.
 * @param logits The scores of the model, frame after frame, with one score for each class.
 */
export function decodePowerset(logits: Float32Array): Uint8Array[] {
  const classes = POWERSET_CLASSES.length
  const frames = Math.floor(logits.length / classes)
  const activity = Array.from({ length: LOCAL_SPEAKERS }, () => new Uint8Array(frames))
  for (let frame = 0; frame < frames; frame++) {
    for (const speaker of POWERSET_CLASSES[maxIndex(logits, frame * classes, classes)] ?? []) {
      const speakerActivity = activity[speaker]
      if (speakerActivity !== undefined) speakerActivity[frame] = 1
    }
  }
  return activity
}

/**
 * Returns the length of a mark in milliseconds and in frames, for example `800 ms · 16 frames`.
 * @param ms The length in milliseconds. It is a multiple of the frame size.
 * @param frameMs The frame size in milliseconds.
 * A length that is not a multiple of the frame size shows the frames rounded to the nearest whole frame.
 */
export function formatLength(ms: number, frameMs: number): string {
  const frames = Math.round(ms / frameMs)
  return `${ms} ms · ${frames} ${frames === 1 ? 'frame' : 'frames'}`
}

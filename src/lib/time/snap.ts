/**
 * Returns the multiple of the frame size that is nearest to a time.
 * A time exactly between two multiples snaps to the later multiple.
 * xLights moves each time to a multiple of the frame size on import, so the app stores only those times.
 * @param ms The time in milliseconds. It can have a fraction.
 * @param frameMs The frame size in milliseconds. It is more than 0.
 */
export function snap(ms: number, frameMs: number): number {
  return Math.round(ms / frameMs) * frameMs
}

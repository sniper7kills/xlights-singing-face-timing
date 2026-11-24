/**
 * Returns the pairs of matched words, as the longest common sequence of the two lists.
 * Each entry of the result is the index of the `source` word that matches the
 * `target` word at the same index, or -1 when the `target` word has no match.
 * The function compares the strings exactly, so the caller normalises them first.
 * @param source The words that give the times, for example the transcribed words or the old words of a phrase.
 * @param target The words that receive the times, for example the lyrics or the new words of a phrase.
 */
export function matchWords(source: readonly string[], target: readonly string[]): number[] {
  const rows = target.length + 1
  const cols = source.length + 1
  // lengths[i * cols + j] is the length of the longest common sequence of
  // target[i..] and source[j..].
  const lengths = new Uint32Array(rows * cols)
  const at = (i: number, j: number): number => lengths[i * cols + j] ?? 0
  for (let i = target.length - 1; i >= 0; i--) {
    for (let j = source.length - 1; j >= 0; j--) {
      lengths[i * cols + j] =
        target[i] === source[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const matches = new Array<number>(target.length).fill(-1)
  let i = 0
  let j = 0
  while (i < target.length && j < source.length) {
    if (target[i] === source[j] && at(i, j) === at(i + 1, j + 1) + 1) {
      matches[i] = j
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      i++
    } else {
      j++
    }
  }
  return matches
}

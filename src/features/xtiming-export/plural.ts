/**
 * Returns a count with its noun, for example `1 file` or `2 files`.
 * @param n The count.
 * @param word The singular noun. Its plural form adds an `s`.
 */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

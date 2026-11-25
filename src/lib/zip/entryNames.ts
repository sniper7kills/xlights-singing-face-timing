// A `/` or a `\` separates folders in a zip file, a control character breaks a terminal, and Windows refuses `:*?"<>|`.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f/\\:*?"<>|]/g

/**
 * Returns a file name that is legal as one part of an entry path.
 * The function replaces each of these with `_`:
 * - a control character, `/` and `\`
 * - each of `: * ? " < > |`
 * - a `.` at the start, so that no part is hidden, `.` or `..`
 *
 * Other Unicode characters stay. An empty name becomes `_`.
 * @param name The file name, for example the name of the audio file that the person added.
 */
export function safeEntryName(name: string): string {
  const safe = name.replace(UNSAFE_CHARACTERS, '_').replace(/^\./, '_')
  return safe === '' ? '_' : safe
}

/**
 * Returns the path of an entry: the folder, a `/`, then the safe file name.
 * @param folder The folder of the entry, for example `timing`. `null` for the top of the zip file.
 * @param fileName The file name. `safeEntryName` makes it legal.
 */
export function entryPath(folder: string | null, fileName: string): string {
  const name = safeEntryName(fileName)
  return folder === null ? name : `${folder}/${name}`
}

function withNumber(path: string, n: number): string {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  const split = dot > slash + 1 ? dot : path.length
  return `${path.slice(0, split)} (${n})${path.slice(split)}`
}

/**
 * Returns a function that gives each path a number when an earlier path of the function has it.
 * The comparison ignores case, because Windows and macOS treat `A.txt` and `a.txt` as one file.
 * The number goes before the extension: the second `song.json` becomes `song (2).json`.
 */
export function uniquePathMaker(): (path: string) => string {
  const used = new Set<string>()
  return (path) => {
    let unique = path
    for (let n = 2; used.has(unique.toLowerCase()); n += 1) unique = withNumber(path, n)
    used.add(unique.toLowerCase())
    return unique
  }
}

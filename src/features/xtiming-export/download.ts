import type { ExportFile } from '../../lib/xtiming/exportFiles.ts'

// The browser reads the Blob after the click returns, and a large file can take many seconds to save.
const REVOKE_DELAY_MS = 30_000

/**
 * Gives each file to the browser as a download, in the order of the list.
 * The text of each file is encoded as UTF-8 with the line ends unchanged. No network request occurs.
 * The browser can block the second and later downloads. The page receives no signal when it does.
 * @param files The files from `exportFiles`, or another text file with a name.
 * @param type The media type of each file. The default is UTF-8 XML.
 */
export function downloadFiles(
  files: readonly ExportFile[],
  type = 'application/xml;charset=utf-8',
): void {
  for (const file of files) {
    const blob = new Blob([file.text], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    // Some browsers start a download only from an anchor that is in the document.
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
  }
}

import type { ExportFile } from '../../lib/xtiming/exportFiles.ts'

// The browser reads the Blob after the click returns, so the object URL stays valid for a short time.
const REVOKE_DELAY_MS = 1000

/**
 * Gives each file to the browser as a download, in the order of the list.
 * The text of each file is encoded as UTF-8 with the line ends unchanged. No network request occurs.
 * The browser can block the second and later downloads. The page receives no signal when it does.
 * @param files The files from `exportFiles`.
 */
export function downloadFiles(files: readonly ExportFile[]): void {
  for (const file of files) {
    const blob = new Blob([file.text], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
  }
}

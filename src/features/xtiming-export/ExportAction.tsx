import { useRef, useState } from 'react'
import { useSongStore } from '../../store/songStore.ts'
import type { SongContent } from '../../store/types.ts'
import { downloadBlob, downloadFiles } from './download.ts'
import { ExportDialog } from './ExportDialog.tsx'
import {
  defaultExportOptions,
  loadSongExportOptions,
  type DialogExportOptions,
} from './exportOptionsStore.ts'

/** Shows the "Export" action of the editor top bar and the export dialog that it opens. */
export function ExportAction() {
  const content = useSongStore((state) => state.current)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [options, setOptions] = useState<DialogExportOptions | null>(null)
  if (!content) return null

  async function open(song: SongContent) {
    try {
      setOptions(await loadSongExportOptions(song))
    } catch {
      // The stored options are a convenience, so a failed read must not block the export.
      setOptions(defaultExportOptions(song))
    }
  }

  function close() {
    setOptions(null)
    buttonRef.current?.focus()
  }

  return (
    <>
      <button ref={buttonRef} type="button" className="button" onClick={() => void open(content)}>
        Export
      </button>
      {options && (
        <ExportDialog
          content={content}
          initialOptions={options}
          onClose={close}
          onDownload={downloadFiles}
          onDownloadZip={(zip) => downloadBlob(zip.name, zip.blob)}
        />
      )}
    </>
  )
}

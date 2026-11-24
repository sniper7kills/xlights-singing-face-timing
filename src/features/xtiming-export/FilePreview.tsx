import { useId } from 'react'
import type { ExportFile } from '../../lib/xtiming/exportFiles.ts'

const PREVIEW_LINES = 40

type FilePreviewProps = {
  /** The first file of the export. */
  file: ExportFile
}

/** Shows the name of the file and the first 40 lines of its text. */
export function FilePreview({ file }: FilePreviewProps) {
  const headingId = useId()
  return (
    <section className="export-group" aria-labelledby={headingId}>
      <h3 id={headingId}>Preview · {file.name}</h3>
      {/* The preview scrolls, so it takes the focus to give the keyboard a scroll path. */}
      <pre className="export-preview" role="region" tabIndex={0} aria-label="File preview">
        {file.text.split('\n').slice(0, PREVIEW_LINES).join('\n')}
      </pre>
    </section>
  )
}

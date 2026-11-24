import { useId } from 'react'
import type { ExportOptions } from '../../lib/xtiming/types.ts'

type Packaging = ExportOptions['packaging']

type PackagingGroupProps = {
  packaging: Packaging
  /** The count of files that "Download" gives to the browser. */
  fileCount: number
  onChange: (packaging: Packaging) => void
}

/**
 * Shows the packaging choices of the export dialog.
 * When several files download, the group shows the hint about blocked downloads.
 */
export function PackagingGroup({ packaging, fileCount, onChange }: PackagingGroupProps) {
  const hintId = useId()
  // A page cannot detect that the browser blocks the second and later downloads, so the hint stays visible.
  const severalDownloads = packaging === 'file-per-track' && fileCount > 1
  return (
    <fieldset className="export-group">
      <legend>Files</legend>
      <label className="export-option">
        <input
          type="radio"
          name="packaging"
          checked={packaging === 'one-file'}
          onChange={() => onChange('one-file')}
        />
        One file with all timing tracks
      </label>
      <label className="export-option">
        <input
          type="radio"
          name="packaging"
          checked={packaging === 'file-per-track'}
          aria-describedby={severalDownloads ? hintId : undefined}
          onChange={() => onChange('file-per-track')}
        />
        One file for each timing track
      </label>
      {severalDownloads && (
        <small id={hintId} className="export-hint">
          The browser can block several downloads. If files are missing, allow downloads for this
          site, or select One file.
        </small>
      )}
    </fieldset>
  )
}

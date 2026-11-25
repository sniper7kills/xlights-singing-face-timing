import { useId } from 'react'
import type { ExportOptions } from '../../lib/xtiming/types.ts'

type Packaging = ExportOptions['packaging']

type PackagingGroupProps = {
  packaging: Packaging
  /** The count of files that "Download" gives to the browser. */
  fileCount: number
  onChange: (packaging: Packaging) => void
  /** True when "Everything as one zip file" is selected. */
  zip: boolean
  /** The note under "Everything as one zip file": the entries and the size of the zip file. */
  zipNote: string
  onZipChange: (zip: boolean) => void
}

/**
 * Shows the packaging choices of the export dialog and the choice "Everything as one zip file".
 * The zip file choice is a check box, because the zip file holds the timing files of the selected packaging.
 * When several files download, the group shows the hint about blocked downloads.
 */
export function PackagingGroup({
  packaging,
  fileCount,
  onChange,
  zip,
  zipNote,
  onZipChange,
}: PackagingGroupProps) {
  const hintId = useId()
  const zipNoteId = useId()
  // A page cannot detect that the browser blocks the second and later downloads, so the hint stays visible.
  const severalDownloads = !zip && packaging === 'file-per-track' && fileCount > 1
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
      <label className="export-option">
        <input
          type="checkbox"
          checked={zip}
          aria-describedby={zip ? zipNoteId : undefined}
          onChange={(event) => onZipChange(event.currentTarget.checked)}
        />
        Everything as one zip file
      </label>
      {zip && (
        <small id={zipNoteId} className="export-hint">
          {zipNote}
        </small>
      )}
    </fieldset>
  )
}

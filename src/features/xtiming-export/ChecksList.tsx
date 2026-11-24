import { useState } from 'react'
import type { Finding } from '../../lib/xtiming/types.ts'
import { plural } from './plural.ts'

type ChecksListProps = {
  /** The findings of `checkTracks`, errors first. */
  findings: Finding[]
  /** Shows the mark of a finding in the editor. */
  onSelectMark: (markId: string) => void
}

/**
 * Shows the checks region of the export dialog: the count of errors and warnings, and each finding.
 * The region is open while an error exists. A finding about a mark is a button that shows the mark.
 */
export function ChecksList({ findings, onSelectMark }: ChecksListProps) {
  const [opened, setOpened] = useState(false)
  const errors = findings.filter((finding) => finding.type === 'error').length
  const warnings = findings.length - errors
  return (
    <details
      className="export-group export-checks"
      open={errors > 0 || opened}
      onToggle={(event) => setOpened(event.currentTarget.open)}
    >
      <summary>
        Checks · {plural(errors, 'error')} · {plural(warnings, 'warning')}
      </summary>
      <ul>
        {findings.map((finding, index) => {
          const { markId } = finding
          const content = (
            <>
              <span className={`badge ${finding.type}`}>{finding.type}</span>
              <span>{finding.message}</span>
            </>
          )
          return (
            <li key={`${finding.check}-${markId ?? finding.voiceId ?? ''}-${index}`}>
              {markId === undefined ? (
                <span className="finding">{content}</span>
              ) : (
                <button type="button" className="finding" onClick={() => onSelectMark(markId)}>
                  {content}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

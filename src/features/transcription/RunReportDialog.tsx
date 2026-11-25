import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { keepFocusInside } from '../../app/modalFocus.ts'
import { type PanelSection, reportFileName, reportPanel } from '../../lib/runReport/reportPanel.ts'
import { reportToText, type RunReport } from '../../lib/runReport/runReport.ts'
import { useSongStore } from '../../store/songStore.ts'
import { downloadFiles } from '../xtiming-export/download.ts'

/** The time that "Copy report" says "Copied" after a copy. */
const COPIED_MS = 2000

type CopyState = 'idle' | 'copied' | 'manual'

type RunReportDialogProps = {
  songName: string
  report: RunReport
  onClose: () => void
}

function ReportSection({ section }: { section: PanelSection }) {
  const titleId = useId()
  return (
    <section className="report-section" aria-labelledby={titleId}>
      <h3 id={titleId}>{section.title}</h3>
      {section.text !== null && <p>{section.text}</p>}
      {section.tables.map((table) => (
        <table key={table.caption} className="report-table">
          <caption>{table.caption}</caption>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {section.facts.length > 0 && (
        <dl className="report-facts">
          {section.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {section.items.length > 0 && (
        <ul>
          {section.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Shows the run report panel: the report of the last run of the song, "Copy report" and "Download report".
 * The panel is read-only. It shows a new report at once when a new run stores one.
 */
export function RunReportDialog({ songName, report, onClose }: RunReportDialogProps) {
  const [copy, setCopy] = useState<CopyState>('idle')
  const dialogRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const titleId = useId()
  const voices = useSongStore((state) => state.current?.voices)
  const sections = useMemo(() => reportPanel(report, undefined, voices), [report, voices])
  const text = useMemo(() => reportToText(report), [report])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    if (copy !== 'copied') return
    const timer = window.setTimeout(() => setCopy('idle'), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copy])

  useEffect(() => {
    if (copy !== 'manual') return
    textRef.current?.focus()
    textRef.current?.select()
  }, [copy])

  async function copyReport() {
    try {
      // The browser rejects the write outside a secure context or with no permission. MDN: Clipboard/writeText.
      await navigator.clipboard.writeText(text)
      setCopy('copied')
    } catch {
      setCopy('manual')
    }
  }

  function download() {
    downloadFiles([{ name: reportFileName(songName), text }], 'text/plain;charset=utf-8')
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The dialog is modal, so a key such as the space bar must not reach the editor shortcuts.
    event.stopPropagation()
    if (event.key === 'Escape') {
      onClose()
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  return (
    <div className="export-backdrop">
      <div
        ref={dialogRef}
        className="export-dialog report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="export-head">
          <h2 id={titleId}>Run report</h2>
          <span>{songName}</span>
        </div>
        <div className="report-body">
          {sections.map((section) => (
            <ReportSection key={section.title} section={section} />
          ))}
        </div>
        {copy === 'manual' && (
          <textarea
            ref={textRef}
            className="text-field report-text"
            readOnly
            value={text}
            aria-label="Text of the run report"
            rows={8}
          />
        )}
        <div className="export-foot">
          <button type="button" className="button" onClick={() => void copyReport()}>
            {copy === 'copied' ? 'Copied' : 'Copy report'}
          </button>
          <button type="button" className="button" onClick={download}>
            Download report
          </button>
          <span className="report-status" role="status" aria-live="polite">
            {copy === 'copied' && 'The report is on the clipboard.'}
            {copy === 'manual' && 'Press Ctrl+C to copy.'}
          </span>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

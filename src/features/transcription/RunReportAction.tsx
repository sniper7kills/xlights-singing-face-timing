import { useEffect, useRef } from 'react'
import { useSongStore } from '../../store/songStore.ts'
import { useRunData } from '../../store/useRunData.ts'
import { closeRunReport, openRunReport, useRunReportPanel } from './runReportPanelStore.ts'
import { RunReportDialog } from './RunReportDialog.tsx'

/** The tooltip of the disabled action, for a song with no stored run report. */
export const NO_RUN_NOTE = 'No transcribe run for this song yet.'

/**
 * Shows the "Run report" action of the editor top bar and the run report panel.
 * The action is disabled while the song has no stored run report.
 */
export function RunReportAction() {
  const song = useSongStore((state) => state.current?.song ?? null)
  const runData = useRunData(song?.id ?? null)
  const { open, opener } = useRunReportPanel()
  const buttonRef = useRef<HTMLButtonElement>(null)

  // A panel that is open when the person leaves the editor must not open with the next song.
  useEffect(() => closeRunReport, [])

  if (song === null) return null
  const report = runData?.report

  function close() {
    // The toast that held the link can be gone, so the top bar action takes the focus then.
    const target = opener?.isConnected === true ? opener : buttonRef.current
    closeRunReport()
    target?.focus()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="button"
        disabled={report === undefined}
        title={report === undefined ? NO_RUN_NOTE : undefined}
        onClick={openRunReport}
      >
        Run report
      </button>
      {open && report !== undefined && (
        <RunReportDialog songName={song.name} report={report} onClose={close} />
      )}
    </>
  )
}

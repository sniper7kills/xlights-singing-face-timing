import { useEffect, useRef } from 'react'
import { ReasonButton } from '../timeline-editor/ReasonButton.tsx'
import { useSongStore } from '../../store/songStore.ts'
import {
  RUN_DATA_FAILED,
  RUN_DATA_FAILED_NOTE,
  runDataOf,
  useRunData,
} from '../../store/useRunData.ts'
import { closeRunReport, openRunReport, useRunReportPanel } from './runReportPanelStore.ts'
import { RunReportDialog } from './RunReportDialog.tsx'

/** The tooltip of the action when it opens the panel. */
export const RUN_REPORT_HINT = 'Open the report of the last transcribe run.'

/** The tooltip of the action that does not act, for a song with no stored run report. */
export const NO_RUN_NOTE = 'No transcribe run for this song yet.'

/**
 * Shows the "Run report" action of the editor top bar and the run report panel.
 * The action does not act while the song has no stored run report. It keeps the focus, and its tooltip gives the reason.
 */
export function RunReportAction() {
  const song = useSongStore((state) => state.current?.song ?? null)
  const runData = useRunData(song?.id ?? null)
  const { open, opener } = useRunReportPanel()
  const buttonRef = useRef<HTMLButtonElement>(null)

  // A panel that is open when the person leaves the editor must not open with the next song.
  useEffect(() => closeRunReport, [])

  if (song === null) return null
  const report = runDataOf(runData)?.report
  const note = runData === RUN_DATA_FAILED ? RUN_DATA_FAILED_NOTE : NO_RUN_NOTE

  function close() {
    // The toast that held the link can be gone, so the top bar action takes the focus then.
    const target = opener?.isConnected === true ? opener : buttonRef.current
    closeRunReport()
    target?.focus()
  }

  return (
    <>
      <ReasonButton
        ref={buttonRef}
        reason={report === undefined ? note : null}
        hint={RUN_REPORT_HINT}
        onAct={openRunReport}
      >
        Run report
      </ReasonButton>
      {open && report !== undefined && (
        <RunReportDialog songName={song.name} report={report} onClose={close} />
      )}
    </>
  )
}

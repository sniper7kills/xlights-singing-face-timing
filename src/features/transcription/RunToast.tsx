import { runDataOf, useRunData } from '../../store/useRunData.ts'
import { openRunReport, useRunReportPanel } from './runReportPanelStore.ts'

type RunToastProps = {
  /** The text of the toast, for example "214 words, 9 estimated". */
  text: string
  songId: string
  /**
   * False when the run did not store its run data. The stored report is then of an earlier run, so the toast offers no link.
   */
  reportStored: boolean
  /** Receives the click on "Close". */
  onClose: () => void
}

/**
 * Shows the toast after a transcribe run, with a "Run report" link when the run stored its report, and "Close".
 * The toast stays until the person selects "Close" or starts a new run, so a slow reader and a keyboard user can reach the link.
 * It hides while the run report panel is open, so it covers no control of the panel.
 * It takes no focus. A screen reader announces its text politely.
 */
export function RunToast({ text, songId, reportStored, onClose }: RunToastProps) {
  const runData = useRunData(songId)
  const panelOpen = useRunReportPanel((state) => state.open)

  return (
    <div className="toast" hidden={panelOpen}>
      <p role="status">{text}</p>
      {reportStored && runDataOf(runData) !== undefined && (
        <button type="button" className="link-button" onClick={openRunReport}>
          Run report
        </button>
      )}
      <button type="button" className="link-button" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useRunData } from '../../store/useRunData.ts'
import { openRunReport } from './runReportPanelStore.ts'

/** The time that the toast after a transcribe run stays on the screen. */
const TOAST_MS = 6000

type RunToastProps = {
  /** The text of the toast, for example "214 words, 9 estimated". */
  text: string
  songId: string
  /**
   * False when the run did not store its run data. The stored report is then of an earlier run, so the toast offers no link.
   */
  reportStored: boolean
  /** Receives the end of the time of the toast. */
  onDone: () => void
}

/**
 * Shows the toast after a transcribe run, with a "Run report" link when the run stored its report.
 * The toast stays while its link has the focus, so a keyboard user can reach the link. Then the full time starts again.
 */
export function RunToast({ text, songId, reportStored, onDone }: RunToastProps) {
  const [held, setHeld] = useState(false)
  const runData = useRunData(songId)

  useEffect(() => {
    if (held) return
    const timer = window.setTimeout(onDone, TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [text, held, onDone])

  return (
    <div className="toast" onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <p role="status">{text}</p>
      {reportStored && runData != null && (
        <button type="button" className="link-button" onClick={openRunReport}>
          Run report
        </button>
      )}
    </div>
  )
}

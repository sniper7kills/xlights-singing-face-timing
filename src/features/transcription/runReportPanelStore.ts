import { create } from 'zustand'

type RunReportPanelState = {
  open: boolean
  /** The control that had the focus before the panel opened. The panel gives the focus back to it. */
  opener: HTMLElement | null
}

/** Holds whether the run report panel is open. The top bar action and the link in the toast both open it. */
export const useRunReportPanel = create<RunReportPanelState>(() => ({ open: false, opener: null }))

/** Opens the run report panel and keeps the control that has the focus. */
export function openRunReport() {
  const active = document.activeElement
  useRunReportPanel.setState({
    open: true,
    opener: active instanceof HTMLElement ? active : null,
  })
}

/** Closes the run report panel. */
export function closeRunReport() {
  useRunReportPanel.setState({ open: false, opener: null })
}

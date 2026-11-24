import type { ReactNode } from 'react'

/**
 * Shows the editor tools under the stage. Other components put their controls in it as children.
 * @param children The controls of the toolbar, for example the zoom slider.
 */
export function EditorToolbar({ children }: { children?: ReactNode }) {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor tools">
      {children}
    </div>
  )
}

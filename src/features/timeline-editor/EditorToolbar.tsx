import type { ReactNode } from 'react'

/** Shows the toolbar of the editor under the stage. Each tool is a child. */
export function EditorToolbar({ children }: { children?: ReactNode }) {
  return (
    <div role="toolbar" aria-label="Editor tools" className="editor-toolbar">
      {children}
    </div>
  )
}

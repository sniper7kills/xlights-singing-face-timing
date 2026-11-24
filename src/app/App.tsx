import { EditorPage } from '../features/timeline-editor/EditorPage.tsx'
import { useDatabaseStatus } from './database.ts'
import { useHashRoute } from './routes.ts'
import { SongLibraryPage } from './SongLibraryPage.tsx'
import { useTheme } from './theme.ts'

export function App() {
  const { theme, toggleTheme } = useTheme()
  const route = useHashRoute()
  const databaseStatus = useDatabaseStatus()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <>
      <header className="header">
        <h1>
          Singing Face Timing
          <small>.xtiming files for xLights</small>
        </h1>
        <span className="spacer" />
        <button
          type="button"
          className="button"
          aria-label={`Theme: switch to ${nextTheme}`}
          onClick={toggleTheme}
        >
          <span aria-hidden="true">◐</span> Theme
        </button>
      </header>
      <main className="main">
        {route.name === 'song' ? (
          <EditorPage songId={route.songId} />
        ) : (
          <SongLibraryPage databaseStatus={databaseStatus} />
        )}
      </main>
    </>
  )
}

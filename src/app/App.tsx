import { useDatabaseStatus } from './database.ts'
import { useHashRoute } from './routes.ts'
import { SongLibraryPage } from './SongLibraryPage.tsx'
import { useTheme } from './theme.ts'

export function App() {
  const { theme, toggleTheme } = useTheme()
  // The call keeps hash routing active: an unknown hash goes back to the song library.
  useHashRoute()
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
        <SongLibraryPage databaseStatus={databaseStatus} />
      </main>
    </>
  )
}

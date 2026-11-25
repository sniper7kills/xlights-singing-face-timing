import { CustomDictionaryAction } from '../features/phoneme-breakdown/CustomDictionaryAction.tsx'
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
        {/* The editor shows the same action in its top bar. */}
        {route.name !== 'song' && databaseStatus === 'ready' && <CustomDictionaryAction />}
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
          // Each song gets a new editor, so a toast or a dialog of one song never shows with the next song.
          <EditorPage key={route.songId} songId={route.songId} />
        ) : (
          <SongLibraryPage databaseStatus={databaseStatus} />
        )}
      </main>
    </>
  )
}

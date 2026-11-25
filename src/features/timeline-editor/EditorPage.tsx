import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { LIBRARY_HASH } from '../../app/routes.ts'
import { useAutosaveStore, useSaveState } from '../../store/autosave.ts'
import { StorageFullError } from '../../store/db.ts'
import { readSavedView, saveView } from '../../store/savedView.ts'
import { keepSelectionInSong } from '../../store/selectionSync.ts'
import { useSongStore } from '../../store/songStore.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'
import { loadDictionaries } from '../../store/actions/breakDown.ts'
import { AddWordAction } from '../phoneme-breakdown/AddWordAction.tsx'
import { BreakDownAgainAction } from '../phoneme-breakdown/BreakDownAgainAction.tsx'
import { BreakDownNotice } from '../phoneme-breakdown/BreakDownNotice.tsx'
import { CustomDictionaryAction } from '../phoneme-breakdown/CustomDictionaryAction.tsx'
import { UnknownWordCounter } from '../phoneme-breakdown/UnknownWordCounter.tsx'
import type { BreakDownFailure, TranscribeOutcome } from '../transcription/runTranscription.ts'
import { TranscribeDialog } from '../transcription/TranscribeDialog.tsx'
import { RunReportAction } from '../transcription/RunReportAction.tsx'
import { RunToast } from '../transcription/RunToast.tsx'
import { AddSectionAction } from '../voices-sections/AddSectionAction.tsx'
import { GhostRow } from '../voices-sections/GhostRow.tsx'
import { PhraseMenu } from '../voices-sections/PhraseMenu.tsx'
import { VoiceRail } from '../voices-sections/VoiceRail.tsx'
import { outcomeText } from '../transcription/transcribeDialogState.ts'
import { ExportAction } from '../xtiming-export/ExportAction.tsx'
import { EditorToolbar } from './EditorToolbar.tsx'
import { HelpLine } from './HelpLine.tsx'
import { Inspector } from './Inspector.tsx'
import { Layers } from './Layers.tsx'
import { MarkActions } from './MarkActions.tsx'
import { resetMarkUi } from './markUiStore.ts'
import { ShortcutList } from './ShortcutList.tsx'
import { StatusLine } from './StatusLine.tsx'
import { TransportControls } from './TransportControls.tsx'
import { UndoRedoButtons } from './UndoRedoButtons.tsx'
import { Waveform } from './Waveform.tsx'
import { ZoomControl } from './ZoomControl.tsx'

/** The narrowest window that shows the editor, in pixels. */
const MIN_EDITOR_WIDTH_PX = 1024

function subscribeToResize(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

function isNarrowWindow(): boolean {
  return window.innerWidth < MIN_EDITOR_WIDTH_PX
}

/**
 * Requests the dictionary in the background when the open song has a word.
 * A drag or a label change breaks down a word only with the dictionary in memory, so the first edit gets a real break down.
 * A song with no word requests nothing, so a visit with no break down loads no dictionary (FR-phoneme-1).
 * A failure shows no message here. The next action that needs the dictionary requests it again and reports the failure.
 */
function loadDictionaryForWords() {
  const marks = useSongStore.getState().current?.marks ?? []
  if (marks.some((mark) => mark.layer === 'word')) void loadDictionaries().catch(() => undefined)
}

/**
 * Moves the focus to "Play", or to the first control of the toolbar while the audio is not ready.
 * A disabled button takes no focus, so the toolbar is the second choice.
 */
function skipToTransport(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  const editor = event.currentTarget.closest('.editor')
  const play = editor?.querySelector<HTMLButtonElement>('.transport .play:not(:disabled)')
  const tool = editor?.querySelector<HTMLElement>(
    '.editor-toolbar button:not(:disabled), .editor-toolbar input',
  )
  const target = play ?? tool
  target?.focus()
}

type EditorPageProps = {
  songId: string
}

/** Shows the editor for one song: the top bar, the waveform region, the layers and the toolbar. */
export function EditorPage({ songId }: EditorPageProps) {
  const content = useSongStore((state) => state.current)
  const openSong = useSongStore((state) => state.openSong)
  const saveState = useSaveState()
  const saveError = useAutosaveStore((state) => state.error)
  const selectedVoiceId = useViewStore((state) => state.selectedVoiceId)
  const selection = useViewStore((state) => state.selection)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState<{ text: string; reportStored: boolean } | null>(null)
  const [breakDownFailure, setBreakDownFailure] = useState<BreakDownFailure | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const narrow = useSyncExternalStore(subscribeToResize, isNarrowWindow)

  const openTranscribeDialog = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDialogOpen(true)
  }, [])

  const closeTranscribeDialog = useCallback(() => {
    setDialogOpen(false)
    setRunning(false)
  }, [])

  const finishTranscribe = useCallback(
    (outcome: TranscribeOutcome) => {
      setToast({
        text: outcomeText(outcome),
        // A late write can still fail, so the toast offers the link only for a write that ended.
        reportStored: outcome.runData === 'stored' || outcome.runData === 'storage-full',
      })
      setBreakDownFailure(outcome.breakDownFailure)
      closeTranscribeDialog()
    },
    [closeTranscribeDialog],
  )

  const hideToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    // The action is disabled until the render after the run, and a disabled button takes no focus.
    if (dialogOpen || opener.current === null) return
    opener.current.focus()
    opener.current = null
  }, [dialogOpen])

  useEffect(keepSelectionInSong, [])

  useEffect(() => {
    let active = true
    // Each song opens at the default view, or at the zoom and the scroll offset that the browser keeps for it.
    useViewStore.getState().resetView()
    resetMarkUi()
    const saved = readSavedView(songId)
    if (saved !== null) useViewStore.setState(saved)
    const stopSave = useViewStore.subscribe((view, previous) => {
      if (view.pxPerSecond !== previous.pxPerSecond || view.scrollMs !== previous.scrollMs)
        saveView(songId, view)
    })
    void openSong(songId)
      // A song that the app cannot read gets the same result as a deleted song.
      .catch(() => false)
      .then((found) => {
        // A link to a deleted song goes back to the song library, the same as an unknown hash.
        if (active && !found) window.location.replace(LIBRARY_HASH)
        if (active && found) loadDictionaryForWords()
      })
    return () => {
      // An open that ends after the person left the editor must not change the route.
      active = false
      stopSave()
      // The close saves a pending change, so the next open reads the saved change.
      useSongStore.getState().closeSong()
    }
  }, [openSong, songId])

  if (content?.song.id !== songId) return null
  const { song } = content
  const voice = selectedVoice(content.voices, selectedVoiceId)
  return (
    <>
      <p className="narrow-note" role="status" hidden={!narrow}>
        The editor needs a window that is 1024 px wide or more.
      </p>
      {/* The editor stays mounted in a narrow window, so the audio and the view stay loaded. */}
      <section className="editor" aria-labelledby="editor-title" hidden={narrow}>
        <div className="editor-top">
          {/* The routes use the hash, so the link moves the focus itself and keeps the hash. */}
          <a className="skip-link" href="#transport" onClick={skipToTransport}>
            Skip to the transport
          </a>
          <a className="button" href={LIBRARY_HASH} aria-label="Back to song library">
            <span aria-hidden="true">←</span>
          </a>
          <h2 id="editor-title">{song.name}</h2>
          <span className="spacer" />
          {voice !== undefined && (
            <button
              type="button"
              className="button primary"
              disabled={running}
              onClick={openTranscribeDialog}
            >
              Transcribe
            </button>
          )}
          <RunReportAction />
          <CustomDictionaryAction />
          <ExportAction />
          <button
            type="button"
            className="button"
            aria-keyshortcuts="?"
            title="Show the keyboard shortcuts (?)"
            onClick={() => setShortcutsOpen(true)}
          >
            Shortcuts
          </button>
          <span className="save-state" role="status">
            {saveState === 'saved' ? 'Saved' : 'Saving'}
          </span>
        </div>
        <VoiceRail />
        {saveError instanceof StorageFullError && (
          <p className="message" role="alert">
            {saveError.message}
          </p>
        )}
        <Waveform key={songId} songId={songId} durationMs={song.durationMs}>
          {/* The transcribe dialog needs a voice, so a song with no voice gets no button. */}
          <Layers
            content={content}
            onTranscribe={voice === undefined ? undefined : openTranscribeDialog}
          />
          <GhostRow content={content} />
        </Waveform>
        {/* The inspector comes first, so the grid puts it beside the stage, and the lines go under the stage. */}
        <Inspector />
        <div className="editor-lines">
          <HelpLine />
          <StatusLine />
        </div>
        <EditorToolbar>
          <TransportControls />
          <ZoomControl durationMs={song.durationMs} />
          <MarkActions />
          <UndoRedoButtons />
          <UnknownWordCounter />
          <AddWordAction />
          <BreakDownAgainAction onFailure={setBreakDownFailure} />
          <PhraseMenu />
          <AddSectionAction />
        </EditorToolbar>
        {dialogOpen && voice !== undefined && (
          <TranscribeDialog
            voiceId={voice.id}
            selection={selection}
            onActiveChange={setRunning}
            onClose={closeTranscribeDialog}
            onDone={finishTranscribe}
          />
        )}
        <ShortcutList open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <BreakDownNotice failure={breakDownFailure} onChange={setBreakDownFailure} />
        {toast !== null && (
          <RunToast
            text={toast.text}
            reportStored={toast.reportStored}
            songId={songId}
            onDone={hideToast}
          />
        )}
      </section>
    </>
  )
}

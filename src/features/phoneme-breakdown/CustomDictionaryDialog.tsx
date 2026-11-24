import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { keepFocusInside, tabStops } from '../../app/modalFocus.ts'
import {
  parseCustomDictionary,
  writeCustomDictionary,
} from '../../lib/dictionary/customDictionaryFile.ts'
import { toPhonemeLabels } from '../../lib/dictionary/toPhonemeLabels.ts'
import { rebreakForEntries } from '../../store/actions/breakDown.ts'
import {
  type CustomEntryInput,
  deleteCustomEntry,
  listCustomEntries,
  putCustomEntries,
  putCustomEntry,
} from '../../store/customEntries.ts'
import { StorageFullError } from '../../store/db.ts'
import type { CustomEntry } from '../../store/types.ts'
import { CMU_SYMBOL_REFERENCE } from './cmuSymbolReference.ts'
import { EntryForm } from './EntryForm.tsx'
import { DictionaryLoadError } from './loadDictionary.ts'

const EXPORT_FILE_NAME = 'custom-dictionary.txt'
const STORAGE_FAILURE = 'The app could not read or write the custom dictionary. Reload the page.'
/** The count of skipped line numbers that the import report shows. */
const SHOWN_SKIPPED_LINES = 10

/** The message of a failed write. */
type DialogError = {
  text: string
  /** The words whose break down did not run because the dictionary did not load. "Retry" breaks them down. */
  retryWords?: readonly string[]
}

type CustomDictionaryDialogProps = {
  /**
   * The word that fills the word field of the entry form, for example the selected word of the song.
   * The focus then starts in the CMU symbols field.
   */
  initialWord?: string
  /** Closes the dialog for "Close" and Escape. */
  onClose: () => void
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Returns the import report, for example "1 entry imported. 2 lines skipped (lines 3, 7)."
 * The report shows the first 10 line numbers, then the count of the others: "(lines 2, 5 … 22 and 4 more)".
 * @param imported The count of distinct words that the import saved.
 * @param skippedLines The line numbers of the bad lines.
 */
function importReport(imported: number, skippedLines: readonly number[]): string {
  const report = `${count(imported, 'entry', 'entries')} imported.`
  if (skippedLines.length === 0) return report
  const skipped = count(skippedLines.length, 'line', 'lines')
  const shown = skippedLines.slice(0, SHOWN_SKIPPED_LINES).join(', ')
  const more = skippedLines.length - SHOWN_SKIPPED_LINES
  const numbers = `${skippedLines.length === 1 ? 'line' : 'lines'} ${shown}`
  return `${report} ${skipped} skipped (${numbers}${more > 0 ? ` and ${more} more` : ''}).`
}

/**
 * Shows the custom dictionary dialog: the search field, the entry list, the entry form, import and export, and the CMU symbol reference.
 * The dialog is modal. It keeps the focus inside it, and gives the focus back to the control that opened it.
 * If that control is gone, the focus goes to the selected mark, else to the "Custom dictionary" button.
 * The dialog is a child of the document body, so it is outside the toolbar that can open it.
 * Each change goes through the custom entry store, which breaks down again the matching words of the open song.
 * If the dictionary does not load after a change, the change stays saved, and "Retry" runs the break down again.
 */
export function CustomDictionaryDialog({ initialWord, onClose }: CustomDictionaryDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<CustomEntry[] | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<CustomEntry | null>(null)
  const [report, setReport] = useState('')
  const [error, setError] = useState<DialogError | null>(null)

  // The render runs before the entry form takes the focus, so this is still the control that opened the dialog.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  const refresh = useCallback(async () => {
    try {
      setEntries(await listCustomEntries())
    } catch {
      setError({ text: STORAGE_FAILURE })
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      // A save can make the word known, and the editor then removes the button that opened the dialog.
      const target = opener?.isConnected
        ? opener
        : (document.querySelector<HTMLElement>('.mark[aria-current="true"]') ??
          document.querySelector<HTMLElement>('[data-custom-dictionary-action]'))
      target?.focus()
    }
  }, [opener, refresh])

  useEffect(() => {
    // A delete or the end of an edit removes the control that had the focus, and Escape then misses the dialog.
    const dialog = dialogRef.current
    if (dialog === null || dialog.contains(document.activeElement)) return
    tabStops(dialog)[0]?.focus()
  }, [entries, editing])

  /**
   * Runs a write of the custom entry store. Resolves to true when the write saved its change.
   * @param change The write.
   * @param words The words of the changed entries, which "Retry" breaks down when the dictionary does not load.
   */
  async function write(change: () => Promise<unknown>, words: readonly string[]): Promise<boolean> {
    setError(null)
    try {
      await change()
      return true
    } catch (failure) {
      // The store saves the change before it loads the dictionary, so only the break down did not run.
      if (failure instanceof DictionaryLoadError) {
        setError({ text: failure.message, retryWords: words })
        return true
      }
      setError({ text: failure instanceof StorageFullError ? failure.message : STORAGE_FAILURE })
      return false
    } finally {
      await refresh()
    }
  }

  function save(entry: CustomEntryInput) {
    setReport('')
    return write(() => putCustomEntry(entry), [entry.word])
  }

  async function remove(word: string) {
    setReport('')
    if (editing?.word === word) setEditing(null)
    await write(() => deleteCustomEntry(word), [word])
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (file === undefined) return
    // The same file can be chosen again after a fix.
    input.value = ''
    setReport('')
    let text: string
    try {
      text = await file.text()
    } catch {
      setError({ text: STORAGE_FAILURE })
      return
    }
    const parsed = parseCustomDictionary(text)
    const saved =
      parsed.entries.length === 0 ||
      (await write(
        () => putCustomEntries(parsed.entries),
        parsed.entries.map((entry) => entry.word),
      ))
    if (saved) setReport(importReport(parsed.entries.length, parsed.skippedLines))
  }

  function exportFile() {
    const text = writeCustomDictionary(entries ?? [])
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = EXPORT_FILE_NAME
    link.click()
    // The browser reads the file after the click event, so the URL stays until the next task.
    window.setTimeout(() => URL.revokeObjectURL(url))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Tab') {
      keepFocusInside(event)
    }
  }

  function keepFocus(event: MouseEvent<HTMLDivElement>) {
    // A press on the backdrop moves the focus to the page, and the space bar then toggles play.
    if (event.target === event.currentTarget) event.preventDefault()
  }

  const retryWords = error?.retryWords
  return createPortal(
    <div className="modal-backdrop" onMouseDown={keepFocus}>
      <div
        ref={dialogRef}
        className="dialog dictionary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h3 id={titleId}>Custom dictionary</h3>
        <label className="dialog-field">
          Search
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <EntryTable
          entries={entries}
          search={search}
          onEdit={setEditing}
          onDelete={(word) => void remove(word)}
        />
        <EntryForm
          key={editing?.word ?? ''}
          editing={editing}
          initialWord={initialWord}
          onSave={save}
          onCancel={() => setEditing(null)}
          onStorageFailure={() => setError({ text: STORAGE_FAILURE })}
        />
        {error !== null && (
          <p className="message" role="alert">
            {error.text}
            {retryWords !== undefined && (
              <>
                {' '}
                <button
                  type="button"
                  className="button"
                  onClick={() => void write(() => rebreakForEntries(retryWords), retryWords)}
                >
                  Retry
                </button>
              </>
            )}
          </p>
        )}
        <p className="dialog-note" role="status">
          {report}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          aria-label="Custom dictionary file"
          hidden
          onChange={(event) => void importFile(event)}
        />
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button
            type="button"
            className="button"
            disabled={entries === null || entries.length === 0}
            onClick={exportFile}
          >
            Export
          </button>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
        <SymbolReference />
      </div>
    </div>,
    document.body,
  )
}

type EntryTableProps = {
  /** The saved entries. Null shows nothing until the first read ends. */
  entries: CustomEntry[] | null
  /** The search text. The table shows the entries whose word holds the text. */
  search: string
  onEdit: (entry: CustomEntry) => void
  onDelete: (word: string) => void
}

/** Shows the entry list: the empty state, or a table of the entries that match the search. */
function EntryTable({ entries, search, onEdit, onDelete }: EntryTableProps) {
  if (entries === null) return null
  if (entries.length === 0)
    return (
      <p className="dialog-note">
        No custom words yet. Words that the app does not know appear in the editor with a dotted
        outline.
      </p>
    )
  const query = search.trim().toUpperCase()
  const shown = entries.filter((entry) => entry.word.includes(query))
  if (shown.length === 0) return <p className="dialog-note">No custom word matches the search.</p>
  return (
    <div className="dictionary-table-wrap">
      <table className="dictionary-table">
        <caption>Custom words</caption>
        <thead>
          <tr>
            <th scope="col">Word</th>
            <th scope="col">CMU symbols</th>
            <th scope="col">Phoneme labels</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((entry) => (
            <tr key={entry.word}>
              <th scope="row">{entry.word}</th>
              <td className="mono">{entry.symbols}</td>
              <td className="mono">{toPhonemeLabels(entry.symbols.split(' ')).join(' ')}</td>
              <td className="row-actions">
                <button
                  type="button"
                  className="button"
                  aria-label={`Edit ${entry.word}`}
                  onClick={() => onEdit(entry)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button danger"
                  aria-label={`Delete ${entry.word}`}
                  onClick={() => onDelete(entry.word)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Shows the CMU symbols with an example word, the stress digits and the phoneme label of each. */
function SymbolReference() {
  return (
    <details className="symbol-reference">
      <summary>CMU symbols</summary>
      <table className="dictionary-table">
        <caption className="visually-hidden">CMU symbols</caption>
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Example word</th>
            <th scope="col">Stress digit</th>
            <th scope="col">Phoneme label</th>
          </tr>
        </thead>
        <tbody>
          {CMU_SYMBOL_REFERENCE.map((row) => (
            <tr key={row.symbol}>
              <th scope="row" className="mono">
                {row.symbol}
              </th>
              <td>{row.example}</td>
              <td>{row.vowel ? '0, 1 or 2' : 'None'}</td>
              <td className="mono">{row.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import {
  entryKey,
  isEntryWord,
  MAX_WORD_LENGTH,
} from '../../lib/dictionary/customDictionaryFile.ts'
import { normaliseWord } from '../../lib/dictionary/normaliseWord.ts'
import { resolveSoundsLike } from '../../lib/dictionary/soundsLike.ts'
import { validateSymbols } from '../../lib/dictionary/validateSymbols.ts'
import { loadDictionaries } from '../../store/actions/breakDown.ts'
import type { CustomEntryInput } from '../../store/customEntries.ts'
import type { CustomEntry } from '../../store/types.ts'
import { DictionaryLoadError } from './loadDictionary.ts'

type EntryType = 'symbols' | 'sounds-like'

type FieldErrors = {
  word?: string
  symbols?: string
  soundsLike?: string
  form?: string
}

type EntryFormProps = {
  /** The entry that the person edits. Null adds a new entry. */
  editing: CustomEntry | null
  /** The word that fills the word field of a new entry, for example a word of the song. */
  initialWord?: string
  /** Saves the entry. Resolves to true when the entry is saved, so the form clears its fields. */
  onSave: (entry: CustomEntryInput) => Promise<boolean>
  /** Stops the edit. */
  onCancel: () => void
  /** Tells the dialog that the app cannot read the custom dictionary, so the dialog shows the message. */
  onStorageFailure: () => void
}

/** Returns the first text of the word field: the word of the edited entry, else the initial word as a dictionary key. */
function firstWord(editing: CustomEntry | null, initialWord: string | undefined): string {
  if (editing !== null) return editing.word
  return initialWord === undefined ? '' : normaliseWord(initialWord)
}

/** Returns the error of a typed word, or undefined for a good word. */
function wordError(typed: string): string | undefined {
  if (typed === '') return 'Type a word.'
  if (!isEntryWord(typed)) return `A word has 1 to ${MAX_WORD_LENGTH} characters and no spaces.`
  if (normaliseWord(typed) === '') return 'Type a word with a letter or a digit.'
  if (entryKey(typed) === undefined) return 'Type a word with a letter.'
  return undefined
}

/**
 * Shows the entry form of the custom dictionary dialog: the word, the entry type, and the CMU symbols or the "sounds like" spelling.
 * The form validates the entry and shows each error under its field. A failed submit moves the focus to the first field with an error.
 * If the dictionary does not load for a "sounds like" spelling, "Retry" beside the message runs the submit again.
 */
export function EntryForm({
  editing,
  initialWord,
  onSave,
  onCancel,
  onStorageFailure,
}: EntryFormProps) {
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [word, setWord] = useState(() => firstWord(editing, initialWord))
  const [entryType, setEntryType] = useState<EntryType>('symbols')
  const [symbols, setSymbols] = useState(() => editing?.symbols ?? '')
  const [soundsLike, setSoundsLike] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // The field has `aria-invalid` only after the render, so the focus moves here and not in the submit.
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  function chooseEntryType(type: EntryType) {
    setEntryType(type)
    setErrors({})
  }

  async function symbolsOfEntry(): Promise<{ symbols: string } | { errors: FieldErrors }> {
    if (entryType === 'symbols') {
      // validateSymbols reads upper case only, and the person can type lower case.
      const text = symbols.trim().toUpperCase().split(/\s+/).join(' ')
      const result = validateSymbols(text)
      if (result.ok) return { symbols: text }
      return {
        errors: {
          symbols:
            result.bad === '' ? 'Type the CMU symbols.' : `${result.bad} is not a CMU symbol.`,
        },
      }
    }
    if (soundsLike.trim() === '')
      return { errors: { soundsLike: 'Type a "sounds like" spelling.' } }
    try {
      const { custom, cmu } = await loadDictionaries()
      const result = resolveSoundsLike(soundsLike, custom, cmu)
      if (result.ok) return { symbols: result.symbols }
      return {
        errors: { soundsLike: `The app does not know ${result.unknown}. Use shorter known words.` },
      }
    } catch (failure) {
      if (failure instanceof DictionaryLoadError) return { errors: { form: failure.message } }
      onStorageFailure()
      return { errors: {} }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void check()
  }

  async function check() {
    const typed = word.trim()
    const badWord = wordError(typed)
    setBusy(true)
    try {
      const result = await symbolsOfEntry()
      const found: FieldErrors = { word: badWord, ...('errors' in result ? result.errors : {}) }
      setErrors(found)
      if (badWord !== undefined || 'errors' in result) return
      if (!(await onSave({ word: normaliseWord(typed), symbols: result.symbols }))) return
      if (editing !== null) {
        onCancel()
        return
      }
      setWord('')
      setSymbols('')
      setSoundsLike('')
    } finally {
      setBusy(false)
    }
  }

  const text =
    editing === null
      ? { title: 'Add a word', submit: 'Add entry' }
      : { title: `Edit ${editing.word}`, submit: 'Save entry' }
  return (
    <form
      ref={formRef}
      className="entry-form"
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={submit}
    >
      <h4 id={`${id}-title`}>{text.title}</h4>
      <TextField
        id={`${id}-word`}
        label="Word"
        value={word}
        error={errors.word}
        readOnly={editing !== null}
        onChange={setWord}
      />
      <fieldset className="choice-group">
        <legend>Entry type</legend>
        <label className="choice">
          <input
            type="radio"
            name={`${id}-type`}
            checked={entryType === 'symbols'}
            onChange={() => chooseEntryType('symbols')}
          />
          Symbols
        </label>
        <label className="choice">
          <input
            type="radio"
            name={`${id}-type`}
            checked={entryType === 'sounds-like'}
            onChange={() => chooseEntryType('sounds-like')}
          />
          Sounds like spelling
        </label>
      </fieldset>
      {entryType === 'symbols' ? (
        <TextField
          id={`${id}-symbols`}
          label="CMU symbols"
          hint="Put one space between the symbols, for example R UW1 D AA0 L F. The app changes lower case to upper case."
          value={symbols}
          error={errors.symbols}
          // An edit, or a dialog that opens with a word from the song, needs only the symbols.
          autoFocus={initialWord !== undefined || editing !== null}
          onChange={setSymbols}
        />
      ) : (
        <TextField
          id={`${id}-sounds-like`}
          label="Sounds like"
          hint="Type known words with a space between them, for example ROO DOLF."
          value={soundsLike}
          error={errors.soundsLike}
          onChange={setSoundsLike}
        />
      )}
      {errors.form !== undefined && (
        <p className="field-error" role="alert">
          {errors.form}{' '}
          <button type="button" className="button" disabled={busy} onClick={() => void check()}>
            Retry
          </button>
        </p>
      )}
      <div className="dialog-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {text.submit}
        </button>
        {editing !== null && (
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

type TextFieldProps = {
  id: string
  label: string
  /** A note under the field that tells the format. */
  hint?: string
  value: string
  /** The field error under the field. Undefined shows no error. */
  error: string | undefined
  readOnly?: boolean
  autoFocus?: boolean
  onChange: (value: string) => void
}

/** Shows one text field of the entry form with its label, its note and its field error. */
function TextField({
  id,
  label,
  hint,
  value,
  error,
  readOnly,
  autoFocus,
  onChange,
}: TextFieldProps) {
  const described = [
    hint === undefined ? '' : `${id}-hint`,
    error === undefined ? '' : `${id}-error`,
  ]
    .filter((part) => part !== '')
    .join(' ')
  return (
    <div className="dialog-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        readOnly={readOnly}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error !== undefined}
        aria-describedby={described === '' ? undefined : described}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint !== undefined && (
        <p id={`${id}-hint`} className="dialog-note">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

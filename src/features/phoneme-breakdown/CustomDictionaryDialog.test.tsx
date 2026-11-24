import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCustomEntries, putCustomEntries } from '../../store/customEntries.ts'
import * as db from '../../store/db.ts'
import { saveSong, StorageFullError } from '../../store/db.ts'
import { useSongStore } from '../../store/songStore.ts'
import type { Mark, SongContent } from '../../store/types.ts'
import { CustomDictionaryDialog } from './CustomDictionaryDialog.tsx'
import { DictionaryLoadError, loadDictionary } from './loadDictionary.ts'

vi.mock('./loadDictionary.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./loadDictionary.ts')>()),
  loadDictionary: vi.fn(),
}))

// No test adds a custom entry for ROO or DOLF, so the in-memory copy of an earlier test cannot change a "sounds like" result.
const DICTIONARY = {
  ROO: 'R UW1',
  DOLF: 'D AA1 L F',
  RUDOLPH: 'R UW1 D AA0 L F',
}

const STORAGE_FAILURE = 'The app could not read or write the custom dictionary. Reload the page.'

beforeEach(() => {
  vi.mocked(loadDictionary).mockResolvedValue(DICTIONARY)
})

afterEach(() => {
  vi.restoreAllMocks()
  useSongStore.getState().closeSong()
})

async function renderDialog(props: { initialWord?: string } = {}) {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<CustomDictionaryDialog onClose={onClose} {...props} />)
  const dialog = screen.getByRole('dialog', { name: 'Custom dictionary' })
  return { user, onClose, dialog }
}

function entryRows() {
  const table = screen.queryByRole('table', { name: 'Custom words' })
  if (table === null) return []
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      Array.from(row.querySelectorAll('th, td'))
        .slice(0, 3)
        .map((cell) => cell.textContent),
    )
}

async function addBySymbols(
  user: ReturnType<typeof userEvent.setup>,
  word: string,
  symbols: string,
) {
  await user.type(screen.getByLabelText('Word'), word)
  await user.type(screen.getByLabelText('CMU symbols'), symbols)
  await user.click(screen.getByRole('button', { name: 'Add entry' }))
}

describe('CustomDictionaryDialog', () => {
  it('shows the empty state and moves the focus into the dialog', async () => {
    await renderDialog()

    expect(
      await screen.findByText(
        'No custom words yet. Words that the app does not know appear in the editor with a dotted outline.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('adds an entry with CMU symbols in lower case and shows its phoneme labels', async () => {
    const { user } = await renderDialog()

    await addBySymbols(user, 'Rudolph', 'r uw1 d aa0 l f')

    await waitFor(() =>
      expect(entryRows()).toEqual([['RUDOLPH', 'R UW1 D AA0 L F', 'etc U etc AI L FV']]),
    )
    expect(await listCustomEntries()).toMatchObject([
      { word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' },
    ])
    expect(screen.getByLabelText('Word')).toHaveValue('')
  })

  it('names the bad symbol in a field error and saves nothing', async () => {
    const { user } = await renderDialog()

    await addBySymbols(user, 'RUDOLPH', 'R UW1 XX')

    expect(await screen.findByText('XX is not a CMU symbol.')).toBeInTheDocument()
    expect(screen.getByLabelText('CMU symbols')).toHaveAttribute('aria-invalid', 'true')
    expect(await listCustomEntries()).toEqual([])
  })

  it('shows a field error for each empty field', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    expect(await screen.findByText('Type a word.')).toBeInTheDocument()
    expect(screen.getByText('Type the CMU symbols.')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Sounds like spelling' }))
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    expect(await screen.findByText('Type a "sounds like" spelling.')).toBeInTheDocument()
    expect(await listCustomEntries()).toEqual([])
  })

  it('rejects a word with a space, a word of 41 characters and a word with only punctuation', async () => {
    const { user } = await renderDialog()
    const word = screen.getByLabelText('Word')
    await user.type(screen.getByLabelText('CMU symbols'), 'R UW1')

    for (const typed of ['ROO DOLF', 'A'.repeat(41)]) {
      await user.clear(word)
      await user.type(word, typed)
      await user.click(screen.getByRole('button', { name: 'Add entry' }))
      expect(
        await screen.findByText('A word has 1 to 40 characters and no spaces.'),
      ).toBeInTheDocument()
    }
    await user.clear(word)
    await user.type(word, '--')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    expect(await screen.findByText('Type a word with a letter or a digit.')).toBeInTheDocument()
    expect(await listCustomEntries()).toEqual([])
  })

  it('rejects a word that is only an apostrophe and saves nothing', async () => {
    const { user } = await renderDialog()

    await addBySymbols(user, "'", 'R UW1')

    expect(await screen.findByText('Type a word with a letter or a digit.')).toBeInTheDocument()
    expect(screen.getByLabelText('Word')).toHaveAttribute('aria-invalid', 'true')
    expect(await listCustomEntries()).toEqual([])
  })

  it('adds an entry with a "sounds like" spelling from the CMU symbols of the parts', async () => {
    const { user } = await renderDialog()

    await user.type(screen.getByLabelText('Word'), 'RUDOLPH')
    await user.click(screen.getByRole('radio', { name: 'Sounds like spelling' }))
    await user.type(screen.getByLabelText('Sounds like'), 'ROO DOLF')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    await waitFor(() =>
      expect(entryRows()).toEqual([['RUDOLPH', 'R UW1 D AA1 L F', 'etc U etc AI L FV']]),
    )
  })

  it('names the unknown part of a "sounds like" spelling', async () => {
    const { user } = await renderDialog()

    await user.type(screen.getByLabelText('Word'), 'RUDOLPH')
    await user.click(screen.getByRole('radio', { name: 'Sounds like spelling' }))
    await user.type(screen.getByLabelText('Sounds like'), 'roodolf')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    expect(
      await screen.findByText('The app does not know ROODOLF. Use shorter known words.'),
    ).toBeInTheDocument()
    expect(await listCustomEntries()).toEqual([])
  })

  it('shows the load error when the dictionary does not load for a "sounds like" spelling', async () => {
    vi.mocked(loadDictionary).mockRejectedValue(new DictionaryLoadError())
    const { user } = await renderDialog()

    await user.type(screen.getByLabelText('Word'), 'RUDOLPH')
    await user.click(screen.getByRole('radio', { name: 'Sounds like spelling' }))
    await user.type(screen.getByLabelText('Sounds like'), 'ROO DOLF')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    expect(
      await screen.findByText('The dictionary did not load. Check the connection and retry.'),
    ).toBeInTheDocument()
    expect(await listCustomEntries()).toEqual([])
  })

  it('shows the storage message when the browser storage is full', async () => {
    vi.spyOn(db, 'putCustomEntryRecords').mockRejectedValue(new StorageFullError())
    const { user } = await renderDialog()

    await addBySymbols(user, 'RUDOLPH', 'R UW1')

    expect(await screen.findByRole('alert')).toHaveTextContent(new StorageFullError().message)
    expect(screen.getByLabelText('Word')).toHaveValue('RUDOLPH')
  })

  it('edits the CMU symbols of an entry', async () => {
    await putCustomEntries([{ word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' }])
    const { user } = await renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit RUDOLPH' }))
    expect(screen.getByRole('heading', { name: 'Edit RUDOLPH' })).toBeInTheDocument()
    expect(screen.getByLabelText('Word')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('CMU symbols')).toHaveFocus()
    await user.clear(screen.getByLabelText('CMU symbols'))
    await user.type(screen.getByLabelText('CMU symbols'), 'R UW1 D UW0')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    await waitFor(() => expect(entryRows()).toEqual([['RUDOLPH', 'R UW1 D UW0', 'etc U etc U']]))
    expect(screen.getByRole('heading', { name: 'Add a word' })).toBeInTheDocument()
  })

  it('stops an edit on "Cancel"', async () => {
    await putCustomEntries([{ word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' }])
    const { user } = await renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit RUDOLPH' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('heading', { name: 'Add a word' })).toBeInTheDocument()
    expect(screen.getByLabelText('Word')).toHaveValue('')
  })

  it('deletes an entry', async () => {
    await putCustomEntries([
      { word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' },
      { word: 'ZXQV', symbols: 'Z' },
    ])
    const { user } = await renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Edit RUDOLPH' }))
    await user.click(screen.getByRole('button', { name: 'Delete RUDOLPH' }))

    await waitFor(() => expect(entryRows()).toEqual([['ZXQV', 'Z', 'etc']]))
    expect(screen.getByRole('heading', { name: 'Add a word' })).toBeInTheDocument()
    expect((await listCustomEntries()).map((entry) => entry.word)).toEqual(['ZXQV'])
    // Escape reaches the dialog only from a control inside it.
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus()
  })

  it('shows only the entries whose word holds the search text', async () => {
    await putCustomEntries([
      { word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' },
      { word: 'ZXQV', symbols: 'Z' },
    ])
    const { user } = await renderDialog()
    await screen.findByRole('button', { name: 'Edit ZXQV' })

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'dol')
    expect(entryRows().map((row) => row[0])).toEqual(['RUDOLPH'])

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'x')
    expect(screen.getByText('No custom word matches the search.')).toBeInTheDocument()
  })

  it('imports the good lines, replaces an entry with the same word, and reports the skipped lines', async () => {
    await putCustomEntries([{ word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' }])
    const { user } = await renderDialog()
    await screen.findByRole('button', { name: 'Edit RUDOLPH' })
    const text = [
      ';;; carols',
      'RUDOLPH  R UW1 D UW0',
      'BLITZEN  B L IH1 T XX',
      'ZXQV  Z',
      'bad',
    ].join('\n')

    await user.upload(
      screen.getByLabelText('Custom dictionary file'),
      new File([text], 'words.txt', { type: 'text/plain' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '2 entries imported. 2 lines skipped (lines 3, 5).',
      ),
    )
    await waitFor(() =>
      expect(entryRows()).toEqual([
        ['RUDOLPH', 'R UW1 D UW0', 'etc U etc U'],
        ['ZXQV', 'Z', 'etc'],
      ]),
    )
  })

  it('reports one skipped line for a file with no good line', async () => {
    const { user } = await renderDialog()

    await user.upload(
      screen.getByLabelText('Custom dictionary file'),
      new File(['bad'], 'words.txt', { type: 'text/plain' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '0 entries imported. 1 line skipped (line 1).',
      ),
    )
  })

  it('counts the distinct words of an import', async () => {
    const { user } = await renderDialog()
    const text = ['Rudolph  R UW1 D AA0 L F', 'RUDOLPH!  R UW1 D UW0'].join('\n')

    await user.upload(
      screen.getByLabelText('Custom dictionary file'),
      new File([text], 'words.txt', { type: 'text/plain' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/^1 entry imported\.$/),
    )
    await waitFor(() => expect(entryRows()).toEqual([['RUDOLPH', 'R UW1 D UW0', 'etc U etc U']]))
  })

  it('shows the first 10 skipped line numbers and the count of the other skipped lines', async () => {
    const { user } = await renderDialog()
    const lines = Array.from({ length: 15 }, (_, index) => (index === 0 ? 'ZXQV  Z' : 'bad'))

    await user.upload(
      screen.getByLabelText('Custom dictionary file'),
      new File([lines.join('\n')], 'words.txt', { type: 'text/plain' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '1 entry imported. 14 lines skipped (lines 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 and 4 more).',
      ),
    )
  })

  it('shows the storage failure message when the app cannot read the import file', async () => {
    const { user } = await renderDialog()
    const file = new File(['ZXQV  Z'], 'words.txt', { type: 'text/plain' })
    vi.spyOn(file, 'text').mockRejectedValue(new Error('gone'))

    await user.upload(screen.getByLabelText('Custom dictionary file'), file)

    expect(await screen.findByRole('alert')).toHaveTextContent(STORAGE_FAILURE)
    expect(await listCustomEntries()).toEqual([])
  })

  it('shows the storage failure message when the app cannot read the custom entries', async () => {
    vi.spyOn(db, 'listRecords').mockRejectedValue(new Error('locked'))

    await renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent(STORAGE_FAILURE)
  })

  it('shows the storage failure message when the app cannot save an entry', async () => {
    vi.spyOn(db, 'putCustomEntryRecords').mockRejectedValue(new Error('locked'))
    const { user } = await renderDialog()

    await addBySymbols(user, 'RUDOLPH', 'R UW1')

    expect(await screen.findByRole('alert')).toHaveTextContent(STORAGE_FAILURE)
    expect(screen.getByLabelText('Word')).toHaveValue('RUDOLPH')
  })

  it('loads the dictionary again and saves the entry on "Retry" after a failed load', async () => {
    vi.mocked(loadDictionary).mockRejectedValueOnce(new DictionaryLoadError())
    const { user } = await renderDialog()
    await user.type(screen.getByLabelText('Word'), 'RUDOLPH')
    await user.click(screen.getByRole('radio', { name: 'Sounds like spelling' }))
    await user.type(screen.getByLabelText('Sounds like'), 'ROO DOLF')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    await screen.findByText('The dictionary did not load. Check the connection and retry.')

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() =>
      expect(entryRows()).toEqual([['RUDOLPH', 'R UW1 D AA1 L F', 'etc U etc AI L FV']]),
    )
    expect(
      screen.queryByText('The dictionary did not load. Check the connection and retry.'),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('moves the focus to the first field with an error after a failed submit', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    await waitFor(() => expect(screen.getByLabelText('Word')).toHaveFocus())

    await user.type(screen.getByLabelText('Word'), 'RUDOLPH')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    await waitFor(() => expect(screen.getByLabelText('CMU symbols')).toHaveFocus())
  })

  it('rejects a word of digits only', async () => {
    const { user } = await renderDialog()

    await addBySymbols(user, '12', 'T')

    expect(await screen.findByText('Type a word with a letter.')).toBeInTheDocument()
    expect(await listCustomEntries()).toEqual([])
  })

  it('exports the custom dictionary as a text file', async () => {
    await putCustomEntries([{ word: 'RUDOLPH', symbols: 'R UW1 D AA0 L F' }])
    const blobs: Blob[] = []
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: (blob: Blob) => {
          blobs.push(blob)
          return 'blob:custom-dictionary'
        },
        revokeObjectURL: () => undefined,
      }),
    )
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = await renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Export' }))

    expect(click).toHaveBeenCalledOnce()
    expect(click.mock.contexts[0]).toHaveProperty('download', 'custom-dictionary.txt')
    expect(await blobs[0]?.text()).toMatch(/\nRUDOLPH {2}R UW1 D AA0 L F\n$/)
  })

  it.each([
    ['with no initial word', undefined],
    ['with an initial word', 'Rudolph'],
  ])(
    'closes on Escape and gives the focus back to the control that opened it, %s',
    async (_, initialWord) => {
      const opener = document.createElement('button')
      document.body.append(opener)
      opener.focus()
      const user = userEvent.setup()
      const onClose = vi.fn()
      const view = render(<CustomDictionaryDialog onClose={onClose} initialWord={initialWord} />)

      await user.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalledOnce()
      view.unmount()

      expect(opener).toHaveFocus()
      opener.remove()
    },
  )

  it('keeps the focus inside the dialog on Tab', async () => {
    const { user } = await renderDialog()
    await screen.findByText(/No custom words yet/)

    await user.tab({ shift: true })
    expect(screen.getByText('CMU symbols', { selector: 'summary' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus()
  })

  it('fills the word field with the initial word and moves the focus to the CMU symbols', async () => {
    await renderDialog({ initialWord: 'Rudolph,' })

    expect(screen.getByLabelText('Word')).toHaveValue('RUDOLPH')
    expect(screen.getByLabelText('CMU symbols')).toHaveFocus()
  })

  it('shows each CMU symbol with an example word and its phoneme label', async () => {
    await renderDialog()

    const reference = screen.getByRole('table', { name: 'CMU symbols', hidden: true })
    const row = within(reference).getByRole('row', { name: /^AY hide/, hidden: true })
    expect(row).toHaveTextContent('AYhide0, 1 or 2AI')
  })
})

describe('CustomDictionaryDialog with an open song', () => {
  const SONG_ID = 'song-1'
  const VOICE = 'voice-lead'
  const word = (id: string, fields: Partial<Mark>): Mark => ({
    id,
    voiceId: VOICE,
    layer: 'word',
    label: 'Rudolph',
    startMs: 0,
    endMs: 1000,
    parentId: null,
    edited: false,
    ...fields,
  })
  const HAND_PHONEME = word('hand', { layer: 'phoneme', label: 'O', parentId: 'edited' })

  async function openSong() {
    const content: SongContent = {
      song: {
        id: SONG_ID,
        name: 'carol',
        durationMs: 10_000,
        frameMs: 50,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
      voices: [{ id: VOICE, songId: SONG_ID, name: 'Lead', order: 0, color: '#e05d5d' }],
      sections: [],
      marks: [
        word('free', { label: 'Rudolph,' }),
        word('edited', { startMs: 1000, endMs: 2000, edited: true }),
        HAND_PHONEME,
      ],
    }
    await saveSong(content)
    await useSongStore.getState().openSong(SONG_ID)
  }

  const marks = () => useSongStore.getState().current?.marks ?? []
  const labelsOf = (wordId: string) =>
    marks()
      .filter((mark) => mark.parentId === wordId)
      .sort((a, b) => a.startMs - b.startMs)
      .map((mark) => mark.label)

  it('breaks down a matching unedited word again after a save, an edit and a delete, and keeps an edited word', async () => {
    await openSong()
    const { user } = await renderDialog()

    await addBySymbols(user, 'RUDOLPH', 'R UW1 D UW0')
    await waitFor(() => expect(labelsOf('free')).toEqual(['etc', 'U', 'etc', 'U']))
    expect(marks().find((mark) => mark.id === 'free')?.unknown).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Edit RUDOLPH' }))
    await user.clear(screen.getByLabelText('CMU symbols'))
    await user.type(screen.getByLabelText('CMU symbols'), 'R UW1 D')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    await waitFor(() => expect(labelsOf('free')).toEqual(['etc', 'U', 'etc']))

    await user.click(screen.getByRole('button', { name: 'Delete RUDOLPH' }))
    await waitFor(() => expect(labelsOf('free')).toEqual(['etc', 'U', 'etc', 'AI', 'L', 'FV']))

    expect(marks().filter((mark) => mark.parentId === 'edited')).toEqual([HAND_PHONEME])
  })

  it('keeps a saved entry when the dictionary does not load, and breaks down the word on "Retry"', async () => {
    await openSong()
    vi.mocked(loadDictionary).mockRejectedValueOnce(new DictionaryLoadError())
    const { user } = await renderDialog()

    await addBySymbols(user, 'RUDOLPH', 'R UW1 D UW0')

    const alert = await screen.findByText(
      'The dictionary did not load. Check the connection and retry.',
    )
    await waitFor(() => expect(entryRows()).toEqual([['RUDOLPH', 'R UW1 D UW0', 'etc U etc U']]))
    expect(labelsOf('free')).toEqual([])

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(labelsOf('free')).toEqual(['etc', 'U', 'etc', 'U']))
    expect(
      screen.queryByText('The dictionary did not load. Check the connection and retry.'),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('makes a word of the layer known after an import of a line with punctuation in its word', async () => {
    await openSong()
    useSongStore.setState((state) => ({
      current: state.current && {
        ...state.current,
        marks: state.current.marks.map((mark) => ({ ...mark, unknown: mark.layer === 'word' })),
      },
    }))
    const { user } = await renderDialog()

    await user.upload(
      screen.getByLabelText('Custom dictionary file'),
      new File(['RUDOLPH!  R UW1 D AA0 L F'], 'words.txt', { type: 'text/plain' }),
    )

    await waitFor(() => expect(marks().find((mark) => mark.id === 'free')?.unknown).toBe(false))
    expect(labelsOf('free')).toEqual(['etc', 'U', 'etc', 'AI', 'L', 'FV'])
    expect(entryRows()).toEqual([['RUDOLPH', 'R UW1 D AA0 L F', 'etc U etc AI L FV']])
  })
})

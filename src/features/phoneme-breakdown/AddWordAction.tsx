import { useState } from 'react'
import { selectedUnknownWord } from '../../store/selectors.ts'
import { useSongStore } from '../../store/songStore.ts'
import { useViewStore } from '../../store/viewStore.ts'
import { CustomDictionaryDialog } from './CustomDictionaryDialog.tsx'

/**
 * Shows "Add to custom dictionary" when the only selected mark is an unknown word.
 * A press opens the custom dictionary dialog with the word in the entry form.
 */
export function AddWordAction() {
  const selectedMarkIds = useViewStore((view) => view.selectedMarkIds)
  const word = useSongStore((state) =>
    selectedUnknownWord(state.current?.marks ?? [], selectedMarkIds),
  )
  // The dialog keeps its own word, because a save makes the word known and removes the button.
  const [dialogWord, setDialogWord] = useState<string | null>(null)
  return (
    <>
      {word !== undefined && (
        <button type="button" className="button" onClick={() => setDialogWord(word.label)}>
          Add to custom dictionary
        </button>
      )}
      {dialogWord !== null && (
        <CustomDictionaryDialog initialWord={dialogWord} onClose={() => setDialogWord(null)} />
      )}
    </>
  )
}

import { useShallow } from 'zustand/react/shallow'
import { nextUnknownWord, unknownWords } from '../../store/selectors.ts'
import { useSongStore } from '../../store/songStore.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'

/**
 * Shows the unknown-word counter of the selected voice, for example "3 unknown words", as a button.
 * A press selects the next unknown word after the play time, and the next press selects the word after it.
 * The counter is absent when the voice has no unknown word.
 */
export function UnknownWordCounter() {
  const selectedVoiceId = useViewStore((view) => view.selectedVoiceId)
  const voiceId = useSongStore(
    (state) => selectedVoice(state.current?.voices ?? [], selectedVoiceId)?.id,
  )
  const words = useSongStore(useShallow(unknownWords(voiceId)))
  if (words.length === 0) return null

  function selectNext() {
    const view = useViewStore.getState()
    const word = nextUnknownWord(words, view.selectedMarkIds, view.playTimeMs)
    if (word === undefined) return
    view.selectMarks([word.id])
    // At the default zoom the full song is in the width, so every word is in view already.
    if (view.pxPerSecond !== null) view.setScroll(word.startMs)
  }

  return (
    <button type="button" className="button" onClick={selectNext}>
      {words.length} {words.length === 1 ? 'unknown word' : 'unknown words'}
    </button>
  )
}

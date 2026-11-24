import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { nextUnknownWord, unknownWords } from '../../store/selectors.ts'
import { useSongStore } from '../../store/songStore.ts'
import { selectedVoice, useViewStore } from '../../store/viewStore.ts'

/**
 * Shows the unknown-word counter of the selected voice, for example "3 unknown words", as a button.
 * A press selects the next unknown word after the play time, and the next press selects the word after it.
 * A hidden live region then tells a screen reader which word is selected.
 * The counter is absent when the voice has no unknown word.
 */
export function UnknownWordCounter() {
  const selectedVoiceId = useViewStore((view) => view.selectedVoiceId)
  const voiceId = useSongStore(
    (state) => selectedVoice(state.current?.voices ?? [], selectedVoiceId)?.id,
  )
  const words = useSongStore(useShallow(unknownWords(voiceId)))
  const [announcement, setAnnouncement] = useState('')
  if (words.length === 0) return null

  function selectNext() {
    const view = useViewStore.getState()
    const word = nextUnknownWord(words, view.selectedMarkIds, view.playTimeMs)
    if (word === undefined) return
    view.selectMarks([word.id])
    setAnnouncement(`Selected ${word.label}.`)
    // At the default zoom the full song is in the width, so every word is in view already.
    if (view.pxPerSecond !== null) view.setScroll(word.startMs)
  }

  return (
    <>
      <button type="button" className="button" onClick={selectNext}>
        {words.length} {words.length === 1 ? 'unknown word' : 'unknown words'}
      </button>
      {/* The selection changes only the look of a mark, so a screen reader needs this text. */}
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </>
  )
}

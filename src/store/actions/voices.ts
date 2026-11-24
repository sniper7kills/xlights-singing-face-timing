import {
  MAX_VOICES,
  nextVoiceColor,
  nextVoiceName,
  numbered,
  reorderedVoices,
  VOICE_COLORS,
  voiceNameError,
} from '../../lib/voices/voiceRules.ts'
import { useSongStore } from '../songStore.ts'
import type { SongContent, Voice } from '../types.ts'

// Each action keeps `content.voices` in `order`, with `order` 0, 1, 2 and no gap.
// The export and the voice rail read the array order.

/**
 * Returns the content with one new voice at the end, and the new voice. It does not change its input.
 * Use it inside a step of `songStore.apply`, so an action that adds a voice and changes marks is one undo step.
 * The new voice gets the next unused colour.
 * @param content The open song.
 * @param name The name of the voice. Omit it for "Voice N" with the lowest free N.
 * Returns null when the song has 12 voices, or when the name has a field error.
 */
export function addVoiceStep(
  content: SongContent,
  name?: string,
): { content: SongContent; voice: Voice } | null {
  const { voices } = content
  const voiceName = name ?? nextVoiceName(voices)
  if (voices.length >= MAX_VOICES || voiceNameError(voices, null, voiceName) !== null) return null
  const voice: Voice = {
    id: crypto.randomUUID(),
    songId: content.song.id,
    name: voiceName.trim(),
    order: voices.length,
    color: nextVoiceColor(voices),
  }
  return { content: { ...content, voices: [...voices, voice] }, voice }
}

/**
 * Adds a voice at the end of the open song, as one undo step. The selected voice does not change.
 * @param songId The id of the song. An id that is not the open song adds nothing.
 * @param name The name of the voice. Omit it for "Voice N" with the lowest free N.
 * Returns the new voice, or null when no voice is added: 12 voices, a name with a field error, or another song.
 */
export function addVoice(songId: string, name?: string): Voice | null {
  let added: Voice | null = null
  useSongStore.getState().apply((content) => {
    const result = content.song.id === songId ? addVoiceStep(content, name) : null
    if (result === null) return content
    added = result.voice
    return result.content
  })
  return added
}

/** Returns the content with `change` applied to the voice with the id, or the same content when `change` gives the same voice. */
function updateVoice(
  content: SongContent,
  id: string,
  change: (voice: Voice) => Voice,
): SongContent {
  const voices = content.voices.map((voice) => (voice.id === id ? change(voice) : voice))
  return voices.every((voice, index) => voice === content.voices[index])
    ? content
    : { ...content, voices }
}

/**
 * Renames a voice of the open song, as one undo step. The voice gets the trimmed name.
 * A name with a field error of `voiceNameError`, the same name, or an unknown id changes nothing.
 * @param id The id of the voice.
 * @param name The new name.
 */
export function renameVoice(id: string, name: string): void {
  useSongStore.getState().apply((content) => {
    if (voiceNameError(content.voices, id, name) !== null) return content
    const trimmed = name.trim()
    return updateVoice(content, id, (voice) =>
      voice.name === trimmed ? voice : { ...voice, name: trimmed },
    )
  })
}

/**
 * Sets the colour of a voice of the open song, as one undo step.
 * A colour that is not in `VOICE_COLORS`, the same colour, or an unknown id changes nothing.
 * @param id The id of the voice.
 * @param color One of the 8 preset colours.
 */
export function setVoiceColor(id: string, color: string): void {
  useSongStore.getState().apply((content) => {
    if (!VOICE_COLORS.includes(color)) return content
    return updateVoice(content, id, (voice) =>
      voice.color === color ? voice : { ...voice, color },
    )
  })
}

/**
 * Sets the order of the voices of the open song, as one undo step. `order` becomes 0, 1, 2 in the new order.
 * @param songId The id of the song. An id that is not the open song changes nothing.
 * @param orderedIds Each voice id of the song one time, in the new order.
 * A list with an unknown id, a repeated id or a missing voice changes nothing. The same order records no step.
 */
export function reorderVoices(songId: string, orderedIds: readonly string[]): void {
  useSongStore.getState().apply((content) => {
    if (content.song.id !== songId) return content
    const voices = reorderedVoices(content.voices, orderedIds)
    if (voices === null || voices.every((voice, index) => voice === content.voices[index]))
      return content
    return { ...content, voices }
  })
}

/**
 * Deletes a voice of the open song with each of its marks, as one undo step.
 * The other voices get `order` 0, 1, 2 again.
 * The last voice of a song and an unknown id change nothing.
 * @param id The id of the voice.
 */
export function deleteVoice(id: string): void {
  useSongStore.getState().apply((content) => {
    if (content.voices.length <= 1 || !content.voices.some((voice) => voice.id === id))
      return content
    return {
      ...content,
      voices: numbered(content.voices.filter((voice) => voice.id !== id)),
      marks: content.marks.filter((mark) => mark.voiceId !== id),
    }
  })
}

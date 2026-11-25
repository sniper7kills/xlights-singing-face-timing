import { useSongStore } from '../songStore.ts'

/**
 * Mutes or unmutes the face preview of a voice of the open song, as one undo step.
 * The song stores the value, so it stays after a reload.
 * The same value or an unknown id records no step.
 * @param id The id of the voice.
 * @param muted True to hide the face of the voice in the face preview.
 */
export function setVoicePreviewMuted(id: string, muted: boolean): void {
  useSongStore.getState().apply((content) => {
    const voice = content.voices.find((item) => item.id === id)
    if (voice === undefined || (voice.previewMuted ?? false) === muted) return content
    return {
      ...content,
      voices: content.voices.map((item) =>
        item === voice ? { ...item, previewMuted: muted } : item,
      ),
    }
  })
}

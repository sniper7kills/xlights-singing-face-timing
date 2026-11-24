import { previewFrameSize } from '../../lib/marks/frameRules.ts'
import { useSongStore } from '../songStore.ts'
import type { FrameMs } from '../types.ts'
import { commitMarkEdit } from './commitMarkEdit.ts'

/**
 * Sets the frame size of the open song and snaps every mark of the song to it, as one undo step.
 * The rules are those of `previewFrameSize`. Each unedited word that changes length gets a new break down
 * at the new frame size, when the dictionary is in memory.
 * A call that changes nothing records no step.
 * @param songId The id of the song. An id that is not the open song changes nothing.
 * @param frameMs The new frame size.
 */
export function setFrameMs(songId: string, frameMs: FrameMs): void {
  useSongStore.getState().apply((content) => {
    if (content.song.id !== songId || content.song.frameMs === frameMs) return content
    // The break down of commitMarkEdit reads the frame size of the song, so the song gets it first.
    const resized = { ...content, song: { ...content.song, frameMs } }
    return commitMarkEdit(
      resized,
      previewFrameSize(content.marks, frameMs, content.song.durationMs),
    )
  })
}

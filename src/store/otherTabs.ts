import { create } from 'zustand'
import { forgetStoredIds, onSongSaved } from './db.ts'
import { useSongStore } from './songStore.ts'

/** The name of the channel that the tabs of the app share. */
export const TAB_CHANNEL_NAME = 'singing-face-timing'

/** The part of a BroadcastChannel that the app uses. */
export type TabChannel = {
  postMessage: (message: unknown) => void
  onmessage: ((event: MessageEvent) => void) | null
  close: () => void
}

export type OtherTabState = {
  /** The id of the open song after a different tab saved it, or null. The editor shows the notice for it. */
  songId: string | null
}

/** The store of the notice that a different tab saved the open song (FR-audio-27). */
export const useOtherTabStore = create<OtherTabState>()(() => ({ songId: null }))

/** Removes the notice. */
export function closeOtherTabNotice(): void {
  useOtherTabStore.setState({ songId: null })
}

// A browser with no BroadcastChannel gets no notice, and each ordinary save still reads the stored keys.
function openChannel(): TabChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TAB_CHANNEL_NAME)
}

function songIdOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('songId' in data)) return null
  return typeof data.songId === 'string' ? data.songId : null
}

/**
 * Tells the other tabs of the app about each completed save of a song, and hears their saves.
 * A save in a different tab makes the stored ids of this tab wrong, so this tab forgets them.
 * If the song is open in this tab, the editor shows the notice.
 * Returns a function that stops the watch and closes the channel.
 * @param createChannel Returns the channel, or null when the browser has none.
 */
export function startOtherTabWatch(
  createChannel: () => TabChannel | null = openChannel,
): () => void {
  const channel = createChannel()
  if (channel === null) return () => undefined
  const stopSaved = onSongSaved((songId) => channel.postMessage({ songId }))
  channel.onmessage = (event) => {
    const songId = songIdOf(event.data)
    if (songId === null) return
    forgetStoredIds(songId)
    if (useSongStore.getState().current?.song.id === songId) useOtherTabStore.setState({ songId })
  }
  return () => {
    stopSaved()
    channel.onmessage = null
    channel.close()
  }
}

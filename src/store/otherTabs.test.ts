import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSong, saveSong } from './db.ts'
import { makeSongContent } from './fixtures.test-helpers.ts'
import {
  closeOtherTabNotice,
  startOtherTabWatch,
  TAB_CHANNEL_NAME,
  type TabChannel,
  useOtherTabStore,
} from './otherTabs.ts'
import { useSongStore } from './songStore.ts'

/** A channel in memory that records each posted message, so a test can send a message of a different tab. */
function fakeChannel() {
  const channel: TabChannel & { posted: unknown[]; closed: boolean } = {
    posted: [],
    closed: false,
    onmessage: null,
    postMessage(message) {
      channel.posted.push(message)
    },
    close() {
      channel.closed = true
    },
  }
  const receive = (data: unknown) => channel.onmessage?.(new MessageEvent('message', { data }))
  return { channel, receive }
}

let stop: () => void = () => undefined

beforeEach(() => {
  useOtherTabStore.setState({ songId: null })
})

afterEach(() => {
  stop()
  vi.restoreAllMocks()
  useSongStore.getState().closeSong()
})

describe('startOtherTabWatch', () => {
  it('posts the song id after each completed save', async () => {
    const { channel } = fakeChannel()
    stop = startOtherTabWatch(() => channel)

    await saveSong(makeSongContent('song-1'))

    expect(channel.posted).toEqual([{ songId: 'song-1' }])
  })

  it('shows the notice when a different tab saves the open song, and the close removes it', async () => {
    await saveSong(makeSongContent('song-1'))
    await useSongStore.getState().openSong('song-1')
    const { channel, receive } = fakeChannel()
    stop = startOtherTabWatch(() => channel)

    receive({ songId: 'song-1' })
    expect(useOtherTabStore.getState().songId).toBe('song-1')

    closeOtherTabNotice()
    expect(useOtherTabStore.getState().songId).toBeNull()
  })

  it('shows no notice for a song that is not open, and ignores a message with no song id', async () => {
    await saveSong(makeSongContent('song-1'))
    await useSongStore.getState().openSong('song-1')
    const { channel, receive } = fakeChannel()
    stop = startOtherTabWatch(() => channel)

    receive({ songId: 'song-2' })
    receive({ other: 'song-1' })
    receive({ songId: 7 })
    receive(null)

    expect(useOtherTabStore.getState().songId).toBeNull()
  })

  it('makes the next save of a page that unloads read the stored keys after a different tab saved the song', async () => {
    const content = makeSongContent('song-1')
    await saveSong(content)
    await loadSong('song-1')
    const { channel, receive } = fakeChannel()
    stop = startOtherTabWatch(() => channel)
    const commit = vi.spyOn(IDBTransaction.prototype, 'commit')

    receive({ songId: 'song-1' })
    await saveSong(content, undefined, { unloading: true })

    expect(commit).not.toHaveBeenCalled()
  })

  it('stops the posts and closes the channel when the stop function runs', async () => {
    const { channel } = fakeChannel()
    startOtherTabWatch(() => channel)()

    await saveSong(makeSongContent('song-1'))

    expect(channel.posted).toEqual([])
    expect(channel.closed).toBe(true)
    expect(channel.onmessage).toBeNull()
  })

  it('does nothing in a browser with no channel', async () => {
    stop = startOtherTabWatch(() => null)

    await expect(saveSong(makeSongContent('song-1'))).resolves.toBeDefined()
  })

  it('opens no channel in a browser with no BroadcastChannel', () => {
    const original = globalThis.BroadcastChannel
    vi.stubGlobal('BroadcastChannel', undefined)
    try {
      expect(() => (stop = startOtherTabWatch())).not.toThrow()
    } finally {
      vi.stubGlobal('BroadcastChannel', original)
    }
  })

  it('opens the channel of the app by default', () => {
    const original = globalThis.BroadcastChannel
    const opened: string[] = []
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage = null
        constructor(name: string) {
          opened.push(name)
        }
        postMessage() {}
        close() {}
      },
    )
    stop = startOtherTabWatch()
    vi.stubGlobal('BroadcastChannel', original)

    expect(opened).toEqual([TAB_CHANNEL_NAME])
  })
})

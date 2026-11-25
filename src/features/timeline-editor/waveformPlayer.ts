import WaveSurfer from 'wavesurfer.js'
import { ImportError } from '../audio-import/createSongFromFile.ts'
import { decodeAudio } from '../audio-import/decodeAudio.ts'
import type { TimeRange } from '../../lib/time/timeRange.ts'
import { mixChannels } from './mixChannels.ts'
import { attachPlayer, detachPlayer, type PlayRate, setLooping } from './playerStore.ts'

// wavesurfer.js decodes for the waveform at this rate by default. Play uses the original file.
const WAVEFORM_SAMPLE_RATE = 8000

export type WaveformColors = {
  /** The colour of the waveform after the play time. */
  wave: string
  /** The colour of the waveform before the play time. */
  progress: string
}

export type WaveformListeners = {
  /** Receives the play time in whole milliseconds, during play and after a seek. */
  onTime: (ms: number) => void
  /** Receives true when play starts and false when play pauses or ends. */
  onPlayChange: (playing: boolean) => void
}

/** The waveform and the audio play of one song. The component tests replace this module. */
export type WaveformPlayer = {
  /** The media element that plays the song audio. The track mixer follows it (ADR 0010). */
  media: HTMLMediaElement
  /** Starts play at the play time and ends a loop. Rejects if the browser refuses to play the audio. */
  play: () => Promise<void>
  /** Pauses play and ends a loop. */
  pause: () => void
  /**
   * Plays `range` again and again until a call of `play`, `pause` or `seek`.
   * At the end of the range, play goes back to its start. A loop that plays already changes to the new range.
   * Rejects, and ends the loop, if the browser refuses to play the audio.
   */
  loop: (range: TimeRange) => Promise<void>
  /** Sets the play speed and keeps the pitch of the audio. */
  setPlayRate: (rate: PlayRate) => void
  isPlaying: () => boolean
  setColors: (colors: WaveformColors) => void
  /**
   * Shows the waveform at the zoom and the scroll offset of the editor.
   * @param pxPerSecond The zoom in pixels for each second. Null fits the full song in the width.
   * @param scrollMs The time at the left edge, in milliseconds. The editor clamps it to the song.
   */
  setView: (pxPerSecond: number | null, scrollMs: number) => void
  /** Moves the play time to `ms` and ends a loop. The player sends the new time to `onTime`. */
  seek: (ms: number) => void
  /** Stops play, ends a loop and removes the waveform from its container. */
  destroy: () => void
}

/**
 * Returns a player that draws the waveform of `audio` in `container` and plays `audio`.
 * The waveform shows one mixed channel. Play keeps all channels of the file.
 * The waveform fills the width of the container until `setView` sets a zoom.
 * The player draws no cursor, takes no click and does not scroll by itself: the editor owns those.
 * The player adds itself to the player store when it is ready, and removes itself on `destroy`.
 * @param container The element that holds the waveform.
 * @param audio The bytes of the audio file.
 * @param colors The colours of the waveform.
 * @param listeners The functions that receive the play time and the play state.
 * Rejects with ImportError of the kind 'decode' if the browser cannot decode the audio,
 * or if wavesurfer.js cannot load the audio after the decode.
 * Rejects with a different error if the browser cannot read the bytes of `audio`.
 */
export async function createWaveformPlayer(
  container: HTMLElement,
  audio: Blob,
  colors: WaveformColors,
  listeners: WaveformListeners,
): Promise<WaveformPlayer> {
  const bytes = await audio.arrayBuffer()
  let decoded: AudioBuffer
  try {
    decoded = await decodeAudio(bytes, WAVEFORM_SAMPLE_RATE)
  } catch {
    // The decodeAudioData page lists no supported formats, so each rejection means "cannot decode".
    throw new ImportError({ kind: 'decode' })
  }
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) =>
    decoded.getChannelData(channel),
  )

  const waveSurfer = WaveSurfer.create({
    container,
    height: 'auto',
    waveColor: colors.wave,
    progressColor: colors.progress,
    cursorColor: colors.progress,
    // The editor draws one play cursor across the stage, so the waveform draws none.
    cursorWidth: 0,
    // A click or a drag on the waveform moves the play cursor or makes a time selection in the editor.
    interact: false,
    // The editor follows the play cursor itself, so the waveform and the layers scroll together.
    autoScroll: false,
    autoCenter: false,
    hideScrollbar: true,
  })
  // The view that the editor set. A resize of the container makes wavesurfer.js move its scroll.
  let view: { pxPerSecond: number | null; scrollPx: number } = { pxPerSecond: null, scrollPx: 0 }
  waveSurfer.on('scroll', (_start, _end, scrollLeft) => {
    if (Math.abs(scrollLeft - view.scrollPx) >= 1) waveSurfer.setScroll(view.scrollPx)
  })
  let loopRange: TimeRange | null = null
  const endLoop = () => {
    loopRange = null
    setLooping(false)
  }
  const toLoopStart = (range: TimeRange) => waveSurfer.setTime(range.startMs / 1000)
  waveSurfer.on('timeupdate', (seconds) => {
    const ms = Math.round(seconds * 1000)
    // timeupdate comes on each animation frame, so the loop can pass its end by up to one frame of audio.
    if (loopRange !== null && ms >= loopRange.endMs) toLoopStart(loopRange)
    else listeners.onTime(ms)
  })
  waveSurfer.on('play', () => listeners.onPlayChange(true))
  waveSurfer.on('pause', () => listeners.onPlayChange(false))
  waveSurfer.on('finish', () => {
    listeners.onPlayChange(false)
    // A loop that ends at the song end gets no timeupdate past its end, because the audio stops there.
    if (loopRange !== null) {
      toLoopStart(loopRange)
      void waveSurfer.play()
    }
  })

  try {
    // With peaks and a duration, wavesurfer.js skips its own decode and plays the blob.
    await waveSurfer.loadBlob(audio, [mixChannels(channels)], decoded.duration)
  } catch {
    waveSurfer.destroy()
    // The bytes came from storage already, so a load failure here is a media failure of the browser.
    throw new ImportError({ kind: 'decode' })
  }

  const media = waveSurfer.getMediaElement()
  if (media === null) {
    waveSurfer.destroy()
    throw new ImportError({ kind: 'decode' })
  }
  // The element joins the page with no controls, so it shows nothing, and an E2E test can read its play state.
  media.dataset.audioRow = 'song'
  container.append(media)

  const player: WaveformPlayer = {
    media,
    play: () => {
      endLoop()
      return waveSurfer.play()
    },
    pause: () => {
      endLoop()
      waveSurfer.pause()
    },
    loop: async (range) => {
      loopRange = range
      setLooping(true)
      toLoopStart(range)
      try {
        await waveSurfer.play()
      } catch (error) {
        endLoop()
        throw error
      }
    },
    // The browser keeps the pitch by default. The app sets it, so a browser with a different default keeps it too.
    setPlayRate: (rate) => waveSurfer.setPlaybackRate(rate, true),
    isPlaying: () => waveSurfer.isPlaying(),
    setColors: ({ wave, progress }) =>
      waveSurfer.setOptions({ waveColor: wave, progressColor: progress, cursorColor: progress }),
    setView: (pxPerSecond, scrollMs) => {
      if (pxPerSecond !== view.pxPerSecond)
        // `fillParent` stretches a short waveform to the width, which the time scale of the layers does not do.
        waveSurfer.setOptions({ minPxPerSec: pxPerSecond ?? 0, fillParent: pxPerSecond === null })
      view = {
        pxPerSecond,
        scrollPx: pxPerSecond === null ? 0 : Math.round((scrollMs * pxPerSecond) / 1000),
      }
      waveSurfer.setScroll(view.scrollPx)
    },
    seek: (ms) => {
      endLoop()
      waveSurfer.setTime(ms / 1000)
    },
    destroy: () => {
      detachPlayer(player)
      loopRange = null
      waveSurfer.destroy()
    },
  }
  attachPlayer(player)
  return player
}

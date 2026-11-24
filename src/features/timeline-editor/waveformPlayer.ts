import WaveSurfer from 'wavesurfer.js'
import { ImportError } from '../audio-import/createSongFromFile.ts'
import { mixChannels } from './mixChannels.ts'

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
  /** Starts play. Rejects if the browser refuses to play the audio. */
  play: () => Promise<void>
  pause: () => void
  isPlaying: () => boolean
  setColors: (colors: WaveformColors) => void
  /** Stops play and removes the waveform from its container. */
  destroy: () => void
}

/**
 * Returns a player that draws the waveform of `audio` in `container` and plays `audio`.
 * The waveform shows one mixed channel. Play keeps all channels of the file.
 * The waveform fills the width of the container.
 * @param container The element that holds the waveform.
 * @param audio The bytes of the audio file.
 * @param colors The colours of the waveform.
 * @param listeners The functions that receive the play time and the play state.
 * Rejects with ImportError of the kind 'decode' if the browser cannot decode the audio.
 * Rejects with a different error if the browser cannot read the bytes of `audio`.
 */
export async function createWaveformPlayer(
  container: HTMLElement,
  audio: Blob,
  colors: WaveformColors,
  listeners: WaveformListeners,
): Promise<WaveformPlayer> {
  const bytes = await audio.arrayBuffer()
  const context = new AudioContext({ sampleRate: WAVEFORM_SAMPLE_RATE })
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(bytes)
  } catch {
    // The decodeAudioData page lists no supported formats, so each rejection means "cannot decode".
    throw new ImportError({ kind: 'decode' })
  } finally {
    // Browsers limit the number of open audio contexts.
    void context.close()
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
  })
  waveSurfer.on('timeupdate', (seconds) => listeners.onTime(Math.round(seconds * 1000)))
  waveSurfer.on('play', () => listeners.onPlayChange(true))
  waveSurfer.on('pause', () => listeners.onPlayChange(false))
  waveSurfer.on('finish', () => listeners.onPlayChange(false))

  try {
    // With peaks and a duration, wavesurfer.js skips its own decode and plays the blob.
    await waveSurfer.loadBlob(audio, [mixChannels(channels)], decoded.duration)
  } catch (error) {
    waveSurfer.destroy()
    throw error
  }

  return {
    play: () => waveSurfer.play(),
    pause: () => waveSurfer.pause(),
    isPlaying: () => waveSurfer.isPlaying(),
    setColors: ({ wave, progress }) =>
      waveSurfer.setOptions({ waveColor: wave, progressColor: progress, cursorColor: progress }),
    destroy: () => waveSurfer.destroy(),
  }
}

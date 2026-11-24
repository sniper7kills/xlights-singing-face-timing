/**
 * Returns one channel that is the average of all channels, sample by sample.
 * The waveform shows this one mixed channel. Play keeps the original channels.
 * @param channels The samples of each channel. All channels have the same length.
 */
export function mixChannels(channels: Float32Array[]): Float32Array {
  const [first, ...others] = channels
  if (first === undefined) return new Float32Array(0)
  if (others.length === 0) return first
  const mixed = new Float32Array(first.length)
  for (let i = 0; i < mixed.length; i++) {
    let sum = 0
    for (const channel of channels) sum += channel[i] ?? 0
    mixed[i] = sum / channels.length
  }
  return mixed
}

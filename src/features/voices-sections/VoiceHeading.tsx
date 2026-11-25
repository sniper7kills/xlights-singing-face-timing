import type { Voice } from '../../store/types.ts'

/**
 * Shows the heading "Voice: <voice name>" with the colour chip of the voice, above the phrase layer.
 * The heading names the shown voice, so the person does not edit the marks of a different voice by mistake.
 */
export function VoiceHeading({ voice }: { voice: Voice }) {
  return (
    <h3 className="layers-voice">
      <span className="voice-chip" style={{ background: voice.color }} aria-hidden="true" />
      <span className="layers-voice-name">Voice: {voice.name}</span>
    </h3>
  )
}

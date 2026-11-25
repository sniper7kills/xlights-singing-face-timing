import type { Mark, Voice } from '../../store/types.ts'

/**
 * Returns the text of `lyrics.txt`: the phrases of each voice, or an empty text when no voice has a phrase.
 * Each voice with a phrase gives its name as a heading line, then one line for each phrase label in time order.
 * A blank line separates two voices. The voices are in the order of `Voice.order`.
 * @param voices The voices of the song.
 * @param marks The marks of the song. The function reads the phrases only.
 */
export function lyricsText(voices: readonly Voice[], marks: readonly Mark[]): string {
  const blocks = [...voices]
    .sort((a, b) => a.order - b.order)
    .map((voice) => {
      const phrases = marks
        .filter((mark) => mark.voiceId === voice.id && mark.layer === 'phrase')
        .sort((a, b) => a.startMs - b.startMs)
      return phrases.length === 0
        ? null
        : [voice.name, ...phrases.map((phrase) => phrase.label)].join('\n')
    })
    .filter((block) => block !== null)
  return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`
}

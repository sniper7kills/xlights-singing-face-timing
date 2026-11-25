/** The most characters that the lyrics field accepts. No real song reaches it, and longer text slows the align step. */
export const MAX_LYRICS_LENGTH = 20_000

/** The message under the lyrics field when the lyrics have more than `MAX_LYRICS_LENGTH` characters. */
export const LYRICS_TOO_LONG_MESSAGE = 'The lyrics are too long. Use 20 000 characters at most.'

/**
 * Returns true when the lyrics have more than `MAX_LYRICS_LENGTH` characters.
 * The dialog then disables "Start" and reads no line of the lyrics.
 * @param lyrics The text of the lyrics field.
 */
export function lyricsTooLong(lyrics: string): boolean {
  return lyrics.length > MAX_LYRICS_LENGTH
}

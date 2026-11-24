/**
 * One word that the speech model returns, with its time.
 * The worker result holds only words that have a start time and an end time.
 */
export type TimedWord = {
  /** The word as the speech model or the lyrics spell it. */
  text: string
  /** The start time in milliseconds from the start of the song. */
  startMs: number
  /** The end time in milliseconds from the start of the song. */
  endMs: number
}

/** One word of a phrase, with a flag that tells if its time is an estimate. */
export type AlignedWord = TimedWord & {
  /**
   * True when no word of the speech model gave the time.
   * The app shows the "estimated" style for this word.
   */
  estimated: boolean
}

/**
 * One phrase with its words.
 * The phrase starts at the start of its first word and ends at the end of its last word.
 */
export type AlignedPhrase = {
  /** The words of the phrase, joined with one space. */
  text: string
  startMs: number
  endMs: number
  /** The words in time order. A phrase always has one or more words. */
  words: AlignedWord[]
}

/** The result of `alignLyrics`. */
export type AlignResult = {
  /** One phrase for each lyrics line that has words. */
  phrases: AlignedPhrase[]
  /**
   * The matched lyrics words divided by all lyrics words, from 0 to 1.
   * The caller shows a warning below 0.3.
   */
  matchRatio: number
}

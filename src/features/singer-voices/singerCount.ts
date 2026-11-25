/** A choice of "Singers" in the transcribe dialog: the app estimates the count, or the person gives it. */
export type SingerCountChoice = 'automatic' | 2 | 3 | 4

/** The choices of "Singers", in the order of the dialog. */
export const SINGER_COUNT_CHOICES: readonly SingerCountChoice[] = ['automatic', 2, 3, 4]

/** Returns true when the value is a choice of `SINGER_COUNT_CHOICES`. A stored value can come from another app version. */
export function isSingerCountChoice(value: unknown): value is SingerCountChoice {
  return SINGER_COUNT_CHOICES.some((choice) => choice === value)
}

/** Returns the text of a choice in the dialog: "Automatic", or the count. */
export function singerCountLabel(choice: SingerCountChoice): string {
  return choice === 'automatic' ? 'Automatic' : String(choice)
}

/** Returns the count of singers for the singer search, or `undefined` when the app estimates the count. */
export function singerCountOf(choice: SingerCountChoice): number | undefined {
  return choice === 'automatic' ? undefined : choice
}

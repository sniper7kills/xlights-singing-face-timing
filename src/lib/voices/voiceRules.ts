import type { Mark, Voice } from '../../store/types.ts'

/** The first preset colour: the colour of "Lead Vocals" in the editor mockup. A new song gives it to its one voice. */
export const FIRST_VOICE_COLOR = '#ffb238'

/**
 * The 12 preset colours of a voice, in the order that new voices get them. A song has 12 voices at most,
 * so each voice can have its own colour. The measured contrast of each colour is in `05-voices-sections.md`.
 */
export const VOICE_COLORS: readonly string[] = [
  FIRST_VOICE_COLOR,
  '#4cc9f0',
  '#7ae582',
  '#f472b6',
  '#a78bfa',
  '#f87171',
  '#2dd4bf',
  '#c0ca33',
  '#5b8cff',
  '#e05ad8',
  '#c3c9d6',
  '#b5835a',
]

/** The name of each preset colour. The colour menu shows it, so a colour is not shown by its hue alone. */
export const VOICE_COLOR_NAMES: Readonly<Record<string, string>> = {
  '#ffb238': 'Amber',
  '#4cc9f0': 'Sky',
  '#7ae582': 'Green',
  '#f472b6': 'Pink',
  '#a78bfa': 'Violet',
  '#f87171': 'Red',
  '#2dd4bf': 'Teal',
  '#c0ca33': 'Lime',
  '#5b8cff': 'Blue',
  '#e05ad8': 'Magenta',
  '#c3c9d6': 'Silver',
  '#b5835a': 'Brown',
}

/** The most voices that a song has. */
export const MAX_VOICES = 12

const MAX_NAME_LENGTH = 60

const FORBIDDEN_CHARACTERS = /[<>&"]/

/** The field error for a voice name that is empty or longer than 60 characters. */
export const NAME_LENGTH_ERROR = 'A voice name has 1 to 60 characters.'

/** The field error for a voice name with a character that xLights menus do not show well. */
export const NAME_CHARACTER_ERROR = 'A voice name cannot contain <, >, & or ".'

/** The field error for a voice name that another voice of the song has. */
export const DUPLICATE_NAME_ERROR = 'A voice with this name exists.'

function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Returns the default name of a new voice: "Voice N", with the lowest free N.
 * N starts at 2, because a new song already has its first voice.
 * @param voices The voices of the song.
 * @param base The word before the number. A singer voice of a transcribe run uses "Singer".
 */
export function nextVoiceName(voices: readonly Voice[], base = 'Voice'): string {
  const used = new Set(voices.map((voice) => nameKey(voice.name)))
  let n = 2
  while (used.has(nameKey(`${base} ${n}`))) n += 1
  return `${base} ${n}`
}

/**
 * Returns the colour of a new voice: the first preset colour that no voice of the song has.
 * When each preset colour is in use, returns the colour at the index of the voice count, modulo 12.
 * @param voices The voices of the song.
 */
export function nextVoiceColor(voices: readonly Voice[]): string {
  const used = new Set(voices.map((voice) => voice.color))
  return (
    VOICE_COLORS.find((color) => !used.has(color)) ??
    VOICE_COLORS[voices.length % VOICE_COLORS.length] ??
    FIRST_VOICE_COLOR
  )
}

/**
/**
 * Returns true when a voice other than `voiceId` has a phrase.
 * The empty state of the layers then names "Move to voice".
 * @param marks The marks of the song.
 * @param voiceId The id of the shown voice.
 */
export function otherVoiceHasPhrases(marks: readonly Mark[], voiceId: string): boolean {
  return marks.some((mark) => mark.layer === 'phrase' && mark.voiceId !== voiceId)
}

/**
 * Returns the field error for a voice name, or null when the name is legal.
 * The rule trims the name first. It compares names without regard to letter case.
 * @param voices The voices of the song.
 * @param voiceId The id of the voice that gets the name, so its own name is not a duplicate. Null for a new voice.
 * @param name The name that the person typed.
 */
export function voiceNameError(
  voices: readonly Voice[],
  voiceId: string | null,
  name: string,
): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return NAME_LENGTH_ERROR
  if (FORBIDDEN_CHARACTERS.test(trimmed)) return NAME_CHARACTER_ERROR
  const key = nameKey(trimmed)
  const taken = voices.some((voice) => voice.id !== voiceId && nameKey(voice.name) === key)
  return taken ? DUPLICATE_NAME_ERROR : null
}

/**
 * Returns the voices in a new order, with `order` set to 0, 1, 2 and so on.
 * @param voices The voices of the song.
 * @param orderedIds Each voice id of the song one time, in the new order.
 * Returns null when `orderedIds` has an unknown id, a repeated id, or misses a voice.
 */
export function reorderedVoices(
  voices: readonly Voice[],
  orderedIds: readonly string[],
): Voice[] | null {
  if (orderedIds.length !== voices.length || new Set(orderedIds).size !== orderedIds.length)
    return null
  const byId = new Map(voices.map((voice) => [voice.id, voice]))
  const ordered: Voice[] = []
  for (const id of orderedIds) {
    const voice = byId.get(id)
    if (voice === undefined) return null
    ordered.push(voice)
  }
  return numbered(ordered)
}

/**
 * Returns the voice ids in row order after one voice moves one place up or down.
 * @param voices The voices in row order.
 * @param id The id of the voice that moves.
 * @param direction -1 moves the voice up, and 1 moves it down.
 * Returns the ids in the same order when the voice is already first or last, or the id is unknown.
 */
export function idsAfterMove(voices: readonly Voice[], id: string, direction: -1 | 1): string[] {
  const ids = voices.map((voice) => voice.id)
  const from = ids.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= ids.length) return ids
  ids.splice(from, 1)
  ids.splice(to, 0, id)
  return ids
}

/**
 * Returns the voices with `order` set to their index, so the order has no gap.
 * A voice that already has its index keeps its object.
 * @param voices The voices in row order.
 */
export function numbered(voices: readonly Voice[]): Voice[] {
  return voices.map((voice, index) => (voice.order === index ? voice : { ...voice, order: index }))
}

/**
 * Returns the number of phrases of each voice.
 * @param marks The marks of the song.
 * A voice with no phrase has no entry.
 */
export function phraseCounts(marks: readonly Mark[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const mark of marks)
    if (mark.layer === 'phrase') counts.set(mark.voiceId, (counts.get(mark.voiceId) ?? 0) + 1)
  return counts
}

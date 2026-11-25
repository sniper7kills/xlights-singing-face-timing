/**
 * Returns the ids that are present, separated by one space, for an attribute such as `aria-describedby`.
 * Returns undefined when no id is present, so the element gets no attribute.
 * @param ids An id, or false or null for a text that does not show.
 */
export function idList(...ids: (string | false | null)[]): string | undefined {
  const present = ids.filter((id): id is string => typeof id === 'string' && id !== '')
  return present.length === 0 ? undefined : present.join(' ')
}

/**
 * Returns the text with the five XML special characters replaced by standard XML entities.
 * The result is safe in element content and in an attribute value in double or single quotes.
 * @param text The text to escape, for example a label or a timing track name.
 */
export function escapeXml(text: string): string {
  // The `&` replacement comes first, so that it does not change the other entities.
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

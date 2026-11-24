// XML 1.0 allows only these code points. See production [2] `Char` in the specification.
const FORBIDDEN = /[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu

/**
 * Returns the text as XML 1.0 text: without the forbidden code points, and with the special characters escaped.
 * The result is safe in element content and in an attribute value in double or single quotes.
 *
 * The rules:
 * - The function removes each code point that XML 1.0 forbids: U+0000 to U+001F except tab, line feed and
 *   carriage return, the surrogates U+D800 to U+DFFF without a pair, U+FFFE and U+FFFF.
 *   A parser rejects the full file for one such code point.
 * - The function writes `&`, `<`, `>`, `"` and `'` as the standard XML entities.
 * - The function writes tab, line feed and carriage return as `&#9;`, `&#10;` and `&#13;`.
 *   A parser reads each of these characters in an attribute value as a space, and keeps a character reference.
 *
 * Verified against: https://www.w3.org/TR/xml/#charsets and https://www.w3.org/TR/xml/#AVNormalize
 * (XML 1.0 Fifth Edition, retrieved 2026-11-24).
 *
 * @param text The text to escape, for example a label or a timing track name.
 */
export function escapeXml(text: string): string {
  // The `&` replacement comes first, so that it does not change the other entities.
  return text
    .replace(FORBIDDEN, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('\t', '&#9;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;')
}

/**
 * Serializes a JSON-LD object for a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` alone is not safe to hand to `dangerouslySetInnerHTML` here: it does not
 * escape `<`, so a value that flows into the object unsanitized — a product title or description
 * imported from AliExpress or a CSV, neither of which is sanitized on the way in — can contain
 * `</script><script>...` and break out of the script tag into the surrounding HTML, executing on
 * every visitor who views that public product/guide page. Escaping `<` as `<` keeps the JSON
 * value identical (the parser reads the unicode escape back to the same character) while making
 * it impossible to close the tag from inside the string.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

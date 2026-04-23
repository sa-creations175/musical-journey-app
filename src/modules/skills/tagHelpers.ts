/**
 * Canonical tag format: lowercase, trimmed, whitespace collapsed
 * into hyphens. Leaves punctuation-meaningful characters ("&", "#")
 * alone so tags like "r&b" and "7b9" can still exist.
 *
 * Lives in its own file so the React-refresh lint doesn't object to
 * exporting non-component helpers next to components — and so other
 * modules can normalise tags before writing them.
 */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

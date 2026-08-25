/**
 * How a LABEL is cased, decided once.
 *
 * Nav rows and module-home card titles both read from here. They are
 * the same problem — a canonical lowercase label that has to appear in
 * a style — and answering it twice is how "Chord Recognition" in one
 * list comes to sit beside "chord recognition" in another.
 *
 * =====================================================================
 * THE LABELS STAY CANONICAL. ONLY THE RENDER CHANGES.
 *
 * Every label already exists in exactly one place — `moduleMeta`, a
 * sidebar group's item list, a module's own sub-items, a card adapter —
 * and those strings are what the rest of the app matches on. Retyping
 * them in Title Case would make the style a property of each string,
 * so a renamed item would silently arrive in the old style, and
 * something that matched on a label would match the wrong one.
 *
 * So casing is applied where the label is DRAWN, from here. A module
 * renamed in `moduleMeta` arrives capitalised without anyone
 * remembering to, and a card and its nav row cannot disagree.
 * =====================================================================
 *
 * MODULE NAMES ARE UPPERCASED IN CSS, not here: `uppercase` is a render
 * transform, so the DOM still carries the real label for anything
 * reading it. Title Case cannot be done that way — CSS `capitalize`
 * capitalises every word including the small ones, and treats hyphens
 * inconsistently across engines — so it is computed.
 */

/**
 * Words a title leaves lowercase unless they start it.
 *
 * Deliberately short. It exists so "want to learn" reads as "Want to
 * Learn" rather than "Want To Learn"; it is not a style guide, and
 * anything not listed is capitalised.
 */
const MINOR_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
]);

/** Capitalise one word, and each half of a hyphenated one. */
function capitalise(word: string): string {
  return word
    .split('-')
    .map(part => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join('-');
}

/**
 * "voice-leading drills" → "Voice-Leading Drills".
 * "want to learn" → "Want to Learn".
 *
 * The FIRST word is always capitalised, whatever it is — a title that
 * opened with a lowercase "the" would read as a mistake rather than as
 * a rule.
 */
export function titleCase(label: string): string {
  return label
    .split(/(\s+)/)
    .map((chunk, i) => {
      if (/^\s+$/.test(chunk) || chunk.length === 0) return chunk;
      const lower = chunk.toLowerCase();
      // Index counts whitespace chunks too, so the first WORD is 0.
      if (i > 0 && MINOR_WORDS.has(lower)) return lower;
      return capitalise(chunk);
    })
    .join('');
}

/**
 * The class that renders a module's name in caps.
 *
 * A CLASS RATHER THAN A STRING TRANSFORM so the DOM keeps the canonical
 * label — see the header.
 */
export const MODULE_NAME_CASE = 'uppercase tracking-wide';

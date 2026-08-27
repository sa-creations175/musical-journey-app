/**
 * How a LABEL is cased, decided once.
 *
 * Nav rows, module-home card titles and the dashboard read catalog all
 * read from here. They are the same problem — a canonical lowercase
 * label that has to appear in a style — and answering it three times is
 * how "Chord Recognition" in one list came to sit beside "chord
 * recognition" in another.
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
 *
 * ─── The three exemptions ────────────────────────────────────────────
 *
 * NOTATION, UNITS AND SENTENCES ARE NOT LABELS. Two of the three can be
 * recognised from the word itself and are handled below:
 *
 *   1. NOTATION — roman numerals (`vi`, `ii`, `bVII`) and degrees led by
 *      an accidental (`b3`, `#4`). The case IS the meaning: `vi` is a
 *      minor six and `VI` is a major one, `b3` is a flat third and `B3`
 *      is a note two octaves below middle C.
 *   2. UNITS — `bpm`, `min`, `sec` and that family. A unit has a
 *      spelling, not a style.
 *
 * The third cannot be seen from one word, so it is a CALL-SITE
 * decision, not this function's:
 *
 *   3. SENTENCES — a full sentence, a question, an instruction, or a
 *      fragment that only completes a neighbouring sentence is body
 *      copy. Do not pass it through here, and do not retype it.
 *
 * Phrase-level theory conventions ("major 7th", "half-diminished") are
 * exempt the same way: they live in the catalogs as canonical strings
 * and simply are not routed through this function.
 */

/**
 * Words a title leaves lowercase unless they start it.
 *
 * Deliberately short. It exists so "want to learn" reads as "Want to
 * Learn" rather than "Want To Learn"; it is not a style guide, and
 * anything not listed is capitalised.
 */
const MINOR_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or',
  'the', 'to', 'with',
]);

/**
 * Separators that start a new title rather than continue one.
 *
 * A dash, colon or bracket opens a fresh clause, and its first word is
 * capitalised whatever it is — "Eb Minor Pentatonic — From b3", not
 * "— from b3". A space or a comma does not, so "Add from Want to Learn
 * List" keeps its small words small.
 */
const CLAUSE_BREAK = /[—–:;(){}[\]/|·→]/;

/**
 * Units and abbreviations that carry their own spelling.
 *
 * "+5 min" is not "+5 Min", and a metronome reads in `bpm`. Left
 * exactly as stored, so a site that already writes `dB` keeps it.
 */
const UNITS: ReadonlySet<string> = new Set([
  'bpm', 'min', 'mins', 'sec', 'secs', 'hr', 'hrs', 'ms', 'hz', 'khz', 'db', 'rpm',
]);

/** What continues a word rather than starting one. Digits and
 *  apostrophes are inside a word; punctuation and spaces are not.
 *  An apostrophe is NOT a word break, or `Ain't Nobody` comes out as
 *  `Ain'T Nobody`. */
const WORD_CHAR = /[\p{L}\p{N}'’]/u;

/**
 * An HTML entity — `&amp;`, `&rsquo;`, `&#8212;`.
 *
 * A label written in JSX carries these verbatim, and the letters inside
 * one are a spelling, not a word: `&amp;` capitalised is `&Amp;`, which
 * renders as literal text rather than as an ampersand.
 */
const ENTITY = String.raw`&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);`;

/**
 * Splits a label into entity, word and separator runs.
 *
 * The separator alternative refuses to swallow an `&` that opens an
 * entity, or "scales &amp; modes" would run the space and ampersand
 * together and leave `amp` looking like a word.
 */
const RUNS = new RegExp(
  `${ENTITY}|[\\p{L}\\p{N}'’]+|(?:(?!${ENTITY})[^\\p{L}\\p{N}'’])+`,
  'gu',
);

const IS_ENTITY = new RegExp(`^${ENTITY}$`, 'u');

/**
 * A degree led by its accidental — `b3`, `b2`, `bVII`, `#4`.
 *
 * Covers both spellings a degree takes: arabic (the scale-cell and
 * chord-motion form) and roman (the borrowed-chord form). No English
 * word puts a lowercase `b` in front of a digit or a capital, so
 * neither shape can be a real word start.
 */
function isAccidentalDegree(word: string): boolean {
  return /^[b#][\d\p{Lu}]/u.test(word);
}

/**
 * A roman numeral, in whichever case it was written.
 *
 * `vi` is a minor six and `VI` a major one, so the stored case is the
 * chord quality and capitalising it transposes the meaning. Matching
 * only `i`/`v`/`x` keeps this off English words — no word is built from
 * those three letters alone except "I", which is already capitalised
 * and so passes through unchanged either way.
 */
function isRomanNumeral(word: string): boolean {
  return /^[ivx]+$/i.test(word);
}

/** Capitalise one word, leaving its tail exactly as stored — `EQ` stays
 *  `EQ`, `7th` stays `7th`, `AI era` becomes `AI Era`. Lowercasing the
 *  tail is what a naive Title Case does, and it is wrong here. */
function capitalise(word: string): string {
  return word[0].toUpperCase() + word.slice(1);
}

/**
 * "voice-leading drills" → "Voice-Leading Drills".
 * "want to learn" → "Want to Learn".
 * "add from want to learn list" → "Add from Want to Learn List".
 * "clear override (use song default)" → "Clear Override (Use Song Default)".
 * "vi → 1 ascending" → "vi → 1 Ascending".
 * "+5 min" → "+5 min".
 *
 * Every word start is capitalised, including inside brackets and after
 * a hyphen or dash — a parenthetical cased half one way and half the
 * other reads as a mistake rather than as a rule. The first word of the
 * label, and of each clause a dash or bracket opens, is capitalised
 * whatever it is, unless it is notation or a unit.
 */
export function titleCase(label: string): string {
  const runs = label.match(RUNS);
  if (runs === null) return label;

  let leads = true;
  let afterSpace = false;
  let continues = false;

  return runs
    .map(run => {
      if (IS_ENTITY.test(run)) {
        // An entity sits INSIDE a word as often as between two —
        // `&rsquo;` is the apostrophe in "you&rsquo;re" — so whatever
        // follows it directly continues the word rather than starting
        // one, exactly as a typed apostrophe does.
        afterSpace = false;
        continues = true;
        return run;
      }
      if (!WORD_CHAR.test(run[0])) {
        afterSpace = /\s/.test(run);
        continues = false;
        if (CLAUSE_BREAK.test(run)) leads = true;
        return run;
      }
      if (continues) return run;
      const isFirst = leads;
      leads = false;

      // Notation and units keep the spelling they were given.
      if (isAccidentalDegree(run) || isRomanNumeral(run)) return run;
      if (UNITS.has(run.toLowerCase())) return run;

      // Minor words only duck between space-separated words. A hyphen
      // joins one word, so "check-in" stays "Check-In".
      if (!isFirst && afterSpace && MINOR_WORDS.has(run.toLowerCase())) {
        return run.toLowerCase();
      }
      return capitalise(run);
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

/**
 * The one label that appears on two unrelated surfaces.
 *
 * The module home's streak row and the song page both offer it, and
 * they typed the words separately — which is how one came to be
 * capitalised and the other not. Defined here rather than in either,
 * because neither owns it.
 */
export const VIEW_CALENDAR_LABEL = 'View Calendar';

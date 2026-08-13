// Lyric-sheet paste parser (Lyric Placement Redesign rev 3, Aug 2026 —
// docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §2.0b).
//
// Turns pasted lyric text into drawer rows, recognising the section
// headers people actually leave in copied lyric sheets so they render as
// dividers instead of becoming placeable lyric lines.
//
// This runs LIVE during staging — the drawer shows the parsed result
// while the text is still editable — so a wrong guess is visible before
// anything is committed, and one long-press flips a row's kind either
// way afterwards. That correction path is why the matcher can afford to
// be strict: a false negative costs one tap, and a false positive on a
// real lyric ("Bridge over troubled water" — more than one word, so it
// doesn't match) is worse than a miss.
//
// Headers are drawer-only grouping. They are deliberately NOT linked to
// lead-sheet sections: no name matching, no auto-placement.

export type LyricRowKind = 'lyric' | 'header';

export interface ParsedLyricRow {
  kind: LyricRowKind;
  /** For headers, the label with brackets and trailing punctuation
   *  stripped ("[Verse 1]" → "Verse 1") but the user's casing kept.
   *  For lyric rows, the trimmed source line verbatim. */
  text: string;
}

// Ordered longest-first so `pre-chorus` can't be shadowed by `chorus`.
// The matcher is fully anchored, so ordering is belt-and-braces.
const HEADER_WORDS = [
  'pre[-\\s]?chorus',
  'chorus',
  'verse',
  'refrain',
  'bridge',
  'intro',
  'outro',
  'tag',
  'vamp',
  // Added 13.15. Both were names the user expected to work and neither
  // did — they fell through to a placeable lyric line. `interlude` is
  // unambiguous; `hook` is a real English word and could in principle
  // appear as a one-word lyric line, which would then be read as a
  // header. That miss costs one tap on the row menu to flip back,
  // which is the trade the matcher already makes for `tag`, `vamp` and
  // `bridge`.
  'interlude',
  'hook',
  // Added 13.16. A real section type in gospel and R&B — a passage
  // with no lyrics — and NOT covered by intro or outro, since it can
  // sit anywhere in the song. Unambiguous as a one-word line: nobody
  // sings "instrumental".
  'instrumental',
];

// A header is one of the known words, optionally followed by a single
// number ("Verse 2"), roman numeral ("Verse II"), or letter ("Verse A"),
// with an optional separating dash. Anything with additional words is a
// lyric line.
const HEADER_RE = new RegExp(
  `^(?:${HEADER_WORDS.join('|')})(?:\\s*[-–—]?\\s*(?:\\d+|[ivxlc]+|[a-z]))?$`,
  'i',
);

/** Strip one layer of surrounding brackets/parens and any trailing
 *  colon or period, so "[Refrain]" and "Chorus:" both reduce to their
 *  bare label. */
function stripDecoration(line: string): string {
  let s = line.trim();
  const bracketed = s.match(/^\[(.*)\]$/) ?? s.match(/^\((.*)\)$/);
  if (bracketed) s = bracketed[1].trim();
  return s.replace(/[:.]+$/, '').trim();
}

/** True when a line reads as a section header on its own. */
export function isHeaderLine(line: string): boolean {
  const stripped = stripDecoration(line);
  if (stripped === '') return false;
  return HEADER_RE.test(stripped);
}

/**
 * Parse pasted lyric text into drawer rows, one per non-empty line.
 * Blank lines are dropped (they're paste formatting, not content).
 *
 * Pure and synchronous — the staging preview calls it on every
 * keystroke.
 */
export function parseLyricSheet(text: string): ParsedLyricRow[] {
  if (!text) return [];
  const rows: ParsedLyricRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (isHeaderLine(line)) {
      rows.push({ kind: 'header', text: stripDecoration(line) });
    } else {
      rows.push({ kind: 'lyric', text: line });
    }
  }
  return rows;
}

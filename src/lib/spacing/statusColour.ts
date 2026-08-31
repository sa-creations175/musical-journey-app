/**
 * What colour a status is, and how it is drawn. One source, for
 * everything.
 *
 * =====================================================================
 * THE AUDIT FOUND FOUR MEANINGS SHARING ONE PALETTE AND TWO RIVAL HEX
 * SETS FOR THE SAME FOUR WORDS.
 *
 * The six statuses, the four ratings and the song ladder were all drawn
 * from the same four Tailwind tokens by six different files, and
 * `bands.ts` carried a fifth, disagreeing set of its own. Mastered was
 * dark green on a grid and light blue one tap into it — the same cell,
 * the same word, two colours, on two surfaces you reach in one click.
 *
 * This is the one place a status has a colour. Tailwind keeps the base
 * hexes; nothing else names one.
 *
 * =====================================================================
 * MASTERED IS NOT A SECOND GREEN ANY MORE.
 *
 * Fluent and Mastered were mid green and dark green. On a grid of small
 * squares they are the hardest pair in the app to tell apart, which is
 * the whole reason the grids never felt readable. Mastered is a deep
 * royal blue now.
 *
 * Started moved to a LIGHT blue in the same breath, so the two blues
 * cannot be confused: one is a pale wash, the other is the darkest
 * thing on the grid, and they sit at opposite ends of the ladder.
 *
 * =====================================================================
 * THE RATINGS STAY ALIGNED TO THE STATUSES, DELIBERATELY.
 *
 *   Struggled → Needs Work    Clean   → Fluent
 *   Working on it → Developing  In flow → Mastered
 *
 * The audit put this first among the things that made nothing feel
 * settled, and it is kept anyway: the alignment is the point. What you
 * press and what you earn are the same ladder, so the colour you press
 * should be the colour you get. In flow becomes the royal blue with
 * Mastered, which also stops it colliding with Clean.
 *
 * The song ladder follows for the same reason — Cross-key keeps the
 * Fluent green, Internalized takes the royal blue.
 *
 * =====================================================================
 * ONE TREATMENT: SOLID FILL.
 *
 * The song matrix filled solid; the scales, shapes and voice-leading
 * grids filled at 15% with a coloured word. So one status word had two
 * weights depending on which screen you were on, and the pale one was
 * barely visible. Solid is also what the walked scales prototype uses.
 *
 * A status word looks the same wherever it appears. Only its size
 * changes.
 *
 * BADGES, PILLS AND BARS ARE STILL BADGES, PILLS AND BARS. This governs
 * the FILL of a status, not the shape of every component that mentions
 * one — a badge is a tinted pill with a border and a coloured word, and
 * flattening it into a tile would be a different change wearing this
 * one's clothes.
 *
 * =====================================================================
 * NOT IN HERE, AND LEFT ALONE ON PURPOSE.
 *
 * `FRESHNESS_DOT_CLASS` in `stage.ts` paints how recently you practised
 * in three of these colours, and the voice-leading heat grid shades the
 * Fluent green by hours invested. Both give a colour a second meaning
 * on top of the one it already has. Both are real problems and neither
 * is this one; they are Silas's to rule on separately, and tidying them
 * up on the way past would be deciding for him.
 * =====================================================================
 */

/**
 * The six status words, as colour keys.
 *
 * The same six the app says out loud — Not Started, Started, Needs
 * Work, Developing, Fluent, Mastered — spelled the way `AccuracyBand`
 * and `BandVerdict` already spell the four that overlap, so a caller
 * holding a verdict has no mapping table to write.
 *
 * THE WORDS ARE NOT HERE. `TIER_LABEL` owns those, and one source for
 * colour does not mean one source for everything: a file that held both
 * would be two answers to keep in step the first time either moved.
 */
export type StatusKey =
  | 'not-started' | 'started' | 'needs-work' | 'developing' | 'fluent' | 'mastered';

export const STATUS_KEYS: ReadonlyArray<StatusKey> = [
  'not-started', 'started', 'needs-work', 'developing', 'fluent', 'mastered',
];

export interface StatusColour {
  key: StatusKey;
  /**
   * The colour itself, or null for Not Started — which has no fill at
   * all, and says so with a dashed outline rather than with a grey that
   * reads as a colour that failed to load.
   *
   * FOR THE FEW PLACES THAT CANNOT TAKE A CLASS: an inline `style`
   * swatch, a canvas, a chart. Everywhere else uses the named
   * treatments below, so Tailwind's own token is what resolves.
   */
  hex: string | null;
  /**
   * SOLID FILL plus an ink that can be read on it. The grid square, the
   * matrix cell, the pressed rating chip — anything whose whole surface
   * IS the status.
   */
  fill: string;
  /** A tinted pill with a border and the coloured word. Badges stay
   *  badges. */
  badge: string;
  /** Just the fill, for a bar or a dot — no ink, because nothing is
   *  written on it. */
  bar: string;
  /** Just the fill, for a small square beside a word written in the
   *  ordinary ink. Same class as `bar`; named separately because a
   *  swatch and a bar are different questions and a shared name would
   *  hide the day one of them wants to differ. */
  swatch: string;
  /** The word, in its own colour, on the page's own background. */
  text: string;
  /** The outline-and-coloured-word state of a two-state control — an
   *  unpressed rating chip. Its pressed state is `fill`. */
  outline: string;
}

/**
 * THE INK ON A SOLID FILL.
 *
 * White on the four bands: they are dark enough for it, and one ink
 * keeps a row of tiles scanning as one thing rather than four.
 *
 * Started is the exception and has to be — it is a pale wash, and white
 * on it would be unreadable. It takes the page's darkest neutral rather
 * than a blue, because a dark blue word on a light blue tile would put
 * two of this palette's colours on one tile and invite the reader to
 * read the pairing as meaning something.
 */
const ON_FILL = 'text-white';
const ON_LIGHT_FILL = 'text-neutral-800';

/**
 * Not Started, drawn as the absence it is.
 *
 * A dashed border and a muted word: no fill, so nothing on the grid
 * claims it has been touched. This is the one status with a dark-mode
 * variant of its own, because it is drawn in NEUTRALS rather than in a
 * palette colour — see the note on dark mode at the foot of this file.
 */
const NOT_STARTED_FILL =
  'border border-dashed border-neutral-300 dark:border-neutral-600 '
  + 'text-neutral-400 dark:text-neutral-500';

const NOT_STARTED_BADGE =
  'bg-neutral-100/50 text-neutral-500 border-neutral-200 '
  + 'dark:bg-neutral-800/50 dark:border-neutral-700';

const STATUS_COLOURS: Readonly<Record<StatusKey, StatusColour>> = {
  'not-started': {
    key: 'not-started',
    hex: null,
    fill: NOT_STARTED_FILL,
    badge: NOT_STARTED_BADGE,
    bar: 'bg-neutral-200 dark:bg-neutral-700',
    swatch: 'bg-neutral-200 dark:bg-neutral-700',
    text: 'text-neutral-400',
    outline: NOT_STARTED_FILL,
  },
  'started': {
    key: 'started',
    hex: '#C7DDF5',
    fill: `bg-started ${ON_LIGHT_FILL}`,
    badge: 'bg-started/40 text-neutral-700 border-started dark:text-neutral-200',
    bar: 'bg-started',
    swatch: 'bg-started',
    // NOT `text-started` ON ITS OWN. The word would be a pale blue on a
    // white page and unreadable; a status that has to be legible as
    // TEXT borrows the page's ink and keeps its colour for the swatch
    // beside it.
    text: 'text-neutral-600 dark:text-neutral-300',
    outline: 'border-started text-neutral-700 dark:text-neutral-200 hover:bg-started/30',
  },
  'needs-work': {
    key: 'needs-work',
    hex: '#E24B4A',
    fill: `bg-needswork ${ON_FILL}`,
    badge: 'bg-needswork/10 text-needswork border-needswork/30',
    bar: 'bg-needswork',
    swatch: 'bg-needswork',
    text: 'text-needswork',
    outline: 'border-needswork/40 text-needswork hover:bg-needswork/10',
  },
  'developing': {
    key: 'developing',
    hex: '#EF9F27',
    fill: `bg-developing ${ON_FILL}`,
    badge: 'bg-developing/10 text-developing border-developing/30',
    bar: 'bg-developing',
    swatch: 'bg-developing',
    text: 'text-developing',
    outline: 'border-developing/40 text-developing hover:bg-developing/10',
  },
  'fluent': {
    key: 'fluent',
    hex: '#1D9E75',
    fill: `bg-fluent ${ON_FILL}`,
    badge: 'bg-fluent/10 text-fluent border-fluent/30',
    bar: 'bg-fluent',
    swatch: 'bg-fluent',
    text: 'text-fluent',
    outline: 'border-fluent/40 text-fluent hover:bg-fluent/10',
  },
  'mastered': {
    key: 'mastered',
    hex: '#2B4FA8',
    fill: `bg-mastered ${ON_FILL}`,
    badge: 'bg-mastered/10 text-mastered border-mastered/30',
    bar: 'bg-mastered',
    swatch: 'bg-mastered',
    text: 'text-mastered',
    outline: 'border-mastered/40 text-mastered hover:bg-mastered/10',
  },
};

export function statusColour(key: StatusKey): StatusColour {
  const found = STATUS_COLOURS[key];
  if (found === undefined) {
    throw new Error(`[statusColour] unknown status: ${key}`);
  }
  return found;
}

/**
 * The four ratings, as status keys.
 *
 * =====================================================================
 * THE ALIGNMENT IS THE POINT, AND IT IS WRITTEN DOWN HERE ONCE.
 *
 * Three files held a byte-identical copy of this mapping before — the
 * feel picker, the block rating options and the drill cards — so a
 * recoloured ramp was three edits and a fourth rating would have been
 * three more. What you press and what you earn are one ladder.
 * =====================================================================
 */
export const STATUS_FOR_FEEL: Readonly<Record<1 | 2 | 3 | 4, StatusKey>> = {
  1: 'needs-work',
  2: 'developing',
  3: 'fluent',
  4: 'mastered',
};

export function feelColour(feel: 1 | 2 | 3 | 4): StatusColour {
  return statusColour(STATUS_FOR_FEEL[feel]);
}

/**
 * =====================================================================
 * DARK MODE, AND WHY THERE IS NOT A SECOND PALETTE HERE.
 *
 * The four band colours have never had a dark variant: `bg-fluent` is
 * the same fill in both themes, and a solid fill is legible either way.
 * That has not changed, and inventing dark hexes for them would be
 * shipping a second palette rather than one source.
 *
 * What DOES carry a dark variant here is everything drawn in NEUTRALS —
 * Not Started's dashed outline, its badge, Started's ink — because a
 * neutral has to move with the page it sits on. Those had dark variants
 * before and keep them.
 *
 * TWO THINGS TO PROPOSE RATHER THAN SHIP, both in the report:
 * Started's pale `#C7DDF5` is a bright tile on a near-black page, and
 * `text-mastered` on that page is a weaker contrast than it is on
 * white. Neither is a regression — the first is new and the second was
 * worse in dark green — and neither is mine to answer with a hex.
 * =====================================================================
 */

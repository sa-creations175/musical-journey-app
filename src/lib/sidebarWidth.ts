/**
 * How wide the sidebar may be, and where those bounds come from.
 *
 * =====================================================================
 * BOTH BOUNDS ARE THE WIDTHS THAT ALREADY EXISTED.
 *
 * The sidebar has had two widths since it shipped: `md:w-60` open and
 * `md:w-14` as the collapsed rail. Dragging introduces no new number —
 * it moves between those two facts.
 *
 *   MAXIMUM is today's open width. The sidebar never gets WIDER than it
 *   is now; dragging can only reclaim space, never take more.
 *
 *   MINIMUM is twice the rail. It has to be comfortably wider than the
 *   rail so that dragging cannot imitate collapsing — the rail is a
 *   separate state, reached by the button, and two ways to arrive at
 *   the same-looking thing is two things the reader has to tell apart.
 *
 *   DEFAULT is the maximum, which is what the sidebar is today. Nobody
 *   picked a new starting width.
 * =====================================================================
 *
 * Expressed in Tailwind's own spacing unit rather than in pixels, so
 * these stay the classes they came from rather than becoming a second
 * measurement of them.
 */

/** Tailwind's spacing unit: `w-1` is `0.25rem`. */
const TAILWIND_UNIT_REM = 0.25;

/** `md:w-14` — the collapsed rail, still drawn by that class. */
export const SIDEBAR_RAIL_UNITS = 14;

/** `md:w-60` — the width the sidebar opens at, and its ceiling. */
export const SIDEBAR_FULL_UNITS = 60;

export const SIDEBAR_RAIL_REM = SIDEBAR_RAIL_UNITS * TAILWIND_UNIT_REM;

/** Never wider than it is today. */
export const SIDEBAR_MAX_REM = SIDEBAR_FULL_UNITS * TAILWIND_UNIT_REM;

/**
 * The floor: an icon column, and no narrower.
 *
 * The rail's own width, because the rail is exactly what an icon plus
 * its padding measures — there is nothing to show below it.
 */
export const SIDEBAR_MIN_REM = SIDEBAR_RAIL_REM;

// =====================================================================
// Where the labels give out
// =====================================================================

/**
 * =====================================================================
 * THE THRESHOLD COMES FROM THE LABELS, NOT FROM THE RAIL.
 *
 * It used to be twice the rail, on the reasoning that below that "a
 * wrapped label is one or two characters per line". That reasoning
 * never looked at the words. SONG REPERTOIRE, HARMONIC FLUENCY and
 * SHAPES & PATTERNS are far longer than the guess allowed, so there was
 * a whole band of widths — from twice the rail up to about eleven and a
 * half rem — where the sidebar claimed it could show words and visibly
 * could not: HARMON FLUENCY, SHAPES & PATTERN, SONG REPERTO.
 *
 * THE RULE NOW: labels appear only at widths where the longest WORD in
 * the nav still fits on its line. Below that it is the rail. There is
 * no width at which a word is cut.
 *
 * THE LONGEST WORD, NOT THE LONGEST LABEL. A label with a space in it
 * wraps, and a wrapped label is not a chopped one — text breaks at
 * spaces and after hyphens, so what can actually be clipped is a single
 * unbreakable run of characters. Whether WRAPPING should also be
 * forbidden is a separate question and is in the report, not here.
 *
 * IT MOVES WITH THE LABEL SET. `labelsMinRem` takes the labels; nothing
 * is written down. Rename a module to something longer tomorrow and the
 * threshold rises with it, so the sidebar goes to the rail earlier
 * rather than starting to chop the new name.
 * =====================================================================
 */

/** Which row a label sits on. Each has its own font and its own
 *  surrounding furniture — see `ROW_METRICS`. */
export type NavRowKind = 'group' | 'module' | 'plain-module' | 'sub' | 'nested';

export interface NavLabel {
  /** The label as written. Case is applied in CSS, so the width model
   *  reads `upper` rather than this string's case. */
  text: string;
  kind: NavRowKind;
}

/**
 * How wide one character is, as a fraction of the font size.
 *
 * ---------------------------------------------------------------
 * AN ESTIMATE, AND THE ONLY ONE IN HERE. There is no font metric
 * available at build time and no layout engine in a test, so the width
 * of a word is modelled rather than measured.
 *
 * CALIBRATED AGAINST A FACT THE APP ALREADY DEMONSTRATES: at the
 * sidebar's full width SONG REPERTOIRE fits on one line today. That
 * puts a ceiling on the uppercase figure; 0.64 sits just under it, so
 * the model is on the generous side of what the font actually draws
 * without contradicting what is on screen.
 *
 * GENEROUS ON PURPOSE. Being a little high costs a sliver of drag range
 * — the rail arrives a few pixels early. Being low costs a chopped
 * word, which is the bug.
 * ---------------------------------------------------------------
 */
const CHAR_WIDTH_EM = {
  /** Caps are wider, and every module name is drawn in them. */
  upper: 0.64,
  mixed: 0.55,
} as const;

/**
 * What sits beside a label on each kind of row, and what it is drawn
 * in. Every figure is the rem value of a class the sidebar actually
 * carries, listed so a padding change can be followed here.
 */
const ROW_METRICS: Readonly<Record<NavRowKind, {
  /** Everything on the row that is not the word: padding, indents, the
   *  icon, the disclosure mark. */
  chromeRem: number;
  fontRem: number;
  /** `tracking-wide` is 0.025em; rows without it are 0. */
  trackingEm: number;
  upper: boolean;
}>> = {
  // nav px-2 · group px-2 · the chevron and its gap
  group: { chromeRem: 0.5 * 2 + 0.5 * 2 + 0.5 + 0.375, fontRem: 0.625, trackingEm: 0.025, upper: true },
  // nav px-2 · group ml-2 pl-2 · row px-3 · icon + gap-2 · disclosure + ml-1
  module: {
    chromeRem: 0.5 * 2 + (0.5 + 0.5) + 0.75 * 2 + (1.25 + 0.5) + (0.5 + 0.25),
    fontRem: 0.875, trackingEm: 0.025, upper: true,
  },
  // Dashboard, Goals and Practice Sessions: same row, Title Case.
  'plain-module': {
    chromeRem: 0.5 * 2 + (0.5 + 0.5) + 0.75 * 2 + (1.25 + 0.5) + (0.5 + 0.25),
    fontRem: 0.875, trackingEm: 0, upper: false,
  },
  // nav px-2 · group ml-2 pl-2 · sub ml-3 pl-2 · row px-3 · mark + ml-1
  sub: {
    chromeRem: 0.5 * 2 + (0.5 + 0.5) + (0.75 + 0.5) + 0.75 * 2 + (0.4375 + 0.25),
    fontRem: 0.75, trackingEm: 0, upper: false,
  },
  // One level deeper again — nested ml-2 pl-2.
  nested: {
    chromeRem: 0.5 * 2 + (0.5 + 0.5) + (0.75 + 0.5) + (0.5 + 0.5) + 0.75 * 2 + (0.4375 + 0.25),
    fontRem: 0.75, trackingEm: 0, upper: false,
  },
};

/**
 * The longest unbreakable run in a label.
 *
 * Split on spaces AND after hyphens, because that is where a browser
 * breaks a line: "voice-leading drills" can come apart three ways, so
 * the longest thing that must fit is "leading".
 */
export function longestWord(text: string): string {
  return text
    .split(/[\s-]+/)
    .reduce((longest, word) => (word.length > longest.length ? word : longest), '');
}

/** How wide one label's longest word draws, in rem. */
function wordWidthRem(label: NavLabel): number {
  const metrics = ROW_METRICS[label.kind];
  const chars = longestWord(label.text).length;
  const perChar = CHAR_WIDTH_EM[metrics.upper ? 'upper' : 'mixed'] + metrics.trackingEm;
  return chars * perChar * metrics.fontRem;
}

/**
 * The narrowest width at which no label is cut.
 *
 * CAPPED AT THE SIDEBAR'S OWN MAXIMUM. If a name arrived that did not
 * fit even at full width, the honest answer would be that the sidebar
 * can never show labels — which is not a state to ship silently, so the
 * cap keeps today's behaviour at full width and a test fails instead.
 */
export function labelsMinRem(labels: readonly NavLabel[]): number {
  const widest = labels.reduce(
    (max, label) => Math.max(max, ROW_METRICS[label.kind].chromeRem + wordWidthRem(label)),
    SIDEBAR_MIN_REM,
  );
  return Math.min(widest, SIDEBAR_MAX_REM);
}

/**
 * Whether the sidebar can show words at this width.
 *
 * The same PRESENTATION as the collapsed rail, reached a different way:
 * the button switches state, this is a consequence of size. Dragging
 * back out restores the labels, because nothing was switched.
 *
 * TAKES THE LABELS rather than reading them, so this file stays free of
 * the nav's contents and a test can ask it about a label set that does
 * not exist yet.
 */
export function showsLabels(widthRem: number, labels: readonly NavLabel[]): boolean {
  return widthRem >= labelsMinRem(labels);
}

/** The width the sidebar has always opened at. */
export const SIDEBAR_DEFAULT_REM = SIDEBAR_MAX_REM;

/** The pref row holding the dragged width. */
export const SIDEBAR_WIDTH_PREF = 'sidebarWidthRem';

/**
 * A width made safe to use.
 *
 * ANYTHING UNUSABLE BECOMES THE DEFAULT — an absent row, a stored value
 * from a future shape, a NaN. Falling back to today's width means a bad
 * row costs the reader nothing and cannot produce a sidebar narrower
 * than the rail.
 */
export function clampSidebarWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SIDEBAR_DEFAULT_REM;
  return Math.min(SIDEBAR_MAX_REM, Math.max(SIDEBAR_MIN_REM, value));
}

/**
 * A stored width, made fit to open at.
 *
 * =====================================================================
 * THE STORED WIDTH IS ALWAYS ONE THAT CAN SHOW LABELS.
 *
 * A width narrower than the labels threshold is a transient drag
 * position, not a preference: the sidebar cannot honour it as an open
 * width — it draws the rail instead — so remembering it means opening
 * on the rail with no explanation, which is the trap `38b002f` had to
 * dig someone out of, one step removed.
 *
 * TWO SIDES, AND THEY ANSWER DIFFERENTLY.
 *
 *   WRITING: a drag that ends below the threshold writes nothing. The
 *   value already stored is by this rule a usable one, and it stays.
 *
 *   READING: this. A value that cannot show labels — one stored before
 *   this rule, or one left behind by a module being renamed to
 *   something longer — falls back to the width the sidebar opens at,
 *   because there is nothing better to fall back to.
 *
 * Everything unusable for the older reasons still lands on the default
 * too: `clampSidebarWidth` handles an absent row, a NaN, a value from a
 * future shape.
 * =====================================================================
 */
export function usableStoredWidth(value: unknown, labels: readonly NavLabel[]): number {
  const clamped = clampSidebarWidth(value);
  return showsLabels(clamped, labels) ? clamped : SIDEBAR_DEFAULT_REM;
}

/** Pixels per rem, read from the document rather than assumed to be 16. */
export function rootFontSizePx(): number {
  if (typeof window === 'undefined') return 16;
  const size = parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 * The two global scales: what a score is CALLED, and how long ago you
 * touched it. Neither is settable per module, and that is the point.
 *
 * =====================================================================
 * THESE ARE NOT THE PROFICIENCY LEVELS, AND THEY MUST NOT BECOME THEM.
 *
 * The app already has a five-step proficiency vocabulary — Learning →
 * Comfortable → Internalized → Cross-key → Maintenance — which says
 * where a SKILL sits overall, is user-declared or stage-derived, and
 * moves slowly. These four bands say how a CARD is scoring right now,
 * are computed from recent accuracy alone, and move every session.
 *
 * One is a place you have reached; the other is a temperature reading.
 * Collapsing them would make a bad day look like a demotion.
 * =====================================================================
 */

/** The four accuracy bands, worst to best. */
export type AccuracyBand = 'needs-work' | 'developing' | 'fluent' | 'mastered';

export interface AccuracyBandDef {
  id: AccuracyBand;
  label: string;
  /** Inclusive lower bound, in whole percent. */
  minPercent: number;
  /** Inclusive upper bound, in whole percent. */
  maxPercent: number;
  /** From the spec's palette. Shared by every module — a band means
   *  the same thing everywhere, so it cannot take a module accent. */
  hex: string;
}

/**
 * Worst to best, and ordered so a UI can render them without sorting.
 * Bounds are whole percent and INCLUSIVE at both ends: 79 is
 * Developing, 80 is Fluent, and there is no gap between them for a
 * value to fall down.
 */
export const ACCURACY_BANDS: ReadonlyArray<AccuracyBandDef> = [
  { id: 'needs-work', label: 'Needs work', minPercent: 0,  maxPercent: 59,  hex: '#e07a5f' },
  { id: 'developing', label: 'Developing', minPercent: 60, maxPercent: 79,  hex: '#e0a458' },
  { id: 'fluent',     label: 'Fluent',     minPercent: 80, maxPercent: 94,  hex: '#7dd3a0' },
  { id: 'mastered',   label: 'Mastered',   minPercent: 95, maxPercent: 100, hex: '#6fb3e0' },
];

const BY_ID = new Map(ACCURACY_BANDS.map(b => [b.id, b]));

export function accuracyBandDef(id: AccuracyBand): AccuracyBandDef {
  const def = BY_ID.get(id);
  if (def === undefined) throw new Error(`[spacing] unknown accuracy band: ${id}`);
  return def;
}

/**
 * Which band a percentage falls in.
 *
 * Takes WHOLE PERCENT, not a fraction. The bands are written in
 * percent in the spec and shown in percent on screen, and a function
 * that silently accepted both would put 0.95 — meaning 95% — in the
 * bottom band on the day someone forgot which it wanted.
 *
 * Out-of-range values clamp rather than throw: a caller computing
 * 100.0000001 from floating-point division has not made a mistake
 * worth crashing a drill over.
 */
export function bandForAccuracyPercent(percent: number): AccuracyBand {
  if (!Number.isFinite(percent)) return 'needs-work';
  const p = Math.max(0, Math.min(100, percent));
  for (const band of ACCURACY_BANDS) {
    if (p >= band.minPercent && p <= band.maxPercent) return band.id;
  }
  // Unreachable while the table covers 0–100 with no gaps; the bands
  // are data, so this stays as the honest answer if someone edits them.
  return 'needs-work';
}

// =====================================================================
// Freshness
// =====================================================================

/**
 * How recently something was touched, in sixths.
 *
 * =====================================================================
 * FRESHNESS IS NOT A RATING AND NEVER TOUCHES ONE.
 *
 * It says one thing: how long since you last answered this. It does
 * not change a band, does not change a colour, and does not feed the
 * schedule. A card can be Mastered and nearly empty on this line —
 * that combination is not a contradiction, it is the whole reason the
 * line exists separately.
 * =====================================================================
 */
export interface FreshnessRung {
  /** Inclusive upper bound in whole days since the last answer. */
  maxDaysAgo: number;
  /** Numerator over six. */
  sixths: number;
  label: string;
}

export const FRESHNESS_LADDER: ReadonlyArray<FreshnessRung> = [
  { maxDaysAgo: 0,  sixths: 6, label: 'Today' },
  { maxDaysAgo: 7,  sixths: 5, label: 'Within 1 week' },
  { maxDaysAgo: 14, sixths: 4, label: 'Within 2 weeks' },
  { maxDaysAgo: 21, sixths: 3, label: 'Within 3 weeks' },
  { maxDaysAgo: 28, sixths: 2, label: 'Within 4 weeks' },
  { maxDaysAgo: Infinity, sixths: 1, label: 'Over 4 weeks · 29+' },
];

/** The freshness numerator (1–6) for a gap in whole days. */
export function freshnessSixths(daysSinceLastAnswer: number): number {
  const days = Math.max(0, Math.floor(daysSinceLastAnswer));
  for (const rung of FRESHNESS_LADDER) {
    if (days <= rung.maxDaysAgo) return rung.sixths;
  }
  // The ladder ends at Infinity, so this cannot be reached.
  return 1;
}

/**
 * Never touched at all reads as the emptiest rung, not as an error and
 * not as fresh. A card you have never answered is maximally stale by
 * the only measure this scale has.
 */
export function freshnessSixthsFor(
  lastEngagedAt: number | null,
  now: number,
): number {
  if (lastEngagedAt === null) return 1;
  return freshnessSixths((now - lastEngagedAt) / (24 * 60 * 60 * 1000));
}

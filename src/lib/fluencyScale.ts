/**
 * The four-step fluency scale — one definition, for every surface that
 * asks "how did that go?".
 *
 * ---------------------------------------------------------------
 * WHY ORDINAL 1–4 IS STORED, NOT THE 25/75/100 VALUE
 *
 * The dashboard design specifies values (25 / 50 / 75 / 100) because it
 * averages them into a fluency number where other modules show
 * accuracy. But the value is a PROJECTION, not the datum: storing 75
 * would make `feelRating >= 3` — the shape every existing consumer is
 * written in — unreadable, and it invites arithmetic on a scale that is
 * ordinal in reality. "In flow" is not four times "struggled".
 *
 * So the ordinal is stored and `fluencyValue()` projects. One mapping,
 * one place, and existing comparisons keep meaning what they meant.
 * ---------------------------------------------------------------
 *
 * REPLACES two vocabularies:
 *
 *   · Repertoire's 1–5, which carried a fifth step, "breakthrough".
 *     Dropped deliberately — a breakthrough is an event, not a level;
 *     you can have one while struggling. See `normaliseFeel` for what
 *     happens to rows that already hold a 5.
 *
 *   · flying / cruising / crawling, which `songCellRunThroughs.rating`
 *     stores and nothing reads.
 *
 * NOT yet adopted by `sessionTimer/blockRatingOptions.ts`, which holds
 * its own 1–4 with the same shape but labels step 3 "Clean" rather than
 * "Comfortable". Unifying that belongs to the dashboard build, which
 * changes the drill buttons across S&P and Production at the same time.
 * Kept separate here so a logging change does not quietly restyle the
 * session-block rating screen.
 */

/** Stored value. Ordinal, ascending. */
export type Feel = 1 | 2 | 3 | 4;

export interface FeelOption {
  feel: Feel;
  label: string;
  /** 0–100 projection, for surfaces that show a fluency number. */
  value: number;
}

export const FEEL_OPTIONS: ReadonlyArray<FeelOption> = [
  { feel: 1, label: 'struggled',     value: 25 },
  { feel: 2, label: 'working on it', value: 50 },
  { feel: 3, label: 'comfortable',   value: 75 },
  { feel: 4, label: 'in flow',       value: 100 },
];

const BY_FEEL = new Map<Feel, FeelOption>(FEEL_OPTIONS.map(o => [o.feel, o]));

/** 0–100 for a stored feel. */
export function fluencyValue(feel: Feel): number {
  return BY_FEEL.get(feel)?.value ?? 0;
}

export function feelLabel(feel: Feel): string {
  return BY_FEEL.get(feel)?.label ?? String(feel);
}

/**
 * Coerce a stored value onto the current scale.
 *
 * Rows written before the fifth step was dropped hold `5`
 * ("breakthrough"). Those collapse to `4` — a breakthrough session was
 * at minimum in flow, so this narrows a category rather than inventing
 * a rating. Nothing is promoted and nothing is invented.
 *
 * Out-of-range and non-integer values clamp into 1–4 rather than
 * throwing: this runs over historical rows on a read path, and a
 * corrupt value should degrade one row, not blank a whole card.
 */
export function normaliseFeel(raw: number | null | undefined): Feel | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded >= 4) return 4;
  if (rounded <= 1) return 1;
  return rounded as Feel;
}

/**
 * Threshold for "consistently better than comfortable", used by the
 * Comfortable → Internalized suggestion in repertoire/stage.ts.
 *
 * ---------------------------------------------------------------
 * WHY 3.5, AND WHY THIS NUMBER HAD TO MOVE
 *
 * The rule was `avgFeel >= 4` over the last five sessions, on the 1–5
 * scale. A 4 was "in flow" and a 5 "breakthrough", so the average could
 * clear 4 with a mix — some 5s pulling some 3s up.
 *
 * Dropping the fifth step makes 4 the MAXIMUM. Keeping the old literal
 * would silently require all five sessions to be perfect 4s, so the
 * suggestion would have all but stopped firing — the failure mode being
 * that nothing appears to break, a promotion prompt just never shows up
 * again.
 *
 * 3.5 reads as "more often in flow than not": the midpoint between
 * comfortable and in flow. The arithmetically equivalent choice was 3.2
 * (80% of max, matching 4-of-5 on the old scale), but that number means
 * nothing to anyone reading it, and the bar it preserves was itself a
 * side effect of the fifth step existing.
 * ---------------------------------------------------------------
 */
export const CONSISTENTLY_FLUENT_AVG = 3.5;

/**
 * Inversion-state labels.
 *
 * These are the words a player meets on a chord-shape row, in the
 * breakdown panel and on the dashboard. The property worth pinning is
 * not any single string but the one they share: **each names WHAT YOU
 * PLAY, not how you practise it.**
 *
 * `supplementary` broke that rule until 20 Aug 2026, when it read
 * "Two-handed drills". The wording framed the row as a practice tool,
 * which is exactly the framing reversed when supplementary rows started
 * gating acquisition — so the one place a reader meets the row was
 * still arguing the old decision.
 */
import { describe, expect, it } from 'vitest';
import type { InversionState } from '../../../lib/db';
import {
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  inversionStateLabel,
} from '../catalog';

/** Every state any quality kind can carry, deduped. Read off the
 *  catalog so a new state cannot be added without a label. */
const ALL_STATES: InversionState[] = [...new Set(
  Object.values(INVERSION_STATES_FOR_CHORD_SHAPE_KIND)
    .flat()
    .filter((s): s is InversionState => s !== null),
)];

describe('inversionStateLabel', () => {
  it('names every state a quality can carry', () => {
    // Guard the guard: an empty state list would pass the loop below
    // without asserting anything.
    expect(ALL_STATES.length).toBeGreaterThanOrEqual(6);
    for (const state of ALL_STATES) {
      expect(inversionStateLabel(state), state).toBeTruthy();
    }
  });

  it('names what you PLAY, never how you practise it', () => {
    // THE RULE THIS FILE EXISTS FOR. "Root position", "1st inversion"
    // and the rest are all voicings. A label describing an exercise
    // would put one row in a different category from its five
    // siblings, on the row where a reader meets it.
    for (const state of ALL_STATES) {
      expect(inversionStateLabel(state).toLowerCase(), state)
        .not.toMatch(/\b(drill|drills|exercise|practice|practise)\b/);
    }
  });

  it('calls the two-handed row a voicing', () => {
    expect(inversionStateLabel('supplementary')).toBe('Two-handed voicing');
  });

  it('returns an empty string for absent states, so callers can join', () => {
    // Extensions and special/sixth carry `null` — they ARE a voicing,
    // so there is no inversion to name.
    expect(inversionStateLabel(null)).toBe('');
    expect(inversionStateLabel(undefined)).toBe('');
  });
});

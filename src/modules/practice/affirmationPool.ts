/**
 * Phase 3 Step 4h — Affirmation pool helpers.
 *
 * The user's affirmation pool is built up at session-end (Step 6d
 * collects "I am... or I can..." text into practiceSessions.affirmation).
 * The proposal screen surfaces a randomly-picked one above the
 * "Start this session" button as a personal note carried forward.
 *
 * 4h provides the random-pick helper + the AffirmationSurface
 * component. The actual Dexie read of past affirmations happens at
 * integration time (Step 5+) — these helpers are pure.
 */

/**
 * Pick a random affirmation from the pool. Returns null when the
 * pool is empty so the AffirmationSurface knows to render nothing.
 *
 * Pure: depends on the supplied pool + the rng. Defaults to
 * Math.random; tests pass an injected rng.
 */
export function pickRandomAffirmation(
  pool: ReadonlyArray<string>,
  rng: () => number = Math.random,
): string | null {
  if (pool.length === 0) return null;
  const idx = Math.floor(rng() * pool.length);
  // Clamp defensively — `rng() === 1` is technically possible.
  return pool[Math.min(idx, pool.length - 1)];
}

/**
 * Strip empty / whitespace-only entries from a raw affirmation list.
 * Useful when reading from a column that allows empty strings —
 * ensures the random pick never lands on a blank.
 */
export function cleanAffirmationPool(
  pool: ReadonlyArray<string | null | undefined>,
): readonly string[] {
  const out: string[] = [];
  for (const a of pool) {
    if (typeof a === 'string' && a.trim().length > 0) out.push(a.trim());
  }
  return out;
}

/**
 * Chord progression stage classification — drives the ET tier
 * progression system (Stage 1 → 4). Each progression in
 * `catalog.ts` is tagged with its stage via this map; the
 * `mk()` helper in catalog.ts reads the lookup so the catalog
 * itself stays focused on musical metadata.
 *
 * Stage assignments (per the ET tier-progression spec):
 *
 *   Stage 1 — Key detection. Bare diatonic loops in major,
 *             1- or 2-chord vamps. Best for "what key is this in?"
 *             drills.
 *
 *   Stage 2 — Chord motion within a key + short diatonic sequences
 *             (2–4 chords, all diatonic). Turnarounds + walkups +
 *             diatonic motion without borrowed harmony.
 *
 *   Stage 3 — Common named patterns (ii-V-I, blues forms,
 *             turnarounds, named worship/neo-soul patterns) AND
 *             modal progressions rooted in a specific mode. Combined
 *             into one unlock level.
 *
 *   Stage 4 — Complex progressions: borrowed chords, secondary
 *             dominants, modal interchange, jazz standards with
 *             key changes, altered dominants, named cadences with
 *             non-diatonic motion.
 *
 * =====================================================================
 * THE MAP IS EIGHT LINES BECAUSE THE CATALOG IS EIGHT ENTRIES.
 *
 * It classified sixty-nine progressions, a dozen of them flagged
 * REVIEW because the call was genuinely ambiguous. The catalog was cut
 * to the eight survivors on 9 Sep 2026 and the ambiguous ones went
 * with it, so what is left is eight assignments and no open questions.
 *
 * The stages are thin at the top: stage 3 is `2-5-1` alone and stage 4
 * is `backdoor` alone. That is accepted, and the unlock walk handles
 * a one-item stage without any special case. It also handles an EMPTY
 * one, which matters more: a stage with nothing in it counts as
 * cleared rather than as a wall, so a later cut cannot make every
 * stage above it unreachable.
 * =====================================================================
 */

export type ProgressionStage = 1 | 2 | 3 | 4;

export const MAX_PROGRESSION_STAGE: ProgressionStage = 4;

/** Canonical iteration order: progressions surface inside a stage
 *  in catalog declaration order (the order they appear in
 *  `PROGRESSIONS`). The order within `PROGRESSION_STAGE` only
 *  affects readability — `itemsForStage` re-derives by scanning
 *  the catalog so the staged-introduction batch is deterministic
 *  per the catalog's declared order. */
export const PROGRESSION_STAGE: Readonly<Record<string, ProgressionStage>> = {
  // ===== Stage 1 — bare diatonic / 1-2 chord vamps =====
  '1-4-5':   1,  // I-IV-V-I, archetypal cadence
  '1-5-6-4': 1,  // I-V-vi-IV, basic pop loop
  '1-6-4-5': 1,  // 50s doo-wop, basic diatonic
  '6-4-1-5': 1,  // the same loop entered on the relative minor

  // ===== Stage 2 — diatonic motion / short diatonic sequences =====
  '1-6-2-5': 2,  // diatonic turnaround
  '4-1-5-6': 2,  // the same loop entered on the 4

  // ===== Stage 3 — named patterns =====
  '2-5-1':   3,  // THE named ii-V-I

  // ===== Stage 4 — complex / borrowed / secondary / altered =====
  'backdoor': 4,  // backdoor cadence (bVII-I borrowed)
};

/** True iff `id` is in the stage map. Useful for the catalog's
 *  `mk()` helper to defend against missing classifications. */
export function hasProgressionStage(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROGRESSION_STAGE, id);
}

/** Stage lookup with a defensive default. Returns `4` (most-locked)
 *  for unknown ids so an accidentally-untagged progression doesn't
 *  silently fall into Stage 1's always-eligible bucket. */
export function stageForProgression(id: string): ProgressionStage {
  return PROGRESSION_STAGE[id] ?? 4;
}

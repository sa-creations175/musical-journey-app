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
 *             into one unlock level (sub-grouping noted below).
 *
 *   Stage 4 — Complex progressions: borrowed chords, secondary
 *             dominants, modal interchange, jazz standards with
 *             key changes, altered dominants, named cadences with
 *             non-diatonic motion.
 *
 * Items flagged REVIEW carry musical ambiguity — the assignment is
 * a best-effort call. Review with Silas before treating as final.
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
  '1-4-5':                 1,  // I-IV-V-I, archetypal cadence
  '1-5-6-4':               1,  // I-V-vi-IV, basic pop loop
  '1-6-4-5':               1,  // 50s doo-wop, basic diatonic
  '6-4-1-5':               1,  // diatonic loop (relative minor lead)
  '1-4-vamp':              1,  // I-IV plagal vamp (2 chords)
  '1-5-4':                 1,  // I-V-IV basic
  'plagal-vamp':           1,  // I-IV plagal (2 chords)
  'reggae-1-chord':        1,  // 1-chord vamp
  'afrobeat-1-chord':      1,  // 1-chord vamp

  // ===== Stage 2 — diatonic motion / short diatonic sequences =====
  '1-6-2-5':               2,  // diatonic turnaround
  'gospel-walk-up':        2,  // diatonic chord motion
  'gospel-walk-down':      2,  // diatonic chord motion
  '4-5-3-6':               2,  // diatonic motion
  '1-3-4':                 2,  // diatonic with iii
  '6-4-5':                 2,  // minor-feel diatonic
  '4-1-5-6':               2,  // diatonic
  '4-5-6':                 2,  // diatonic motion
  '6-5-4-5':               2,  // diatonic descending
  '1-3-6-4':               2,  // diatonic with iii
  '2-1-slip':              2,  // 2-chord ii-I diatonic resolution
  'frank-ocean-lift':      2,  // IV-iii-ii-I descending diatonic
  'miguel-sensual':        2,  // I-iii-IV diatonic
  'soul-blues-6-5-1':      2,  // vi-V-I basic
  'funk-1-chord':          2,  /* REVIEW — 1-chord with dom7 sound; could be Stage 1 since 1 chord, but the dominant quality + funk groove asks for slightly more ear sophistication */
  'funk-2-chord':          2,  /* REVIEW — typically dominant vamps; similar reasoning */
  'minor-2-chord-loop':    2,  // simple 2-chord minor loop
  '6-4-5-minor-loop':      2,  // diatonic minor loop

  // ===== Stage 3 — named patterns / modal progressions =====
  '2-5-1':                 3,  // THE named ii-V-I
  '12-bar-blues':          3,  // named blues form
  '6-2-5-1':               3,  // extended ii-V-I (named jazz cycle)
  'mariah-rnb-turnaround': 3,  // named turnaround
  '2-5-1-6':               3,  // extended named ii-V-I
  'descending-bass':       3,  // named descending-bass pattern
  'pj-morton-turnaround':  3,  // named artist turnaround
  'descending-bass-ballad':3,  // named descending-bass variant
  'pop-pedal':             3,  // named pedal-point pattern
  'worship-lift':          3,  /* REVIEW — uses I/3 slash; named worship pattern but built on diatonic motion (could be Stage 2) */
  'smooth-bass-line':      3,  // named pattern with inversions / slash chords
  'gospel-walk-down-slash':3,  // named pattern with slash chords
  '2-5-1-cycle':           3,  // named jazz ii-V-I cycle
  'modal-dorian-cycle':    3,  // modal (3b sub-group)
  'neo-soul-cycle':        3,  // I-iii-vi-IV named neo-soul
  'glasper-cycle':         3,  // vi-iii-I-IV named pattern
  'dorian-rnb-vamp':       3,  // modal (Dorian, 3b sub-group)
  'neo-soul-descent':      3,  // uses viiø half-dim; named pattern
  'floating-lydian':       3,  // modal (Lydian, 3b sub-group)
  'her-ballad':            3,  // I-vi-ii-V (classic ii-V turnaround named)
  '8-bar-blues':           3,  // named blues form
  'slow-blues-turnaround': 3,  // named blues turnaround
  'samba-cycle':           3,  // named Latin pattern
  'bossa-nova-standard':   3,  /* REVIEW — bossa nova traditionally uses extended jazz harmony (could be Stage 4) */
  'sampled-jazz-cycle':    3,  // named sampled-jazz pattern
  'soul-sample-loop':      3,  // named pattern
  'j-cole-progression':    3,  // named artist pattern
  'kendrick-modal':        3,  // named modal pattern
  'drake-sad-loop':        3,  // named pattern

  // ===== Stage 4 — complex / borrowed / secondary / altered =====
  'backdoor':              4,  // backdoor cadence (bVII7-I borrowed)
  'gospel-1-b3-4':         4,  // borrowed bIII
  '1-b7-4':                4,  // borrowed bVII (modal interchange)
  '1-5-b7-4':              4,  // borrowed bVII
  'rhythm-changes-a':      4,  // jazz form with secondary dominants
  '3-6-2-5-1':             4,  // extended jazz cycle (typically with sec. doms)
  'autumn-leaves-opening': 4,  // jazz standard with relative-major/minor pivot
  'minor-jazz-turnaround': 4,  // minor jazz w/ V7b9 → i
  'coltrane-changes':      4,  // complex jazz key-cycling
  '1-b7-modal':            4,  // modal interchange (theory note confirms)
  'leon-thomas-groove':    4,  // borrowed bVII + iv (theory note confirms)
  'jazz-blues-12':         4,  // all-dominant jazz blues
  'andalusian-cadence':    4,  // Phrygian-flavored named cadence
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

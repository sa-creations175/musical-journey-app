/**
 * Where the four options appear on screen.
 *
 * =====================================================================
 * WHY THIS IS A FILE AND NOT A `useMemo`.
 *
 * This was six lines inside `FlashcardSession`, and being inside a
 * component is why nothing ever measured it. The deck leak guard has
 * eight rules and every one of them reads the CATALOG — `[correct,
 * ...decoys]` — so all eight were structurally incapable of seeing a
 * defect in the render order. The order was not unexamined by
 * oversight; it was unreachable.
 *
 * A pure function is the whole point. The guard can call it, a test can
 * call it, and the property it has to hold — the answer lands in each
 * of the four slots a quarter of the time — becomes something you can
 * assert rather than something you have to trust.
 * =====================================================================
 *
 * WHAT WAS WRONG WITH THE OLD ONE.
 *
 * It sorted the four options by `(firstCharCode + cardHash) % 97`. Two
 * separate faults, and the second is the one that did the damage:
 *
 *   1. The key reads ONE character. "A Dorian", "A Locrian", "A
 *      Phrygian" and "A Aeolian" all key on 'A', so all four compare
 *      equal.
 *   2. `Array.prototype.sort` is STABLE, so equal keys keep their input
 *      order — and the input order is `[correctAnswer, ...decoys]`.
 *
 * Every tie therefore resolved to "the answer first". Measured over the
 * 649-card harmonic-fluency deck the answer sat at index 0 on 52.5% of
 * cards against a 25% baseline, and in the categories whose options
 * share a leading character it was near-total: progressions 92.3%,
 * slash-chords 88.3%, modes 82.7%. Production Vocabulary, which renders
 * through the same shell, measured 52.8%.
 *
 * A reader who always taps the first option scores half the deck
 * without reading a question, SM-2 pushes those intervals out, and the
 * tracker reports fluency that was never demonstrated.
 */

/**
 * FNV-1a, returned unsigned.
 *
 * DELIBERATELY A SECOND COPY of the hash in `decoyGuard.rotate`, which
 * is the one thing here that looks like an oversight and is not.
 * `rotate` folds to a SIGNED int32 and takes `Math.abs`; matching it
 * would be tidier, and unifying them would re-roll every decoy in the
 * deck — every pinned count in the leak guard is a fact about the
 * output of that exact arithmetic. The duplication costs six lines. The
 * merge costs a re-measurement of two allowlists.
 *
 * If they are ever unified, expect the deck to change and re-measure
 * both allowlists in the same commit.
 */
function fnv1a(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — a small, fast, well-distributed 32-bit PRNG. */
function mulberry32(state: number): () => number {
  let a = state;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates, driven by a PRNG seeded from `seed`.
 *
 * =====================================================================
 * FISHER–YATES RATHER THAN A ROTATION, AND THE REASON IS THE POINT.
 *
 * A seeded rotation would also have fixed the position: rotate
 * `[correct, ...decoys]` by a per-card offset and the answer lands
 * uniformly across the four slots. It is three lines and it makes the
 * headline number right.
 *
 * It also leaves a pattern behind. A rotation reaches only 4 of the 24
 * orderings, and the three decoys keep a FIXED RELATIVE ORDER on every
 * card, forever — decoy A always somewhere before decoy B, wrapping as
 * a block. That is precisely the kind of structure this deck has spent
 * its history removing: not something a reader could state, but
 * something a reader could absorb over a few hundred reps without ever
 * noticing they had.
 *
 * Fisher–Yates reaches all 24 with equal probability. Same seed, same
 * determinism, no `Math.random()` — and nothing left to learn.
 * =====================================================================
 *
 * Deterministic by construction: the same `seed` always yields the same
 * permutation, which is what lets "Previous" show a card exactly as it
 * was and what lets a pinned measurement mean anything.
 */
export function shuffleSeeded<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rnd = mulberry32(fnv1a(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * The four options in the order they are RENDERED.
 *
 * The single source of that order. `FlashcardSession` calls it to draw
 * the buttons and the leak guard calls it to check them, so the guard
 * cannot drift out of agreement with the screen — which is exactly how
 * eight rules came to be checking an order nobody ever saw.
 *
 * Seeded on the card id, so it is stable across a re-render, a
 * "Previous", and a reload.
 */
export function renderedOptions(
  id: string,
  correctAnswer: string,
  decoys: readonly string[],
): string[] {
  return shuffleSeeded([correctAnswer, ...decoys], id);
}

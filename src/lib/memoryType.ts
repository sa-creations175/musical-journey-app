import type { MemoryType } from './db';

/**
 * Memory type per learning module. Each kind of musical knowledge
 * consolidates differently, which drives how Practice Sessions
 * spaces, sequences, and rates engagements with items in that
 * module:
 *
 *   - declarative   conceptual / fact-based; objective accuracy.
 *                   Pure spaced repetition with expanding intervals.
 *   - procedural    physical skill / muscle memory; subjective
 *                   rating. Spaced repetition with a minimum
 *                   acquisition density before intervals expand.
 *   - integration   multi-skill synthesis under real-world
 *                   conditions; subjective rating + stage progression.
 *                   Longer minimum block durations.
 *   - expression    creative output; recency-driven, no correctness.
 *                   Surface when stale; rated playfully (Flying /
 *                   Cruising / Crawling).
 *
 * Phase 1 doesn't yet consume this — spacing state populates in
 * Phase 2 and the session generator runs in Phase 3. The function
 * exists here as the canonical source so those phases pull from a
 * single mapping instead of re-deriving it.
 *
 * Granularity matches the existing `attempts.moduleId` convention
 * (kebab-case, single-segment refs). Shapes & Patterns is one row
 * covering all four sub-areas (Scale Drills, Chord Shape Drills,
 * Voice-Leading, Mental Visualization) because attempts.moduleId
 * is at that granularity and Phase 3 will refer to items via the
 * same identifier. If a sub-area ever needs a different memory
 * type (none planned), split that row then.
 *
 * `glossary` is included even though no current call site emits it.
 * The roadmap's Production Vocabulary flashcard deck (DESIGN_DECISIONS
 * §"Production module v2+") would reify glossary terms into
 * trackable items carrying this ref; including it now keeps the
 * mapping aligned with planned work.
 *
 * `just-play` / `just-produce` / `harmonic-diary` are expression-
 * tagged. Just Play and Just Produce are the two modes of the
 * Creative Sessions module (creativeSessions.mode). Harmonic Diary
 * engagements are recency-driven by design.
 */
export const MODULE_MEMORY_TYPES: Readonly<Record<string, MemoryType>> = Object.freeze({
  // Declarative — theoretical / fact-based knowledge.
  'harmonic-fluency':    'declarative',
  'intervals':           'declarative',
  'chord-recognition':   'declarative',
  'chord-progressions':  'declarative',
  'scales-modes':        'declarative',
  'glossary':            'declarative',
  // Mental-visualisation chord library — recall of chord shapes /
  // voicings away from the keyboard, SM-2 + accuracy tracked. Distinct
  // moduleRef from 'shapes-and-patterns' so its rows never count toward
  // keyboard S&P coverage or blocks.
  'mental-viz':          'declarative',

  // Procedural — physical skill / muscle memory.
  // Single row covering all four Shapes & Patterns sub-areas
  // (Scale Drills, Chord Shape Drills, Voice-Leading,
  // Mental Visualization).
  'shapes-and-patterns': 'procedural',

  // Integration — multi-skill synthesis under real-world conditions.
  'repertoire':          'integration',
  'production':          'integration',

  // Expression — creative output, recency-driven, no correctness.
  'just-play':           'expression',
  'just-produce':        'expression',
  'harmonic-diary':      'expression',
});

/**
 * Return the memory type for a given module reference.
 *
 * Throws when `moduleRef` isn't in the canonical set. A moduleRef
 * reaching this function should come from the app's fixed module
 * registry; an unknown ref is a programming error (typo, stale
 * value, missing case after adding a new module). Failing fast
 * surfaces the bug immediately rather than letting a wrong default
 * propagate into spacing state and the session generator.
 *
 * If a future caller genuinely needs a tolerant fallback, it can
 * catch the error or use `MODULE_MEMORY_TYPES[ref]` directly with
 * its own undefined check.
 */
export function getMemoryType(moduleRef: string): MemoryType {
  const t = MODULE_MEMORY_TYPES[moduleRef];
  if (t === undefined) {
    throw new Error(
      `[memoryType] unknown moduleRef: ${JSON.stringify(moduleRef)}. ` +
      `Add it to MODULE_MEMORY_TYPES in src/lib/memoryType.ts or ` +
      `correct the caller.`,
    );
  }
  return t;
}

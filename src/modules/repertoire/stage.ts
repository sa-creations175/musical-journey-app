import type { RepertoireStage, SongKey } from '../../lib/db';
import { QUADRANT_COUNT, coveredQuadrants, isHeld } from './matrix/keyProgress';

// Ordered so indexOf() gives each stage a natural rank, and the next
// stage above any given one is just STAGES[indexOf(stage)+1].
//
// Order updated in sub-phase 3 step 4 (April 25, 2026): cross-key
// now precedes internalized. Rationale: a song isn't truly
// internalized until it's been worked across multiple keys —
// "memorized in original key only" is still cross-key-incomplete.
// The new internalized stage means "memorized and felt in any key".
//
// Existing songs.stage values are unchanged; only the meaning of
// 'internalized' shifts. Existing internalized songs may not meet
// the new definition and can be re-evaluated outside the system.
// Color tokens (badge / dot below) follow the new order so the
// visual progression matches.
export const STAGES: RepertoireStage[] = [
  'learning',
  'comfortable',
  'cross-key',
  'internalized',
  'maintenance',
];

export const STAGE_LABEL: Record<RepertoireStage, string> = {
  'learning': 'Learning',
  'comfortable': 'Comfortable',
  'cross-key': 'Cross-key',
  'internalized': 'Internalized',
  'maintenance': 'Maintenance',
};

/** Short two-to-three-word tagline shown beside the stage badge. */
export const STAGE_TAGLINE: Record<RepertoireStage, string> = {
  'learning': 'building the shape',
  'comfortable': 'smoothing the flow',
  'cross-key': 'stretching across keys',
  'internalized': 'owning it in any key',
  'maintenance': 'keeping it warm',
};

/** Multi-sentence coaching guidance shown on Song Detail and as a
 *  tooltip on Active Repertoire. Tone is coaching, not nagging. */
export const STAGE_GUIDANCE: Record<RepertoireStage, string> = {
  'learning':
    'Focus on accuracy at slow tempo. Break sections apart. Aim for clean play-throughs before increasing tempo.',
  'comfortable':
    'Work at or near target tempo. Smooth flow across sections. Make sure transitions are seamless.',
  'cross-key':
    'Take sections through other keys. Start with 5ths up/down and relative minor. Build understanding, not just finger patterns — the cross-key work is what sets up real internalization.',
  'internalized':
    'Now play it from memory, expressively, in any key it could come up in. Voicings, dynamics, feel — the song is yours. Cross-key work has built the foundation.',
  'maintenance':
    'Light-touch replay every 1–2 weeks. Keep the song at your fingertips for any performance moment.',
};

/** Tailwind badge classes. Reuses the established tier palette so the
 *  Repertoire badges feel visually related to Ear Training's tier pills.
 *  Color order tracks STAGES order: needswork → developing → fluent →
 *  mastered → info. Cross-key and internalized swap colors versus
 *  the original layout so the visual progression matches the new
 *  ordering — `mastered` (deeper green) lives on the new final stage
 *  before maintenance. "Maintenance" borrows the info-blue because
 *  it reads as "steady" rather than "needs work". */
export const STAGE_BADGE_CLASS: Record<RepertoireStage, string> = {
  'learning': 'bg-needswork/10 text-needswork border-needswork/30',
  'comfortable': 'bg-developing/10 text-developing border-developing/30',
  'cross-key': 'bg-fluent/10 text-fluent border-fluent/30',
  'internalized': 'bg-mastered/10 text-mastered border-mastered/30',
  'maintenance': 'bg-info/10 text-info border-info/30',
};

export const STAGE_DOT_CLASS: Record<RepertoireStage, string> = {
  'learning': 'bg-needswork',
  'comfortable': 'bg-developing',
  'cross-key': 'bg-fluent',
  'internalized': 'bg-mastered',
  'maintenance': 'bg-info',
};

/** Default stage for newly-seeded / newly-added songs. */
export const DEFAULT_STAGE: RepertoireStage = 'learning';

export function nextStage(stage: RepertoireStage): RepertoireStage | null {
  const idx = STAGES.indexOf(stage);
  if (idx < 0 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

// --- Advancement suggestions ----------------------------------------

// System-suggested stage advancement — soft nudges only. The user
// always has the final word via the "Advance stage" button; nothing
// here writes `songs.stage`.
//
// Criteria:
//   Learning → Comfortable:
//     The whole-song test passed in the original key — three
//     CONSECUTIVE clean run-throughs at tempo, in one sitting.
//   Comfortable → Cross-key:
//     Held in four keys, one from each quadrant of the circle of
//     fourths. The original key counts toward its own quadrant.
//   Cross-key → Internalized:      [rewritten in 3a-5]
//   Internalized → Maintenance:    [rewritten in 3a-5]
//
// ---------------------------------------------------------------
// NO RULE NAMES ITS OWN DESTINATION.
//
// Three of the four used to end in a hard-coded stage name, and all
// three named the WRONG one: the STAGES order was changed in April
// 2026 so that cross-key precedes internalized, and this switch was
// never revised. So a banner reading "consider advancing to
// Internalized" sat directly beside a button reading "advance to
// Cross-key", and one rule proposed moving back DOWN the ladder.
//
// The destination is now composed from `nextStage(currentStage)` by
// `suggestion()` below, which is the only way any rule may return
// suggest: true. A rule cannot name a stage the button will not go
// to, because a rule no longer names a stage at all. That property
// holds for the two rules still awaiting rewrite, which is why this
// lands before them rather than with them.
// ---------------------------------------------------------------

export interface AdvancementEvaluation {
  /** True when the criteria for advancing from `currentStage` are met. */
  suggest: boolean;
  /** Short reason shown beside the suggestion. Always composed by
   *  `suggestion()`, never written by a rule — see above. */
  reason?: string;
}

export interface AdvancementInputs {
  currentStage: RepertoireStage;
  /**
   * Every `songKeys` row for this song. `materialise` creates all
   * twelve up front, so a caller passing fewer is passing a filtered
   * list and will get a quieter answer than the data supports.
   */
  songKeys: SongKey[];
  /**
   * Evaluation time, passed in rather than read from the clock.
   *
   * `isHeld` live-derives decay from `lastEngagedAt`, so this is load
   * bearing rather than a testing convenience: the rules genuinely
   * depend on when they are asked. Supplied by the caller because
   * `evaluateAdvancement` runs inside a `useMemo` during render, and
   * calling `Date.now()` there is the purity violation the matrix
   * already avoids with a lazy `useState` initializer.
   */
  now: number;
  /** Home/original key. Read only by the not-yet-rewritten
   *  Internalized rule; leaves with it in 3a-5. */
  originalKey?: string;
  /**
   * Per-section cross-key coverage from the DEPRECATED
   * `songCrossKeyProgress` table.
   *
   * Still here only because the last two rules have not been
   * rewritten yet. Both leave in 3a-5, and this input leaves with
   * them — at which point `evaluateAdvancement` reads nothing but
   * `songKeys`.
   */
  crossKeyPairs: Array<{ sectionId: string; keyName: string; sessionCount: number }>;
}

/**
 * Build a suggestion whose destination is derived, never stated.
 *
 * `evidence` says what was counted ("whole-song test passed in C");
 * the destination clause is appended from `nextStage`. Returns a
 * non-suggestion when there is no stage above the current one, so a
 * terminal stage cannot produce a suggestion pointing nowhere.
 */
function suggestion(
  currentStage: RepertoireStage,
  evidence: string,
): AdvancementEvaluation {
  const next = nextStage(currentStage);
  if (next === null) return { suggest: false };
  return {
    suggest: true,
    reason: `${evidence} — consider advancing to ${STAGE_LABEL[next]}.`,
  };
}

export function evaluateAdvancement(input: AdvancementInputs): AdvancementEvaluation {
  switch (input.currentStage) {
    case 'learning': {
      // ---------------------------------------------------------------
      // COMFORTABLE MEANS YOU CAN PLAY THE SONG — ALL OF IT.
      //
      // Read off `wholeSongTestPassedAt` rather than counted from
      // run-through rows, for two reasons. One meaning of "passed the
      // whole-song test" beats two that can drift apart. And the
      // stored flag records three CONSECUTIVE clean runs in a single
      // sitting, which is a different claim from three cumulative
      // ones: three good days weeks apart with failures in between
      // does not show you can do it on demand.
      //
      // This carries an implicit prerequisite worth naming, because
      // it is not visible in this file. The whole-song test only
      // becomes reachable once every section's cell in that key is
      // comfortable (computeKeyStateFromCells, KeyRow.showRunTest).
      // So Comfortable requires every part of the song AND a passed
      // run of the whole thing. That is deliberate: nailing the
      // chorus five times is not being comfortable with the song.
      //
      // The 3a rule this replaces read `songCellRunThroughs` — the
      // per-section table — with no section or key spread required at
      // all, so five clean runs of one section in one key promoted
      // the whole song.
      // ---------------------------------------------------------------
      const original = input.songKeys.find(k => k.isOriginalKey);
      if (!original || original.wholeSongTestPassedAt === null) {
        return { suggest: false };
      }
      return suggestion(
        input.currentStage,
        `whole-song test passed in ${original.keyName}`,
      );
    }
    case 'comfortable': {
      // ---------------------------------------------------------------
      // SPREAD, NOT COUNT.
      //
      // Four keys, one from each quadrant of the circle of fourths.
      // C, F and Bb share most of their shapes, so three adjacent
      // keys prove much less than three spread ones — a plain count
      // of four would be satisfied by a run of neighbours. The
      // original key counts toward its own quadrant: a song in C is
      // comfortable in C by definition, so this asks for three more
      // from the other three quadrants.
      //
      // `isHeld` rather than a bare state check, so a key that
      // climbed to solid and then lapsed stops counting. Cross-key is
      // a claim about what you can play now, not what you once could.
      //
      // This rule replaces one that read practice feel — an average
      // of the last five `feelRating`s — and so could not see a
      // single key, section or run-through. It was also the next
      // field about to lose its writer: practice carries no rating
      // under the two-mode split, so a rule built on feel would have
      // gone quiet inside this same build.
      // ---------------------------------------------------------------
      const held = input.songKeys.filter(k => isHeld(k, input.now));
      const covered = coveredQuadrants(held.map(k => k.keyName));
      if (covered.size >= QUADRANT_COUNT) {
        return suggestion(
          input.currentStage,
          `comfortable in ${held.length} keys, covering all `
            + `${QUADRANT_COUNT} quadrants of the circle of fourths`,
        );
      }
      return { suggest: false };
    }
    case 'cross-key': {
      // NOT YET REWRITTEN — lands in 3a-5, where it becomes "the four
      // quadrant keys still held, plus one clean at-tempo run in each
      // of the remaining eight". That needs an affordance that does
      // not exist yet (3a-4): the whole-song test is the only writer
      // of key run-throughs and it is gated on every cell in the key
      // already being comfortable, so a single pass in an untouched
      // key cannot currently be logged at all.
      //
      // Until then it keeps its old criteria, reading the deprecated
      // `songCrossKeyProgress`, where "touched" means one tap on the
      // cross-key grid. The DESTINATION is no longer wrong — that is
      // what `suggestion()` fixes today — but the evidence is still
      // weak, and the two independent tallies below do not check what
      // "6 keys across 3 sections" sounds like they check.
      const sectionsTouched = new Set<string>();
      const keysTouched = new Set<string>();
      for (const p of input.crossKeyPairs) {
        if (p.sessionCount <= 0) continue;
        sectionsTouched.add(p.sectionId);
        keysTouched.add(p.keyName);
      }
      if (keysTouched.size >= 6 && sectionsTouched.size >= 3) {
        return suggestion(
          input.currentStage,
          `${keysTouched.size} keys and ${sectionsTouched.size} sections touched`,
        );
      }
      return { suggest: false };
    }
    case 'internalized': {
      // NOT YET REWRITTEN — lands in 3a-5, where Maintenance stops
      // being a rung and becomes a mode on Internalized. Old criteria
      // retained; destination now derived rather than stated, so it
      // no longer proposes moving back down the ladder.
      const nonOriginal = new Set<string>();
      for (const p of input.crossKeyPairs) {
        if (p.sessionCount <= 0) continue;
        if (input.originalKey && p.keyName === input.originalKey) continue;
        nonOriginal.add(p.keyName);
      }
      if (nonOriginal.size >= 2) {
        return suggestion(
          input.currentStage,
          `${nonOriginal.size} non-original keys touched`,
        );
      }
      return { suggest: false };
    }
    case 'maintenance':
      return { suggest: false };
  }
}

// --- Freshness (practice recency) -----------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export type Freshness = 'fresh' | 'recent' | 'aging' | 'stale';

export const FRESHNESS_DOT_CLASS: Record<Freshness, string> = {
  fresh: 'bg-fluent',
  recent: 'bg-developing',
  aging: 'bg-[#E88943]', // orange between amber and red
  stale: 'bg-needswork',
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'last 3 days',
  recent: '4–10 days ago',
  aging: '11–20 days ago',
  stale: '20+ days ago',
};

export function freshnessFor(lastPracticedAt: number | null): Freshness {
  if (lastPracticedAt === null) return 'stale';
  const daysAgo = (Date.now() - lastPracticedAt) / DAY_MS;
  if (daysAgo <= 3) return 'fresh';
  if (daysAgo <= 10) return 'recent';
  if (daysAgo <= 20) return 'aging';
  return 'stale';
}

export function daysSince(timestamp: number | null): number | null {
  if (timestamp === null) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS));
}

/** Human-friendly "today" / "yesterday" / "N days ago" / "never". */
export function humanAgo(timestamp: number | null): string {
  if (timestamp === null) return 'never';
  const days = daysSince(timestamp) ?? 0;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

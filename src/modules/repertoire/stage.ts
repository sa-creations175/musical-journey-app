import type { RepertoireStage, SongPracticeLog } from '../../lib/db';
import { CONSISTENTLY_FLUENT_AVG, normaliseFeel } from '../../lib/fluencyScale';
import { isInTempoRange } from './matrix/cellRollup';

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

// System-suggested stage advancement — soft nudges only. User always
// has the final word via the "Advance stage" button.
//
// Criteria:
//   Learning → Comfortable:
//     5+ CLEAN TEST RUN-THROUGHS at performance tempo.
//   Comfortable → Internalized:
//     3+ weeks of recent practice (≥1 session in last 7 days) with
//     average feel ≥ 4 across the last 5+ sessions.
//   Internalized → Cross-key:
//     ≥2 non-original keys practised on at least 1 section.
//   Cross-key → Maintenance:
//     ≥6 distinct keys covered across at least 3 different sections.

export interface AdvancementEvaluation {
  /** True when the criteria for advancing from `currentStage` are met. */
  suggest: boolean;
  /** Short reason shown beside the suggestion ("5 sessions at target
   *  tempo — consider advancing to Comfortable"). */
  reason?: string;
}

export interface AdvancementInputs {
  currentStage: RepertoireStage;
  logs: SongPracticeLog[];
  /** Home/original key for this song. Used by Internalized → Cross-key
   *  to count *non-original* keys. */
  originalKey?: string;
  /** Per-section cross-key coverage — from songCrossKeyProgress. */
  crossKeyPairs: Array<{ sectionId: string; keyName: string; sessionCount: number }>;
  /**
   * Every test run-through recorded for this song, across all
   * sections and all keys. Source for the at-tempo half of
   * Learning → Comfortable.
   *
   * REQUIRED, deliberately — not optional with a `[]` default. The
   * bug this rewrite fixes was a rule reading a field nothing wrote,
   * which cost nothing at compile time and silently stopped
   * suggesting. An optional input would rebuild exactly that: a call
   * site that forgot to pass run-throughs would type-check and
   * quietly never promote. Required makes `tsc` the thing that
   * notices.
   */
  runThroughs: AdvancementRunThrough[];
  /**
   * The song's performance tempo (`songs.tempo`), or null when the
   * user has not set one. Null suppresses the Learning → Comfortable
   * suggestion entirely — see the rule.
   */
  performanceTempo: number | null;
}

/**
 * The run-through facts the at-tempo rule reads.
 *
 * Structural rather than `SongCellRunThrough` so a caller can pass a
 * projection and a test can build one without inventing ids, cell
 * refs and timestamps that the rule never looks at. Widening this
 * later is additive; narrowing a full-row dependency would not be.
 */
export interface AdvancementRunThrough {
  wasClean: boolean;
  /** Null when the run-through was logged without a tempo. */
  tempoBpm: number | null;
}

/**
 * Clean at-tempo run-throughs needed to suggest Comfortable.
 *
 * Carried over unchanged from the rule this replaces, which asked for
 * 5 sessions. The count is the same bar; only its SOURCE moved, from
 * a checkbox the user ticked to run-throughs the app measured.
 */
export const CLEAN_RUNS_FOR_COMFORTABLE = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateAdvancement(input: AdvancementInputs): AdvancementEvaluation {
  switch (input.currentStage) {
    case 'learning': {
      // ---------------------------------------------------------------
      // AT TEMPO IS A TEST FACT, READ OFF TEST DATA.
      //
      // This rule used to count practice logs carrying
      // `atTargetTempo === true`. That field's only writer was
      // PracticeLogModal — the cell modal never set it — so from the
      // moment logging moved to the matrix, every session written
      // there was invisible to this rule, and the retirement of that
      // modal would have taken the writer count to zero. No error, no
      // crash: just a promotion prompt that never appears again. Same
      // silent shape as the `avgFeel >= 4` literal one case below.
      //
      // The fix is not a new writer. Practice and test are different
      // events, and "at tempo" is a TEST fact — so the rule now reads
      // the run-throughs directly and needs no self-report at all.
      //
      // THE FEEL CONDITION IS GONE, and that is the deliberate half.
      // The old rule paired at-tempo with `feel >= 3`, a rating that
      // now describes a PRACTICE session. Joining the two would mean
      // a run-through only counted if it happened inside a rated
      // practice session — and under the two-mode split a test need
      // not produce a practice log at all, so the join would kill the
      // rule a second way. Clean-at-tempo is the stronger signal in
      // any case: it is measured rather than ticked.
      // ---------------------------------------------------------------

      // No performance tempo means there is no target to be at, and
      // `isInTempoRange` deliberately returns TRUE in that case — the
      // cell gate switches itself off rather than blocking a user who
      // has not set a tempo. That default is right there and wrong
      // here: inherited, it would promote a song to Comfortable on any
      // five clean runs at any speed. So the suggestion is withheld
      // until there is a tempo to have been at.
      if (input.performanceTempo === null) return { suggest: false };

      // Run-throughs logged without a tempo are excluded by
      // isInTempoRange's own null-bpm branch. Step 2 wrote the reason
      // and it holds unchanged: the gate asks "clean at performance
      // tempo", and "clean at a tempo you didn't state" is not an
      // answer to it.
      const qualifying = input.runThroughs.filter(
        r => r.wasClean && isInTempoRange(r.tempoBpm, input.performanceTempo),
      ).length;
      if (qualifying >= CLEAN_RUNS_FOR_COMFORTABLE) {
        return {
          suggest: true,
          reason: `${qualifying} clean run-throughs at tempo — consider advancing to Comfortable.`,
        };
      }
      return { suggest: false };
    }
    case 'comfortable': {
      const now = Date.now();
      const weekAgo = now - 7 * DAY_MS;
      const recentSessions = input.logs.filter(l => l.timestamp >= weekAgo);
      if (recentSessions.length === 0) return { suggest: false };
      const byWeek = new Map<number, SongPracticeLog[]>();
      for (const log of input.logs) {
        const weekStart = Math.floor(log.timestamp / (7 * DAY_MS));
        const arr = byWeek.get(weekStart) ?? [];
        arr.push(log);
        byWeek.set(weekStart, arr);
      }
      const recentEnough = [...byWeek.keys()]
        .filter(w => w * 7 * DAY_MS >= now - 21 * DAY_MS).length;
      const last5 = [...input.logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
      // Unrated sessions are EXCLUDED from the average, not scored
      // zero. "I practised for 40 minutes and didn't say how it went"
      // is not a bad session, and counting it as one would let the
      // fast path suppress a promotion the user has earned.
      const rated = last5
        .map(l => normaliseFeel(l.feelRating))
        .filter((f): f is NonNullable<typeof f> => f !== null);
      const avgFeel = rated.length === 0
        ? 0
        : rated.reduce((sum, f) => sum + f, 0) / rated.length;
      // CONSISTENTLY_FLUENT_AVG (3.5), not the literal 4 this used to
      // carry. On the old 1-5 scale an average of 4 was reachable with
      // a mix, because 5s pulled 3s up. With the fifth step gone 4 is
      // the maximum, so the old literal would demand five perfect
      // sessions in a row — and the failure would have been silent:
      // no error, just a promotion prompt that never appears again.
      // See the rationale on the constant.
      if (recentEnough >= 3 && avgFeel >= CONSISTENTLY_FLUENT_AVG && last5.length >= 5) {
        return {
          suggest: true,
          reason: `3+ weeks of practice, mostly in flow — consider advancing to Internalized.`,
        };
      }
      return { suggest: false };
    }
    case 'internalized': {
      const nonOriginal = new Set<string>();
      for (const p of input.crossKeyPairs) {
        if (p.sessionCount <= 0) continue;
        if (input.originalKey && p.keyName === input.originalKey) continue;
        nonOriginal.add(p.keyName);
      }
      if (nonOriginal.size >= 2) {
        return {
          suggest: true,
          reason: `${nonOriginal.size} non-original keys touched — consider advancing to Cross-key.`,
        };
      }
      return { suggest: false };
    }
    case 'cross-key': {
      const sectionsByKey = new Set<string>();
      const keysTouched = new Set<string>();
      for (const p of input.crossKeyPairs) {
        if (p.sessionCount <= 0) continue;
        sectionsByKey.add(p.sectionId);
        keysTouched.add(p.keyName);
      }
      if (keysTouched.size >= 6 && sectionsByKey.size >= 3) {
        return {
          suggest: true,
          reason: `${keysTouched.size} keys across ${sectionsByKey.size} sections — consider advancing to Maintenance.`,
        };
      }
      return { suggest: false };
    }
    case 'maintenance':
      return { suggest: false };
  }
}

// --- Freshness (practice recency) -----------------------------------

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

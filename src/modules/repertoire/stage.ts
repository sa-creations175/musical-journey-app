import type { RepertoireStage, SongKey } from '../../lib/db';
import { isInTempoRange } from './matrix/cellRollup';
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
];

/**
 * Coerce a stored stage onto the current ladder.
 *
 * 'maintenance' was a fifth rung and is retired — it is a mode you
 * enter by reaching internalized, not a step above it. Rows written
 * before that collapse onto 'internalized', which is where those songs
 * already were: maintenance sat directly above it and was reachable
 * only from it, so this narrows a category onto the state it was
 * entered from rather than demoting anything or inventing a stage.
 *
 * Read-through rather than a migration pass, matching `normaliseFeel`.
 * No Dexie version bump, no destructive rewrite of the user's rows,
 * and a song that syncs down from a device still on the old build
 * still reads correctly.
 *
 * Anything unrecognised falls back to the default rather than
 * throwing: this runs on a read path over historical rows, and a
 * corrupt value should degrade one card, not blank the screen.
 */
export function normaliseStage(raw: string | null | undefined): RepertoireStage {
  if (raw === 'maintenance') return 'internalized';
  return (STAGES as readonly string[]).includes(raw ?? '')
    ? (raw as RepertoireStage)
    : DEFAULT_STAGE;
}

export const STAGE_LABEL: Record<RepertoireStage, string> = {
  'learning': 'Learning',
  'comfortable': 'Comfortable',
  'cross-key': 'Cross-key',
  'internalized': 'Internalized',
};

/** Short two-to-three-word tagline shown beside the stage badge. */
export const STAGE_TAGLINE: Record<RepertoireStage, string> = {
  'learning': 'building the shape',
  'comfortable': 'smoothing the flow',
  'cross-key': 'stretching across keys',
  'internalized': 'owning it in any key',
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
  // Absorbs what the retired 'maintenance' rung used to say. Reaching
  // internalized IS entering maintenance, so its guidance has to carry
  // the keeping-it-warm half — otherwise retiring the rung would have
  // quietly deleted the only advice about what to do afterwards.
  'internalized':
    'Now play it from memory, expressively, in any key it could come up in. Voicings, dynamics, feel — the song is yours. From here it is upkeep: a light replay every week or two, in a key you did not choose, keeps it at your fingertips.',
};

/** Tailwind badge classes. Reuses the established tier palette so the
 *  Repertoire badges feel visually related to Ear Training's tier pills.
 *  Color order tracks STAGES order: needswork → developing → fluent →
 *  mastered. Cross-key and internalized swap colors versus the
 *  original layout so the visual progression matches the ladder —
 *  `mastered` (deeper green) lives on the final stage. The info-blue
 *  that used to carry 'maintenance' left with that rung. */
export const STAGE_BADGE_CLASS: Record<RepertoireStage, string> = {
  'learning': 'bg-needswork/10 text-needswork border-needswork/30',
  'comfortable': 'bg-developing/10 text-developing border-developing/30',
  'cross-key': 'bg-fluent/10 text-fluent border-fluent/30',
  'internalized': 'bg-mastered/10 text-mastered border-mastered/30',
};

export const STAGE_DOT_CLASS: Record<RepertoireStage, string> = {
  'learning': 'bg-needswork',
  'comfortable': 'bg-developing',
  'cross-key': 'bg-fluent',
  'internalized': 'bg-mastered',
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
//   Cross-key → Internalized:
//     All four quadrants still held, AND every key that is not held
//     carries at least one clean run-through at performance tempo.
//     Depth in four, breadth across twelve.
//   Internalized:
//     Terminal. 'maintenance' was a fifth rung and is retired — see
//     normaliseStage.
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
  /**
   * Every whole-song run-through recorded for this song, across all
   * keys and BOTH kinds. A key you passed the full test in obviously
   * also had a clean run in it, so filtering to `kind === 'single'`
   * would make the harder achievement count for less.
   */
  keyRunThroughs: AdvancementKeyRun[];
  /**
   * The song's performance tempo, or null when unset. Null suppresses
   * Cross-key → Internalized, for the same reason it suppressed the
   * old Learning rule: `isInTempoRange` deliberately returns true when
   * there is no tempo — right for the cell gate, which switches itself
   * off rather than blocking a user who has not set one, and wrong
   * here, where inheriting it would let any run at any speed stand in
   * for a run at tempo.
   */
  performanceTempo: number | null;
}

/**
 * The run-through facts the breadth rule reads.
 *
 * Structural rather than `SongKeyRunThrough` so a caller can pass a
 * projection and a test can build one without inventing ids and
 * timestamps the rule never looks at.
 */
export interface AdvancementKeyRun {
  songKeyId: string;
  wasClean: boolean;
  /** Null when the run was logged without a tempo. */
  tempoBpm: number | null;
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
      // ---------------------------------------------------------------
      // DEPTH IN FOUR, BREADTH ACROSS TWELVE.
      //
      // The four quadrant keys that earned Cross-key have to STILL be
      // held — internalized is not a receipt for something you could
      // once do — and every remaining key needs at least one clean
      // run-through at tempo. Working a song in several keys is how it
      // gets internalized rather than something done afterwards, which
      // is why this rung sits where it does.
      //
      // Expressed as "every key is either held or has a clean run"
      // rather than "the other eight have runs", because nothing
      // records WHICH four keys earned cross-key. A key that is held
      // satisfies the requirement by being held; a key that is not
      // must show the run. Holding more than four is not penalised.
      //
      // This replaces a rule that read the deprecated
      // `songCrossKeyProgress`, where a key counted as "touched" after
      // ONE tap on the cross-key grid, and which checked two
      // independent tallies — six keys anywhere and three sections
      // anywhere — that together did not mean what "6 keys across 3
      // sections" sounds like. Verified before replacing: six keys on
      // the chorus plus two other sections in two other keys fired it,
      // with no key covering more than two sections.
      // ---------------------------------------------------------------
      if (input.performanceTempo === null) return { suggest: false };

      const held = new Set(
        input.songKeys.filter(k => isHeld(k, input.now)).map(k => k.id),
      );
      if (coveredQuadrants(
        input.songKeys.filter(k => held.has(k.id)).map(k => k.keyName),
      ).size < QUADRANT_COUNT) {
        return { suggest: false };
      }

      const provenByRun = new Set(
        input.keyRunThroughs
          .filter(r => r.wasClean && isInTempoRange(r.tempoBpm, input.performanceTempo))
          .map(r => r.songKeyId),
      );
      const short = input.songKeys.filter(
        k => !held.has(k.id) && !provenByRun.has(k.id),
      );
      if (short.length > 0) return { suggest: false };

      return suggestion(
        input.currentStage,
        `all ${input.songKeys.length} keys either held or run clean at tempo`,
      );
    }
    case 'internalized':
      // TERMINAL. 'maintenance' used to sit above this and is retired:
      // it is the mode you are in once you get here, not a step beyond
      // it. Its entry criteria were empty — nothing extra was required
      // — and a suggestion whose condition is always true is not a
      // suggestion, it is a banner that never goes away.
      //
      // What made maintenance a real idea is the HOLDING half: periodic
      // checks where the app picks a key and asks for a run, which
      // lapse if you fall behind. That is an SM-2 review rather than a
      // bespoke timer, and it lands on build-queue item 9 with the rest
      // of the spacing work. Until then, reaching internalized is the
      // end of the ladder and STAGE_GUIDANCE carries the upkeep advice.
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

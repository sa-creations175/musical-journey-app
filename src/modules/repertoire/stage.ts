import type { RepertoireStage, SongKey } from '../../lib/db';
import { isInTempoRange } from './matrix/cellRollup';
import {
  KEY_QUADRANTS,
  QUADRANT_COUNT,
  coveredQuadrants,
  isHeld,
} from './matrix/keyProgress';
import type { DueWindows } from './matrix/keySpacing';
import { spellKey, type Spelling } from '../../lib/spelling';

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
   * How key names in the criteria COPY are spelled. The rules
   * themselves compare `keyName` identities and are unaffected — this
   * only decides how those keys are named back to the reader, so the
   * criteria panel does not say F# on a page whose header says G♭.
   */
  spelling: Spelling;
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
  /**
   * When each key is next due to be proven, by `songKeys.id`. A key
   * absent from the map, or mapped to null, has never been proven —
   * which is not the same as due now.
   *
   * REQUIRED, not optional with an empty-map default. A caller that
   * forgot to pass it would see every key read as never-proven, which
   * HOLDS the rung — so the rules would quietly stop demoting and
   * nothing would look wrong. Same shape as the field that started
   * this workstream.
   */
  dueByKeyId: ReadonlyMap<string, number | null>;
  /** The user's due-soon and grace windows. */
  dueWindows: DueWindows;
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
 * One thing that has to be true before a stage suggestion appears.
 *
 * Stated as the achievement rather than as an instruction, so the
 * same string reads correctly whether it is met or not: "Four keys
 * held, one per quadrant" works both as a target and as a completed
 * item. `detail` names what is missing, when it can be named.
 */
export interface StageCriterion {
  label: string;
  met: boolean;
  /** Progress toward `need`. A yes/no criterion uses 0 or 1 of 1. */
  have: number;
  need: number;
  /** What is outstanding, spelled out. Present only when unmet and
   *  only when the gap can be described more usefully than by the
   *  numbers alone. */
  detail?: string;
  /**
   * An enabling condition rather than an achievement — "a performance
   * tempo is set". Listed in the panel, because anything that can
   * withhold the suggestion has to be visible, but kept out of the
   * banner: the banner says what you DID, and setting a tempo is not
   * something you did toward this stage.
   */
  precondition?: boolean;
}

/**
 * What the current stage needs before it will suggest advancing.
 *
 * ---------------------------------------------------------------
 * THE SINGLE SOURCE. `evaluateAdvancement` is DERIVED from this, not
 * written alongside it.
 *
 * A panel that lists criteria and a rule that decides when to fire
 * are two statements of the same thing, and two statements of the
 * same thing can disagree. That failure is worse than either being
 * wrong alone: a panel reading "3 of 3" beside a rule that never
 * fires is unfalsifiable from the outside — the user cannot tell
 * which half lied.
 *
 * So the rule fires exactly when every criterion is met, and a
 * property test asserts that identity across a spread of inputs
 * rather than trusting it.
 *
 * The suppressing preconditions are criteria too — "an original key
 * is set", "the song has a performance tempo". They used to be early
 * returns, which made them invisible: the panel would show everything
 * met and nothing would happen. If a thing can stop the suggestion, it
 * has to be listed.
 * ---------------------------------------------------------------
 */
/**
 * The breadth half of Cross-key → Internalized, computed once.
 *
 * ---------------------------------------------------------------
 * ONE DEFINITION, TWO READERS.
 *
 * The criterion reads it to say how many keys are still short. The
 * matrix row reads it to decide whether to show its "run at tempo"
 * button at all. Those two must not be able to disagree: a button
 * offered on a key the criterion does not count is a control whose
 * only honest label is "this doesn't count", and a key the criterion
 * counts with no button on its row is a criterion you cannot satisfy.
 *
 * NOTE ON `short`. It is every key NOT currently held — not a fixed
 * set of eight, and not "the non-quadrant keys". Every one of the
 * twelve keys is in a quadrant (four quadrants of three), so there is
 * no such thing as a non-quadrant key. A quadrant is covered by ANY
 * one held key in it, which leaves its other two still short. Exactly
 * four held keys makes `short` eight; six held keys makes it six.
 * ---------------------------------------------------------------
 */
function breadthStatus(input: AdvancementInputs) {
  const held = new Set(
    input.songKeys
      .filter(k => isHeld(k, input.now, input.dueByKeyId.get(k.id) ?? null, input.dueWindows))
      .map(k => k.id),
  );
  const tempoSet = input.performanceTempo !== null;
  // Without a performance tempo there is no tempo for a run to be
  // clean AT, so no run can qualify — and the button must not be
  // offered either.
  const provenByRun = tempoSet
    ? new Set(
        input.keyRunThroughs
          .filter(r => r.wasClean && isInTempoRange(r.tempoBpm, input.performanceTempo))
          .map(r => r.songKeyId),
      )
    : new Set<string>();
  const satisfied = input.songKeys.filter(
    k => held.has(k.id) || provenByRun.has(k.id),
  );
  const short = input.songKeys.filter(
    k => !held.has(k.id) && !provenByRun.has(k.id),
  );
  return { held, tempoSet, provenByRun, satisfied, short };
}

/**
 * The keys where logging one clean at-tempo run actually advances
 * something, as a set of songKey ids.
 *
 * ---------------------------------------------------------------
 * THERE IS NO HONEST LABEL FOR A BUTTON THAT DOES NOTHING.
 *
 * A single clean run advances exactly one criterion in the whole
 * ladder — the breadth half of Cross-key → Internalized. It does not
 * promote a key's state (`logSingleKeyRun` submits one attempt, and
 * promotion needs three), so at Learning and at Comfortable it moves
 * nothing whatsoever. Asked what would prompt pressing it on a song
 * at Learning, the answer is nothing.
 *
 * Empty unless ALL of:
 *   - the song is at Cross-key, the only rung a run counts toward;
 *   - a performance tempo is set, without which no run can be clean
 *     AT anything;
 *   - and, per key, that key is neither held nor already run clean —
 *     a second run on a satisfied key adds nothing either.
 * ---------------------------------------------------------------
 */
/**
 * Every rung's criteria at once, grouped by the rung each one earns.
 *
 * ---------------------------------------------------------------
 * THE PANEL ACCUMULATES INSTEAD OF SWAPPING.
 *
 * It used to show only the current rung's criteria, so the moment you
 * satisfied one it vanished — the panel swapped wholesale to the next
 * rung and the thing you had just earned was gone from the screen
 * that told you to earn it. What you had done became invisible
 * exactly when it became true.
 *
 * A TICK IS A LIVE READING, NOT A RECORD. Every group is recomputed
 * against current state, including groups for rungs already passed.
 * That is deliberate: a quadrant key can lapse, and when it does the
 * group that depended on it un-ticks and the song drops. An
 * achievement log would keep the tick and lie. The panel's copy says
 * so, because a mark that can go backwards has to admit it.
 *
 * No rule is duplicated to do this. `stageCriteria` already takes the
 * rung as an argument and `deriveStage` already walks the ladder
 * calling it — this keeps the results that walk throws away.
 * ---------------------------------------------------------------
 */
export type LadderGroupStatus = 'earned' | 'current' | 'ahead';

export interface LadderGroup {
  /** The rung these criteria earn — never the rung you are on. */
  earns: RepertoireStage;
  status: LadderGroupStatus;
  criteria: StageCriterion[];
}

export function ladderCriteria(input: AdvancementInputs): LadderGroup[] {
  const here = STAGES.indexOf(input.currentStage);
  const groups: LadderGroup[] = [];
  for (const [i, candidate] of STAGES.entries()) {
    const earns = nextStage(candidate);
    // The terminal rung earns nothing and has no criteria; skipping on
    // `earns` rather than on the stage name means a fifth rung added
    // later is picked up without touching this.
    if (earns === null) continue;
    const criteria = stageCriteria({ ...input, currentStage: candidate });
    if (criteria.length === 0) continue;
    groups.push({
      earns,
      status: i < here ? 'earned' : i === here ? 'current' : 'ahead',
      criteria,
    });
  }
  return groups;
}

export function keysWhereRunCounts(input: AdvancementInputs): ReadonlySet<string> {
  if (input.currentStage !== 'cross-key') return EMPTY_KEY_SET;
  const { tempoSet, short } = breadthStatus(input);
  if (!tempoSet) return EMPTY_KEY_SET;
  return new Set(short.map(k => k.id));
}

const EMPTY_KEY_SET: ReadonlySet<string> = new Set<string>();

export function stageCriteria(input: AdvancementInputs): StageCriterion[] {
  switch (input.currentStage) {
    case 'learning': {
      const original = input.songKeys.find(k => k.isOriginalKey);
      if (!original) {
        return [{
          label: 'An original key is set for this song',
          precondition: true,
          met: false,
          have: 0,
          need: 1,
          detail: 'Until one is, there is no key for the whole-song test to '
            + 'be passed in.',
        }];
      }
      const passed = original.wholeSongTestPassedAt !== null;
      return [{
        label: `Whole-song test passed in the key of ${spellKey(original.keyName, input.spelling)}`,
        met: passed,
        have: passed ? 1 : 0,
        need: 1,
        ...(passed ? {} : {
          detail: 'Three clean run-throughs in a row, in one sitting. Open it '
            + `from the row for the key of ${spellKey(original.keyName, input.spelling)} in the matrix.`,
        }),
      }];
    }

    case 'comfortable': {
      const held = input.songKeys.filter(k => isHeld(k, input.now, input.dueByKeyId.get(k.id) ?? null, input.dueWindows));
      const covered = coveredQuadrants(held.map(k => k.keyName));
      const missing = KEY_QUADRANTS
        .map((q, i) => (covered.has(i) ? null : q.join(' · ')))
        .filter((q): q is string => q !== null);
      return [{
        // Precise about the rule: ONE key per quadrant, at Comfortable
        // status or above, and any key within the quadrant qualifies.
        // "Comfortable in 4 keys, one from each quadrant" implied four
        // specific keys, which is not what the rule asks.
        label: `One key at Comfortable status or above from each of the `
          + `${QUADRANT_COUNT} quadrants of the circle of fourths`,
        met: covered.size >= QUADRANT_COUNT,
        have: covered.size,
        need: QUADRANT_COUNT,
        ...(missing.length > 0
          ? { detail: `Still to cover: ${missing.join(', ')}.` }
          : {}),
      }];
    }

    case 'cross-key': {
      const { held, tempoSet, satisfied, short } = breadthStatus(input);
      const covered = coveredQuadrants(
        input.songKeys.filter(k => held.has(k.id)).map(k => k.keyName),
      );

      return [
        {
          // Listed FIRST because it is the precondition, and because
          // without it the breadth criterion below would read as
          // achievable when no run can qualify.
          label: 'A performance tempo is set for this song',
          precondition: true,
          met: tempoSet,
          have: tempoSet ? 1 : 0,
          need: 1,
          ...(tempoSet ? {} : {
            detail: 'Without one there is no tempo for a run to be clean AT, '
              + 'so no run can count toward the remaining keys.',
          }),
        },
        {
          label: 'All four quadrants still held at Comfortable status or above',
          met: covered.size >= QUADRANT_COUNT,
          have: covered.size,
          need: QUADRANT_COUNT,
          ...(covered.size >= QUADRANT_COUNT ? {} : {
            detail: 'Cross-key is a claim about what you can play now, so a '
              + 'key that lapsed stops counting until you retest it.',
          }),
        },
        {
          label: 'Every other key run clean at tempo, at least once',
          met: short.length === 0,
          have: satisfied.length,
          need: input.songKeys.length,
          ...(short.length > 0
            ? {
                detail: `Still to run: ${short.length === 1 ? 'the key of' : 'keys'} `
                  + `${short.map(k => spellKey(k.keyName, input.spelling)).join(', ')}. `
                  + 'Use "log a run" on those rows — one clean pass each is enough.',
              }
            : {}),
        },
      ];
    }

    case 'internalized':
      // Terminal. No criteria, and `evaluateAdvancement` reads an
      // empty list as "nothing to suggest" rather than as "everything
      // satisfied" — see the length check there.
      return [];
  }
}

/**
 * Whether to suggest advancing, and why.
 *
 * DERIVED from `stageCriteria`. The destination is composed from
 * `nextStage` and never named by a rule: three of the four used to
 * hard-code one and all three named the wrong stage, because STAGES
 * was reordered in April 2026 and this switch was not.
 *
 * TWO GUARDS STOP A TERMINAL STAGE SUGGESTING, and neither is
 * individually load-bearing — which is worth stating, because the
 * first draft's comment claimed the empty-list check was, and the
 * reversal showed it is not: removing it left every test green.
 *
 * `[].every()` is true, so an empty criteria list reads as fully
 * satisfied. What actually stops `internalized` there is
 * `nextStage() === null`. The length check is belt: it would matter
 * the day a NON-terminal stage is added with no criteria, where the
 * null check would not fire. Removing either alone changes nothing;
 * removing both suggests advancing to `undefined`.
 */
/**
 * The stage this song is actually at.
 *
 * ---------------------------------------------------------------
 * PLAY IT, PROVE IT, THREE TIMES.
 *
 * Nothing writes a stage any more. There is no dropdown, no "advance
 * to Comfortable" button and no override — a rung is where the
 * evidence puts you, and the only way up is to play the song and
 * prove it: three clean run-throughs at tempo, back to back, in one
 * sitting.
 *
 * That cuts both ways, deliberately. A rung can be LOST as well as
 * earned, because `isHeld` reads a due date and a key that stops
 * being re-proven stops counting. A stored stage could only ever go
 * up, which made it a record of the best day a song ever had rather
 * than of where it is.
 * ---------------------------------------------------------------
 *
 * WALKS UP FROM THE BOTTOM rather than checking one rung. Every stage
 * is entered by satisfying the rung below it, so the honest answer is
 * the highest rung whose entry has been earned — and the walk is what
 * makes a two-rung fall land correctly. "Four quadrants held" is
 * shared between comfortable → cross-key and criterion 2 of cross-key
 * → internalized, so one stale key fails both; a check that only
 * asked "does this song still satisfy its current rung" would drop
 * exactly one and stop.
 */
export function deriveStage(
  input: Omit<AdvancementInputs, 'currentStage'>,
): RepertoireStage {
  let stage: RepertoireStage = STAGES[0];
  for (const candidate of STAGES) {
    const criteria = stageCriteria({ ...input, currentStage: candidate });
    // An empty list is a terminal rung, not a satisfied one — see the
    // note in evaluateAdvancement.
    //
    // BELT, NOT BRACES, and the first draft's comment claimed
    // otherwise. Removing this line changes nothing today: `[].every()`
    // is true, so the walk proceeds, and what actually stops it is
    // `nextStage() === null` two lines down. Verified by reversal —
    // taking it out left all 50 tests green. It earns its place only
    // the day a NON-terminal rung has no criteria, where the null check
    // would not fire. Removing BOTH makes `stage` null and the walk
    // returns a value that is not on the ladder.
    if (criteria.length === 0) break;
    if (!criteria.every(c => c.met)) break;
    const next = nextStage(candidate);
    if (next === null) break;
    stage = next;
  }
  return stage;
}

export function evaluateAdvancement(input: AdvancementInputs): AdvancementEvaluation {
  const criteria = stageCriteria(input);
  if (criteria.length === 0 || !criteria.every(c => c.met)) {
    return { suggest: false };
  }
  const next = nextStage(input.currentStage);
  if (next === null) return { suggest: false };
  return {
    suggest: true,
    reason: `${evidenceFrom(criteria)} — consider advancing to ${STAGE_LABEL[next]}.`,
  };
}

/**
 * The banner's "why", built from the criteria that were achieved.
 *
 * Preconditions are dropped: the banner says what you did, and having
 * a tempo set is not something you did toward the stage. Everything
 * after the first item is lowercased at the first character so a list
 * of sentence-case panel labels reads as one sentence here — the
 * labels are written for the panel, which is where they are read
 * most, and this adapts them rather than keeping a second set.
 */
function evidenceFrom(criteria: StageCriterion[]): string {
  const achievements = criteria.filter(c => !c.precondition);
  if (achievements.length === 0) return 'criteria met';
  return achievements
    .map((c, i) => (i === 0 ? c.label : c.label.charAt(0).toLowerCase() + c.label.slice(1)))
    .join(', and ');
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

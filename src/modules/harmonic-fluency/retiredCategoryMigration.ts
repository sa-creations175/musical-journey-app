/**
 * Three categories are gone. Their practice is not.
 *
 * =====================================================================
 * THE CARDS ARE THE SAME QUESTIONS UNDER NEW IDS.
 *
 * "In F major, 4 of the scale = ?" is the 4 of F. "Tritone of C?" is
 * the ♯4 of C. "G is the 5 of which major key?" is the same triangle
 * again with the key unknown. `degree-notes` asks all of them, in every
 * key and on every degree, so Named Notes, Tritone Pairs and Reverse
 * Key Pivots are folded into it — and every one of their cards but one
 * has a counterpart with the IDENTICAL ANSWER.
 *
 * Deleting them without moving their rows is the orphaning this whole
 * exercise exists to prevent. Every reader of Harmonic Fluency joins
 * attempts to the ids CURRENTLY in the catalog, so the rows would stay
 * in IndexedDB and in every backup and still read on screen as though
 * the work had never happened. That is the worst version of the
 * failure: no error, no notice, nothing to look at.
 *
 * WHAT MOVES: everything keyed to the card. The spacing row with its
 * schedule, its history and the three flags a reader wrote by hand;
 * every attempt, timestamp untouched; the skill annotation — priority,
 * tags, custom name, note; and every harmonic-diary entry. Silas's
 * ruling, in his words: "all of that should follow ideally".
 *
 * THE SCHEDULE TRAVELS, unlike the `sdm-2-down-6th` migration this
 * follows, and the difference is the reason. There the question CHANGED
 * — an interval gained a quality — so an interval earned on the old one
 * was a claim about a question that no longer existed, and it was
 * withdrawn. Here the question is asserted to be identical. A schedule
 * earned on "the 4 of F" is a schedule for "the 4 of F".
 *
 * =====================================================================
 * THE MAPPING IS DERIVED AND THEN ASSERTED. IT IS NOT A TABLE.
 *
 * The plan names a wrong mapping as the failure no test can catch: a
 * row attached to a question the reader never answered looks like
 * nothing at all on screen — the card simply reads more practised than
 * it is, and is scheduled accordingly. The only defence is that the
 * mapping proves the two cards are the same question rather than
 * asserting it.
 *
 * So a retired card is paired with a new one only where ALL of these
 * hold, and the pair is dropped where any of them does not:
 *
 *   · the ANSWER STRING is identical, character for character. Not the
 *     same pitch — the same spelling. This is the check that keeps the
 *     F♯ card out: the 4 of F♯ is B and the 4 of G♭ is C♭, one key on a
 *     keyboard and two different answers on the page.
 *   · the SUBJECT is the same key. Spelled either way — "tritone of
 *     G♯" and "the ♯4 of A♭" are one question — which is the fold-in
 *     Silas ruled in, and is why this compares pitch classes here and
 *     strings above.
 *   · where the retired card names a DEGREE, the new one names the
 *     same degree.
 *   · EXACTLY ONE new card satisfies all of that. Two would mean the
 *     question is ambiguous, and a coin toss between two cards is the
 *     wrong-mapping failure with extra steps.
 *
 * The questions themselves are NOT compared as strings, and that is the
 * one place this falls short of the words "the question is identical":
 * they are differently worded on purpose. What is compared is what the
 * question is ABOUT — a key, a degree and an answer — which is the
 * strongest checkable form of the same claim.
 *
 * A card that finds no pair KEEPS ITS ROWS WHERE THEY ARE and is
 * reported. Nothing is deleted for failing to match.
 *
 * =====================================================================
 * IDEMPOTENT BY DATA, NOT BY A FLAG — AND THIS IS THE PART THAT MUST
 * NOT BE SIMPLIFIED.
 *
 * Silas: "I use my laptop mainly for the app but I do also use my phone
 * to check things while I'm using or fixing something. And I often
 * leave my laptop and go to the gym and may do some quick drills
 * immediately after the laptop session."
 *
 * So this runs on a laptop, and then on a phone that may be minutes or
 * days behind, in either order, more than once. A stored "already ran"
 * pref would be exactly wrong: sync can deliver a legacy row from a
 * device that has not opened the app since the change, and a
 * flag-guarded pass would refuse to touch it. The mechanism is that
 * there is nothing left to find — the queries look for rows still keyed
 * on a retired id, and a second run finds none.
 *
 * NOTHING IS DELETED AND RE-INSERTED WHERE THE KEY ALLOWS AN UPDATE,
 * which is what makes the two-device case safe rather than merely
 * survivable:
 *
 *   · `spacingState` keeps its PRIMARY KEY and changes `itemRef`. The
 *     plan feared a rename here would be a delete-plus-insert, because
 *     the id is derived from the card — `sp-harmonic-fluency-both-nn-1`.
 *     It is not: every lookup goes through `[moduleRef+itemRef+hand]`
 *     and the derived id is only ever minted for a BRAND-NEW row. So
 *     the row keeps its identity, sync sees one upsert on one primary
 *     key, and the orphan sweep never sees a row go missing. Both
 *     devices hold the same row id and both move it to the same place.
 *   · `attempts` changes `itemId` — a field, indexed, never a key.
 *   · `harmonicDiaryEntries` changes `skillId` — likewise.
 *   · `skillAnnotations` IS keyed on `skillId`, so that one is a real
 *     write-then-delete. It is also the smallest table here and the one
 *     a reader has usually never written to at all.
 *
 * The one thing a lagging device can do is push a legacy row back. The
 * next run moves it again, merging rather than overwriting, so the
 * outcome is one row either way — an extra pass, not a lost history.
 *
 * =====================================================================
 * DELETED IN COMMIT 9, WITH THE TWO GENERATORS IT READS.
 *
 * `generateNamedNoteCards`, `generateTritonePairCards`,
 * `generateReversePivotCards` and `generatePivotTopUps` still exist and
 * are no longer in the deck. They are what the assertion above compares
 * AGAINST — a hand-written table could not be asserted, only trusted —
 * and they go when this goes.
 * =====================================================================
 */
import {
  FLASHCARDS, generateNamedNoteCards, generateReversePivotCards,
  generateTritonePairCards, type Flashcard,
} from './catalog';
import { generatePivotTopUps } from './catalogExpansions';
import { db, type SpacingState } from '../../lib/db';
import { pitchClassOf, toAsciiAccidentals } from '../../lib/spelling';
import { canonicalSkillId } from '../skills/registry';
import { PERFORMANCE_HISTORY_MAX } from '../../lib/spacingState';

const MODULE_REF = 'harmonic-fluency';

/**
 * Each retired category, and the question shape in `degree-notes` it
 * became.
 *
 * THE PREFIX IS A GUARD, NOT A CONVENIENCE. Named Notes and Tritone
 * Pairs both asked for a NOTE, so their rows may only land on a "name
 * it" card; Reverse Key Pivots asked for a KEY and may only land on a
 * "which key" one. The four conditions below would almost certainly
 * separate them anyway — nothing that answers a note also answers
 * "C major" — but "almost certainly" is not the standard for a table
 * that cannot be un-written.
 *
 * THE GENERATORS ARE STILL EXPORTED AND NO LONGER IN THE DECK. They are
 * what the assertion compares AGAINST; a hand-written table could only
 * be trusted. They go in commit 9 with this file.
 */
interface FoldIn {
  /** What the category used to ship. */
  cards: () => Flashcard[];
  /** The id prefix its rows are allowed to land on. */
  targetPrefix: string;
}

const FOLD_INS: ReadonlyArray<FoldIn> = [
  {
    cards: () => [...generateNamedNoteCards(), ...generateTritonePairCards()],
    targetPrefix: 'dgn-',
  },
  {
    // Twenty-four positional cards and the three root-suffixed top-ups
    // that filled the keys they missed. One category, two generators.
    cards: () => [...generateReversePivotCards(), ...generatePivotTopUps()],
    targetPrefix: 'dgk-',
  },
];

type Axis = Readonly<Record<string, string | number>> | undefined;

function axisOf(card: Flashcard): Axis {
  return (card as Flashcard & { axis?: Axis }).axis;
}

/** What a retired card is ABOUT — a key for a named note, a note for a
 *  tritone. One field or the other, never both. */
function subjectOf(card: Flashcard): string | null {
  const axis = axisOf(card);
  const value = axis?.key ?? axis?.note;
  return value === undefined ? null : String(value);
}

/** The degree a retired card names, where it names one. */
function degreeOf(card: Flashcard): string | null {
  const value = axisOf(card)?.degree;
  return value === undefined ? null : String(value);
}

/**
 * The cards the two retired categories used to ship, minus anything
 * still in the deck.
 *
 * THE SUBTRACTION IS NOT A TIDY-UP. The F♯ card survives under its own
 * id (`catalog.ts`, `F_SHARP_SURVIVOR`), so it must never be treated as
 * retired — its rows are already exactly where they belong. Filtering
 * on the live deck rather than naming it here means that if it were
 * ever dropped from the deck it would show up as a card with no pair,
 * reported, rather than quietly losing its history.
 */
export function retiredCards(): Flashcard[] {
  const live = new Set(FLASHCARDS.map(c => c.id));
  return FOLD_INS.flatMap(f => f.cards()).filter(c => !live.has(c.id));
}

/** One retired card, and the card its rows belong to. */
export interface Move { from: string; to: string }

/** One retired card whose rows stay where they are, and why. */
export interface Unpaired { from: string; reason: string }

export interface Mapping {
  moves: Move[];
  unpaired: Unpaired[];
}

/**
 * Every new card that asks what this retired one asked. Plural on
 * purpose: "exactly one" is a claim this has to be able to fail.
 */
export function pairsFor(
  card: Flashcard, targets: readonly Flashcard[],
): Flashcard[] {
  const subject = subjectOf(card);
  const pc = subject === null ? null : pitchClassOf(subject);
  if (pc === null) return [];
  const degree = degreeOf(card);
  return targets.filter(target => {
    if (!sameAnswer(target.correctAnswer, card.correctAnswer)) return false;
    const key = axisOf(target)?.key;
    if (key === undefined || pitchClassOf(String(key)) !== pc) return false;
    return degree === null || String(axisOf(target)?.degree) === degree;
  });
}

/**
 * Whether two answers are the same answer.
 *
 * =====================================================================
 * THE SAME SPELLING, WITH ITS ACCIDENTAL WRITTEN EITHER WAY.
 *
 * Still character for character — this is not a pitch comparison, and
 * F♯ and G♭ stay two different answers under it. What it folds is the
 * app's own two ways of writing ONE name: `lib/spelling.ts` says in
 * terms that ASCII `b` and `#` are the identity and ♭ and ♯ are the
 * display of the same letter, and `toAsciiAccidentals` is the function
 * it provides for exactly this.
 *
 * IT IS NEEDED BECAUSE TWO RETIRING CARDS STORE A DISPLAY GLYPH.
 * `rkp-Db-3` and `rkp-F#-4` answer "D♭ major" and "G♭ major" — display
 * characters that reached an identity string, and so reached the
 * attempts table. Comparing raw bytes would call those different
 * answers from "Db major" and "Gb major" and orphan two cards' history
 * over a typographic difference nobody made on purpose.
 *
 * IT CANNOT CAUSE A WRONG PAIRING, which is the only thing that matters
 * here: no two DIFFERENT key or note names fold onto one string under
 * it, so nothing that was distinguishable stops being so. Asserted.
 * =====================================================================
 */
export function sameAnswer(a: string, b: string): boolean {
  return toAsciiAccidentals(a) === toAsciiAccidentals(b);
}

/** Old id → new id, derived and asserted card by card. */
export function retiredCardMapping(): Mapping {
  const live = new Set(FLASHCARDS.map(c => c.id));
  const moves: Move[] = [];
  const unpaired: Unpaired[] = [];
  for (const foldIn of FOLD_INS) {
    const targets = FLASHCARDS.filter(c => c.id.startsWith(foldIn.targetPrefix));
    for (const card of foldIn.cards()) {
      if (live.has(card.id)) continue;
      const pairs = pairsFor(card, targets);
      if (pairs.length === 1) {
        moves.push({ from: card.id, to: pairs[0].id });
      } else {
        unpaired.push({
          from: card.id,
          reason: pairs.length === 0
            ? `nothing in the new family asks "${card.question}" and answers `
              + `${card.correctAnswer}`
            : `${pairs.length} cards ask it — ${pairs.map(p => p.id).join(', ')}`,
        });
      }
    }
  }
  return { moves, unpaired };
}

/** Old id → new id, as a lookup. */
export function retiredIdMap(): ReadonlyMap<string, string> {
  return new Map(retiredCardMapping().moves.map(m => [m.from, m.to]));
}

export interface MigrationReport {
  attempts: number;
  spacing: number;
  spacingMerged: number;
  annotations: number;
  diary: number;
  unpaired: Unpaired[];
}

const NOTHING = (unpaired: Unpaired[]): MigrationReport => ({
  attempts: 0, spacing: 0, spacingMerged: 0, annotations: 0, diary: 0, unpaired,
});

export async function migrateRetiredCategories(): Promise<MigrationReport> {
  const { moves, unpaired } = retiredCardMapping();
  const map = new Map(moves.map(m => [m.from, m.to]));
  if (map.size === 0) return NOTHING(unpaired);

  const skillMap = new Map(
    [...map].map(([from, to]) => [
      canonicalSkillId(MODULE_REF, 'card', from),
      canonicalSkillId(MODULE_REF, 'card', to),
    ]),
  );

  // Indexed reads, not full scans: `attempts` grows forever and this
  // runs on every app start.
  const legacyAttempts = (await db.attempts.where('moduleId').equals(MODULE_REF).toArray())
    .filter(a => map.has(a.itemId));
  const moduleSpacing = await db.spacingState.where('moduleRef').equals(MODULE_REF).toArray();
  const legacySpacing = moduleSpacing.filter(s => map.has(s.itemRef));
  const legacyAnnotations = await db.skillAnnotations
    .where('skillId').anyOf([...skillMap.keys()]).toArray();
  const legacyDiary = await db.harmonicDiaryEntries
    .where('skillId').anyOf([...skillMap.keys()]).toArray();

  // AN EARLY EXIT, NOT THE IDEMPOTENCY. Idempotency is that the four
  // queries above come back empty on a second run, because every row
  // they look for now carries a new id. Deleting this line changes
  // nothing but the cost of a boot with nothing to do.
  if (
    legacyAttempts.length === 0 && legacySpacing.length === 0
    && legacyAnnotations.length === 0 && legacyDiary.length === 0
  ) return NOTHING(unpaired);

  let spacing = 0;
  let spacingMerged = 0;
  let annotations = 0;

  await db.transaction(
    'rw',
    [db.attempts, db.spacingState, db.skillAnnotations,
      db.harmonicDiaryEntries, db.syncQueue],
    async () => {
      for (const attempt of legacyAttempts) {
        // ONLY THE ID MOVES. The timestamp is when the answer was
        // given, and rewriting it would turn a migration into a
        // falsified record.
        await db.attempts.update(attempt.id!, { itemId: map.get(attempt.itemId)! });
      }

      for (const row of legacySpacing) {
        const to = map.get(row.itemRef)!;
        const clash = moduleSpacing.find(
          r => r.itemRef === to && r.hand === row.hand && r.id !== row.id,
        );
        if (clash === undefined) {
          // THE PRIMARY KEY STAYS. See the header — this is what makes
          // the two-device case an upsert rather than a delete.
          await db.spacingState.update(row.id, { itemRef: to });
          spacing += 1;
          continue;
        }
        await db.spacingState.update(clash.id, mergedFields(clash, row));
        await db.spacingState.delete(row.id);
        spacingMerged += 1;
      }

      for (const annotation of legacyAnnotations) {
        const to = skillMap.get(annotation.skillId)!;
        const existing = await db.skillAnnotations.get(to);
        await db.skillAnnotations.put({
          ...annotation,
          ...existing,
          skillId: to,
          // A TAG IS ADDITIVE and two sets of them are one set. Every
          // other field prefers what is already on the destination,
          // because that is the more recent thought about the card, and
          // falls back to the legacy so nothing written by hand is
          // dropped.
          tags: [...new Set([...(existing?.tags ?? []), ...annotation.tags])],
          priority: existing?.priority ?? annotation.priority,
          customName: existing?.customName ?? annotation.customName,
          note: existing?.note ?? annotation.note,
          createdAt: Math.min(existing?.createdAt ?? annotation.createdAt, annotation.createdAt),
          updatedAt: Math.max(existing?.updatedAt ?? 0, annotation.updatedAt),
        });
        await db.skillAnnotations.delete(annotation.skillId);
        annotations += 1;
      }

      for (const entry of legacyDiary) {
        // NOT MERGED, AND NOT DEDUPED. A diary entry is something a
        // reader wrote; two of them against one skill is two thoughts,
        // and picking one to keep is not a migration's decision.
        await db.harmonicDiaryEntries.update(entry.entryId, {
          skillId: skillMap.get(entry.skillId)!,
        });
      }
    },
  );

  return {
    attempts: legacyAttempts.length,
    spacing,
    spacingMerged,
    annotations,
    diary: legacyDiary.length,
    unpaired,
  };
}

/**
 * Two rows for one card, folded into one.
 *
 * Only reachable AFTER this has shipped — the destination card did not
 * exist before it, so nothing could have been drilled on it. It happens
 * when a device that was behind pushes a legacy row back and the reader
 * has since drilled the new card. Histories concatenate in time order,
 * the flags OR (a flag is a request, and two requests are one), and the
 * SCHEDULE comes from whichever row was engaged with last, because that
 * is the one that reflects what the reader actually knows now.
 */
export function mergedFields(
  destination: SpacingState, legacy: SpacingState,
): Partial<SpacingState> {
  const history = [...destination.performanceHistory, ...legacy.performanceHistory]
    .sort((a, b) => Number(a.t ?? 0) - Number(b.t ?? 0))
    .slice(-PERFORMANCE_HISTORY_MAX);
  const legacyIsFresher =
    (legacy.lastEngagedAt ?? 0) > (destination.lastEngagedAt ?? 0);
  const schedule = legacyIsFresher ? legacy : destination;
  return {
    performanceHistory: history,
    lastEngagedAt: Math.max(destination.lastEngagedAt ?? 0, legacy.lastEngagedAt ?? 0),
    currentIntervalDays: schedule.currentIntervalDays,
    nextDueAt: schedule.nextDueAt,
    acquisitionStage: schedule.acquisitionStage,
    studyLater: (destination.studyLater ?? false) || (legacy.studyLater ?? false),
    reviewFlagged: (destination.reviewFlagged ?? false) || (legacy.reviewFlagged ?? false),
    reviewFlagNote: destination.reviewFlagNote ?? legacy.reviewFlagNote,
  };
}

/**
 * The console line, or null where there is nothing to say.
 *
 * A CARD WITH NO PAIR IS ALWAYS SAID, even on a run that moved nothing,
 * because it is the one outcome nobody would otherwise see.
 */
export function describeRetiredCategoryMigration(
  r: MigrationReport,
): string | null {
  const moved = r.attempts + r.spacing + r.spacingMerged + r.annotations + r.diary;
  if (moved === 0 && r.unpaired.length === 0) return null;
  const parts = [
    `[hf] retired categories: ${r.attempts} attempt(s), `
    + `${r.spacing} spacing row(s) repointed, ${r.spacingMerged} merged, `
    + `${r.annotations} annotation(s), ${r.diary} diary entr(ies) moved`,
  ];
  for (const u of r.unpaired) {
    parts.push(`[hf] ${u.from} keeps its rows where they are — ${u.reason}`);
  }
  return parts.join('\n');
}

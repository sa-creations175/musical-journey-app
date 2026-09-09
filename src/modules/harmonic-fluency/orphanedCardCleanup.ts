/**
 * The rows under a card that left the deck with no successor.
 *
 * =====================================================================
 * 6/♭7 WENT, AND ITS PRACTICE DID NOT.
 *
 * Ruling 30 took the 6/♭7 shape out of the slash deck: eleven generated
 * cards and the hand-written C one. The cards are gone from the
 * catalog. Their `spacingState` rows, their attempts, their skill
 * annotations and their diary entries are not — they live in a
 * database the catalog cannot reach, keyed on ids nothing looks up any
 * more.
 *
 * THIS IS THE OPPOSITE CASE TO `retiredCategoryMigration`, AND THE
 * DIFFERENCE DECIDES EVERYTHING. There, the cards were the same
 * questions under new ids, so the rows MOVED. Here there is no
 * successor: nothing else in the deck asks what 6/♭7 in E♭ is, and a
 * schedule earned on a question the deck no longer asks is a schedule
 * for nothing. So the rows go.
 *
 * =====================================================================
 * IT REFUSES BEFORE IT DELETES.
 *
 * The authorised shape is written down: these twelve ids, none of which
 * may be in the live deck. If one of them is back — a shape restored, a
 * ruling reversed — this is being asked to delete the history of a card
 * a reader can still be shown, which is a different operation than the
 * one that was agreed to. It refuses the whole pass and says so.
 *
 * AND IT LEAVES ANYTHING HAND-WRITTEN WHERE IT IS. A study-later
 * toggle, a review flag, a flag note, a priority, a tag, a custom name,
 * a private note, a diary entry — none of those is derivable from
 * anything. They are a reader's own words about a card, and deleting
 * them is a decision rather than a cleanup. Such a row is kept and
 * REPORTED, every run, until somebody decides. The schedule beside it
 * is kept too: splitting a row in half to delete the derivable part
 * would leave a flag pointing at a history that no longer exists.
 *
 * =====================================================================
 * IDEMPOTENT BY DATA, NOT BY A PREF — AND THIS IS THE PART THAT MUST
 * NOT BE SIMPLIFIED.
 *
 * `retiredCategoryMigration` states the reason at length and it holds
 * exactly here: a laptop and a phone, minutes or days apart, in either
 * order, more than once. A stored "already ran" flag would refuse to
 * touch a legacy row that arrived by SYNC from the device that had not
 * opened the app since the change — and that row is precisely the one
 * this exists to remove. The mechanism is that there is nothing left to
 * find: the queries look for rows still keyed on a removed id, and a
 * second run finds none.
 *
 * The deletes go through Dexie, so the `deleting` hook enqueues them
 * for every synced table and the other device loses the rows too rather
 * than pushing them back for ever.
 * =====================================================================
 */
import { db } from '../../lib/db';
import { FLASHCARDS } from './catalog';
import { canonicalSkillId } from '../skills/registry';

const MODULE_REF = 'harmonic-fluency';

/**
 * The cards removed with no successor, and the exact set this is
 * authorised to delete rows for.
 *
 * WRITTEN OUT RATHER THAN DERIVED. There is nothing left in the repo to
 * derive them from — the shape is gone from `SLASH_SHAPES` and the
 * hand-written card is gone from the catalog — and a list that could be
 * re-derived from a changing catalog is a list that could grow without
 * anybody agreeing to it. This is the authorisation; it is meant to be
 * unable to widen on its own.
 */
export const REMOVED_WITHOUT_SUCCESSOR: ReadonlyArray<string> = [
  // The 6/♭7 shape (ruling 30).
  'sc-11',
  'sc-6-b7-Db', 'sc-6-b7-D', 'sc-6-b7-Eb', 'sc-6-b7-E', 'sc-6-b7-F',
  'sc-6-b7-F#', 'sc-6-b7-G', 'sc-6-b7-Ab', 'sc-6-b7-A', 'sc-6-b7-Bb',
  'sc-6-b7-B',
  // THE TWO THAT NAMED TWO KEYS AT ONCE (commit 8). "A key with 3
  // flats is most likely E♭ major or C minor" answers with both and
  // then tells the reader to look at the final chord to tell which —
  // two facts and a disambiguation rule in one option string, with
  // nothing in it to get right or wrong. Two cards replace it, one per
  // mode, and neither asks that question or gives that answer, so
  // `keySignatureFoldIn` reports them unpaired rather than guessing.
  'ks-19', 'ks-20',
  // THE FIVE PENTATONIC FORMULA CARDS (commit 8). "What 5 notes make
  // up the major pentatonic scale?" answers a shape a reader can
  // recite without playing it in a single key; the per-key notes cards
  // ask the same thing where it counts.
  'pent-1', 'pent-2', 'pent-5', 'pent-6', 'pent-9',
  // AND THE TWELVE "SHARE THE SAME _____" CARDS. They answered "5
  // notes (identical pitch set)" — a fact about a definition. The card
  // that replaces them asks which minor pentatonic to play over a
  // major key, which is a different question with a different answer,
  // so `pentatonicFoldIn` refuses to move a row rather than guessing.
  'pent-10',
  'pent-relative-Db', 'pent-relative-D', 'pent-relative-Eb',
  'pent-relative-E', 'pent-relative-F', 'pent-relative-F#',
  'pent-relative-G', 'pent-relative-Ab', 'pent-relative-A',
  'pent-relative-Bb', 'pent-relative-B',
  // THE FIFTEEN INVERSION FACT CARDS (9 Sep 2026). "A Major 3rd
  // inverted is a _____", "an interval and its inversion always add up
  // to _____", "when an interval inverts, its quality _____". The skill
  // is the relationship between two notes on the keyboard, both ways,
  // and the interval grid asks both directions of every pair already —
  // A up to F♯ is a Major 6th and F♯ up to A is a minor 3rd are two
  // cards it has. What these fifteen asked is explanation, and it moved
  // into the reveal of every interval card rather than being drilled as
  // a fact of its own. Nothing replaces them, so nothing pairs.
  'iv-inv-of-unison', 'iv-inv-of-octave', 'iv-inv-of-minor-2nd',
  'iv-inv-of-major-7th', 'iv-inv-of-major-2nd', 'iv-inv-of-minor-7th',
  'iv-inv-of-minor-3rd', 'iv-inv-of-major-6th', 'iv-inv-of-major-3rd',
  'iv-inv-of-minor-6th', 'iv-inv-of-perfect-4th', 'iv-inv-of-perfect-5th',
  'iv-inv-of-tritone', 'iv-inv-sum', 'iv-inv-quality-rule',
  // FOUR ONE-KEY PROGRESSION CARDS (9 Sep 2026). A progression is in
  // every key or it is not in the deck: the descending minor walk-down
  // in A minor, the Dorian vamp in D, 4-1-5-6 in D (a rotation of the
  // 1-5-6-4 that IS in every key) and 1-♭7-4 in C. No generated card
  // asks what any of them asks, so nothing pairs. See
  // `REMOVED_PROGRESSION_IDS` for the reasoning card by card; the
  // plagal vamp names no key and is the exception that stays.
  'pr-11', 'pr-14', 'pr-15', 'pr-20',
  // AND THE BOSSA TURNAROUND (9 Sep 2026). `pr-13` was I-VI-ii-V in F
  // with the VI played as a secondary dominant — the dominant-6
  // variation of the 1-6-2-5, which is generated in thirteen keys. It
  // will live as a variation on that card rather than as a progression
  // of its own.
  'pr-13',
  // THE FOUR GENERATED SETS THAT DID NOT SURVIVE THE FAMILY BEING READ
  // IN FULL (9 Sep 2026). A progression Silas has no reference for yet
  // does not earn thirteen cards — the gospel walk-up, rhythm changes
  // and the neo-soul cycle. `6-4-1-5` went for a different reason: it
  // is the 1-5-6-4 loop started in a different place, and `pr-9`
  // teaches that rotation as a fact on its own.
  //
  // AND THE FOUR HAND-WRITTEN CARDS THEY FOLDED IN FROM, because the
  // history is in two places. A device that ran commit 8's fold-in
  // holds it under the generated id; one that has not still holds it
  // under `pr-5`. Listing both sides is what makes the deletion
  // complete on either.
  'pr-4', 'pr-5', 'pr-6', 'pr-10',
  'pr-prog-6-4-1-5-C', 'pr-prog-6-4-1-5-Db', 'pr-prog-6-4-1-5-D',
  'pr-prog-6-4-1-5-Eb', 'pr-prog-6-4-1-5-E', 'pr-prog-6-4-1-5-F',
  'pr-prog-6-4-1-5-F#', 'pr-prog-6-4-1-5-Gb', 'pr-prog-6-4-1-5-G',
  'pr-prog-6-4-1-5-Ab', 'pr-prog-6-4-1-5-A', 'pr-prog-6-4-1-5-Bb',
  'pr-prog-6-4-1-5-B',
  'pr-prog-gospel-walk-up-C', 'pr-prog-gospel-walk-up-Db',
  'pr-prog-gospel-walk-up-D', 'pr-prog-gospel-walk-up-Eb',
  'pr-prog-gospel-walk-up-E', 'pr-prog-gospel-walk-up-F',
  'pr-prog-gospel-walk-up-F#', 'pr-prog-gospel-walk-up-Gb',
  'pr-prog-gospel-walk-up-G', 'pr-prog-gospel-walk-up-Ab',
  'pr-prog-gospel-walk-up-A', 'pr-prog-gospel-walk-up-Bb',
  'pr-prog-gospel-walk-up-B',
  'pr-prog-rhythm-changes-C', 'pr-prog-rhythm-changes-Db',
  'pr-prog-rhythm-changes-D', 'pr-prog-rhythm-changes-Eb',
  'pr-prog-rhythm-changes-E', 'pr-prog-rhythm-changes-F',
  'pr-prog-rhythm-changes-F#', 'pr-prog-rhythm-changes-Gb',
  'pr-prog-rhythm-changes-G', 'pr-prog-rhythm-changes-Ab',
  'pr-prog-rhythm-changes-A', 'pr-prog-rhythm-changes-Bb',
  'pr-prog-rhythm-changes-B',
  'pr-prog-neo-soul-C', 'pr-prog-neo-soul-Db', 'pr-prog-neo-soul-D',
  'pr-prog-neo-soul-Eb', 'pr-prog-neo-soul-E', 'pr-prog-neo-soul-F',
  'pr-prog-neo-soul-F#', 'pr-prog-neo-soul-Gb', 'pr-prog-neo-soul-G',
  'pr-prog-neo-soul-Ab', 'pr-prog-neo-soul-A', 'pr-prog-neo-soul-Bb',
  'pr-prog-neo-soul-B',
];

/** One card whose rows are kept, and what a reader wrote on it. */
export interface HeldBack {
  cardId: string;
  /** The hand-written fields found, named so the console line says
   *  what is being protected rather than only that something is. */
  authored: string[];
}

export interface OrphanCleanupReport {
  /** Why the whole pass did not run, or null when it did. */
  refused: string | null;
  attemptsDeleted: number;
  spacingDeleted: number;
  annotationsDeleted: number;
  diaryDeleted: number;
  /** Rows a reader wrote on. Kept, and said out loud every run. */
  heldBack: HeldBack[];
}

const NOTHING: OrphanCleanupReport = {
  refused: null,
  attemptsDeleted: 0,
  spacingDeleted: 0,
  annotationsDeleted: 0,
  diaryDeleted: 0,
  heldBack: [],
};

/**
 * Why this may not run at all, or null when it may.
 *
 * Pure, so the rule can be read and tested without a database.
 */
export function refusalFor(liveIds: ReadonlySet<string>): string | null {
  const back = REMOVED_WITHOUT_SUCCESSOR.filter(id => liveIds.has(id));
  if (back.length === 0) return null;
  return `${back.join(', ')} ${back.length === 1 ? 'is' : 'are'} in the deck `
    + 'again — this was authorised to delete the history of cards that had '
    + 'LEFT, and a card a reader can still be shown is a different decision';
}

/** What a reader wrote by hand on a spacing row. */
export function authoredOnSpacing(row: {
  studyLater?: boolean; reviewFlagged?: boolean; reviewFlagNote?: string;
}): string[] {
  const found: string[] = [];
  if (row.studyLater === true) found.push('studyLater');
  if (row.reviewFlagged === true) found.push('reviewFlagged');
  if (typeof row.reviewFlagNote === 'string' && row.reviewFlagNote !== '') {
    found.push('reviewFlagNote');
  }
  return found;
}

/** What a reader wrote by hand on a skill annotation. An annotation
 *  with nothing set is a row the app made, not a thought. */
export function authoredOnAnnotation(row: {
  priority?: unknown; tags?: readonly unknown[];
  customName?: string; note?: string;
}): string[] {
  const found: string[] = [];
  if (row.priority !== undefined) found.push('priority');
  if ((row.tags?.length ?? 0) > 0) found.push('tags');
  if (typeof row.customName === 'string' && row.customName !== '') {
    found.push('customName');
  }
  if (typeof row.note === 'string' && row.note !== '') found.push('note');
  return found;
}

export async function cleanUpOrphanedCards(): Promise<OrphanCleanupReport> {
  const liveIds = new Set(FLASHCARDS.map(c => c.id));
  const refused = refusalFor(liveIds);
  if (refused !== null) {
    console.warn('[hf] orphaned-card cleanup refused:', refused);
    return { ...NOTHING, refused };
  }

  const removed = new Set(REMOVED_WITHOUT_SUCCESSOR);
  const skillIdOf = new Map(
    REMOVED_WITHOUT_SUCCESSOR.map(
      id => [canonicalSkillId(MODULE_REF, 'card', id), id] as const,
    ),
  );

  // Indexed reads, not full scans: `attempts` grows for ever and this
  // runs on every app start.
  const attempts = (await db.attempts.where('moduleId').equals(MODULE_REF).toArray())
    .filter(a => removed.has(a.itemId));
  const spacing = (await db.spacingState.where('moduleRef').equals(MODULE_REF).toArray())
    .filter(s => removed.has(s.itemRef));
  const annotations = await db.skillAnnotations
    .where('skillId').anyOf([...skillIdOf.keys()]).toArray();
  const diary = await db.harmonicDiaryEntries
    .where('skillId').anyOf([...skillIdOf.keys()]).toArray();

  // AN EARLY EXIT, NOT THE IDEMPOTENCY. Idempotency is that these four
  // queries come back empty on a second run, because the rows they look
  // for are gone. Deleting this changes nothing but the cost of a boot
  // with nothing to do.
  if (attempts.length === 0 && spacing.length === 0
    && annotations.length === 0 && diary.length === 0) return NOTHING;

  /**
   * Which cards a reader has written on. A DIARY ENTRY MAKES THE WHOLE
   * CARD HELD BACK: an entry is a paragraph somebody typed, and there
   * is no version of "clean up" that throws one away.
   */
  const authoredBy = new Map<string, Set<string>>();
  const hold = (cardId: string, fields: readonly string[]) => {
    if (fields.length === 0) return;
    const set = authoredBy.get(cardId) ?? new Set<string>();
    for (const f of fields) set.add(f);
    authoredBy.set(cardId, set);
  };
  for (const row of spacing) hold(row.itemRef, authoredOnSpacing(row));
  for (const row of annotations) {
    hold(skillIdOf.get(row.skillId)!, authoredOnAnnotation(row));
  }
  for (const row of diary) hold(skillIdOf.get(row.skillId)!, ['diaryEntry']);

  const held = (cardId: string) => authoredBy.has(cardId);

  let attemptsDeleted = 0;
  let spacingDeleted = 0;
  let annotationsDeleted = 0;
  let diaryDeleted = 0;

  await db.transaction(
    'rw',
    [db.attempts, db.spacingState, db.skillAnnotations,
      db.harmonicDiaryEntries, db.syncQueue],
    async () => {
      for (const row of attempts) {
        if (held(row.itemId)) continue;
        await db.attempts.delete(row.id!);
        attemptsDeleted += 1;
      }
      for (const row of spacing) {
        if (held(row.itemRef)) continue;
        await db.spacingState.delete(row.id);
        spacingDeleted += 1;
      }
      for (const row of annotations) {
        if (held(skillIdOf.get(row.skillId)!)) continue;
        await db.skillAnnotations.delete(row.skillId);
        annotationsDeleted += 1;
      }
      // Nothing deletes a diary entry — reaching one is what makes its
      // card held back. The loop exists so the count is honest.
      diaryDeleted = 0;
    },
  );

  return {
    refused: null,
    attemptsDeleted,
    spacingDeleted,
    annotationsDeleted,
    diaryDeleted,
    heldBack: [...authoredBy]
      .map(([cardId, fields]) => ({ cardId, authored: [...fields].sort() }))
      .sort((a, b) => a.cardId.localeCompare(b.cardId)),
  };
}

/**
 * The console line, or null where there is nothing to say.
 *
 * A HELD-BACK CARD IS ALWAYS SAID, on every run, because it is the one
 * outcome nobody would otherwise see and the one that still needs a
 * decision.
 */
export function describeOrphanCleanup(r: OrphanCleanupReport): string | null {
  if (r.refused !== null) return `[hf] orphaned-card cleanup REFUSED — ${r.refused}`;
  const deleted = r.attemptsDeleted + r.spacingDeleted + r.annotationsDeleted;
  if (deleted === 0 && r.heldBack.length === 0) return null;
  const parts: string[] = [];
  if (deleted > 0) {
    parts.push(
      '[hf] 6/♭7 left the deck: deleted '
      + `${r.attemptsDeleted} attempt(s), ${r.spacingDeleted} spacing row(s), `
      + `${r.annotationsDeleted} annotation(s)`,
    );
  }
  for (const h of r.heldBack) {
    parts.push(
      `[hf] ${h.cardId} keeps its rows — ${h.authored.join(', ')} written by `
      + 'hand, which is a decision rather than a cleanup',
    );
  }
  return parts.join('\n');
}

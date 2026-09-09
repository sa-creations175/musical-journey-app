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
 * The twelve cards removed with the 6/♭7 shape (ruling 30), and the
 * exact set this is authorised to delete rows for.
 *
 * WRITTEN OUT RATHER THAN DERIVED. There is nothing left in the repo to
 * derive them from — the shape is gone from `SLASH_SHAPES` and the
 * hand-written card is gone from the catalog — and a list that could be
 * re-derived from a changing catalog is a list that could grow without
 * anybody agreeing to it. This is the authorisation; it is meant to be
 * unable to widen on its own.
 */
export const REMOVED_WITHOUT_SUCCESSOR: ReadonlyArray<string> = [
  'sc-11',
  'sc-6-b7-Db', 'sc-6-b7-D', 'sc-6-b7-Eb', 'sc-6-b7-E', 'sc-6-b7-F',
  'sc-6-b7-F#', 'sc-6-b7-G', 'sc-6-b7-Ab', 'sc-6-b7-A', 'sc-6-b7-Bb',
  'sc-6-b7-B',
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

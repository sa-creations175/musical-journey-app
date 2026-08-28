/**
 * What a flashcard module asks the spacing engine.
 *
 * =====================================================================
 * THE READS THAT USED TO GO TO `flashcardStates`.
 *
 * Every flashcard surface needed four things off a card: is it due, has
 * it been seen, is it starred, is it review-flagged. Three of those came
 * from an SM-2 row that ran its own schedule beside the real one, and
 * the two schedules could — and did — disagree about the same card.
 *
 * They all come from `spacingState` now. This file is the only place
 * that knows how a flashcard id maps onto a spacing row, so the drill
 * queue, the flag pills and the due counts cannot drift apart again by
 * each deriving it their own way.
 * =====================================================================
 *
 * WHAT IS NOT HERE, DELIBERATELY: the schedule itself. Nothing in this
 * file decides when a card comes back — `recordEngagement` does, from
 * the answer. These are reads, plus the two user-authored flags that
 * are not derivable from anything and so have to be written somewhere.
 */

import { db, type SpacingState } from '../db';
import { getMemoryType } from '../memoryType';
import { putSpacingState } from '../practiceWrites';

/** Vocabulary namespaces its card ids; everything else in the deck
 *  tables is harmonic fluency. */
const VOCAB_CARD_ID_PREFIX = 'prod-vocab:';

/**
 * Which spacing moduleRef a flashcard id belongs to.
 *
 * ONE DEFINITION, IMPORTED BY THE MIGRATION TOO. The migration has to
 * file a carried-over row under exactly the ref the live code will look
 * it up by; two copies of this rule is two chances for a card to be
 * written to one address and read from another, which reads on screen
 * as the card having no history at all.
 */
export function moduleRefForCardId(cardId: string): string {
  return cardId.startsWith(VOCAB_CARD_ID_PREFIX)
    ? 'production-vocabulary'
    : 'harmonic-fluency';
}

/**
 * A spacing row for a card that has none, carrying nothing but flags.
 *
 * =====================================================================
 * STAGE `new`, NOT `acquiring`, AND THE DIFFERENCE IS NOT COSMETIC.
 *
 * Flagging a card you have never answered has to put the flag
 * somewhere — dropping it silently because no row exists would lose
 * something the reader deliberately said. But `acquiring` means first
 * meaningful engagement, and goal coverage counts it. A card you
 * starred and never played is not practice, and must not be counted as
 * any.
 *
 * `new` is the stage that says exactly that: the row exists, and
 * nothing has happened on it. `nextDueAt` stays null for the same
 * reason — an unanswered card is not overdue, it is unseen, and the
 * queue below sorts it with the other unseen ones.
 * =====================================================================
 */
function blankCardSpacing(cardId: string, moduleRef: string): SpacingState {
  return {
    id: crypto.randomUUID(),
    itemRef: cardId,
    moduleRef,
    hand: 'both',
    memoryType: getMemoryType(moduleRef),
    acquisitionStage: 'new',
    currentIntervalDays: 0,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
  };
}

/** The row for one card, or undefined when it has none. */
export async function getCardSpacing(
  cardId: string,
): Promise<SpacingState | undefined> {
  return db.spacingState
    .where('[moduleRef+itemRef+hand]')
    .equals([moduleRefForCardId(cardId), cardId, 'both'])
    .first();
}

/**
 * Rows for many cards at once, keyed by card id.
 *
 * ONE QUERY PER MODULE REF rather than one per card. The callers are
 * live queries that re-run on every write to the table, and a
 * per-card round trip over a 300-card catalog is what made the old
 * eager due-count slow enough to cross a task boundary.
 *
 * Cards with no row are absent from the map rather than present as
 * undefined, so `has()` answers "seen at all?" directly.
 */
export async function getCardSpacingMany(
  cardIds: ReadonlyArray<string>,
): Promise<Map<string, SpacingState>> {
  const out = new Map<string, SpacingState>();
  if (cardIds.length === 0) return out;

  const wanted = new Set(cardIds);
  const refs = new Set(cardIds.map(moduleRefForCardId));
  for (const moduleRef of refs) {
    const rows = await db.spacingState
      .where('moduleRef').equals(moduleRef)
      .toArray();
    for (const row of rows) {
      if (row.hand !== 'both') continue;
      if (!wanted.has(row.itemRef)) continue;
      out.set(row.itemRef, row);
    }
  }
  return out;
}

/**
 * Is this row due, as the queue means it?
 *
 * A null `nextDueAt` is NOT due. It means unscheduled — a flag-only
 * row, or a row seeded by a backfill — and the queue treats unscheduled
 * as unseen rather than as overdue. Reading null as "due since the
 * epoch" would put every flag-only card at the front of every session.
 */
export function isCardDue(row: SpacingState | undefined, now: number): boolean {
  return row?.nextDueAt != null && row.nextDueAt <= now;
}

/**
 * Has this card been answered at all?
 *
 * The ROW is not the answer to that question — a flag-only row exists
 * without a single rep behind it. `acquisitionStage === 'new'` is what
 * says nothing has happened, so it reads as untouched here exactly as
 * it does in coverage.
 */
export function isCardSeen(row: SpacingState | undefined): boolean {
  return row !== undefined && row.acquisitionStage !== 'new';
}

/**
 * Sort key for the practice-ahead queue — nearest due first.
 *
 * Unscheduled rows sort LAST rather than first. They are the cards
 * with no schedule to be ahead of, and putting them at the front would
 * make "you are ahead of schedule, here is what is closest" open with
 * the cards furthest from having one.
 */
export function dueSortKey(row: SpacingState | undefined): number {
  return row?.nextDueAt ?? Number.POSITIVE_INFINITY;
}

// --- The two user-authored flags -------------------------------------
//
// Neither is derivable from anything: `attempts` can rebuild every
// counter the old SM-2 row carried, and cannot rebuild a decision the
// reader made about a card. They moved onto the spacing row with the
// table rather than being dropped.

/** Read-modify-write one card's row, creating a flag-only row when it
 *  has none. Returns the row as written. */
async function patchCardSpacing(
  cardId: string,
  patch: Partial<SpacingState>,
): Promise<SpacingState> {
  const moduleRef = moduleRefForCardId(cardId);
  const existing = await getCardSpacing(cardId);
  const next: SpacingState = {
    ...(existing ?? blankCardSpacing(cardId, moduleRef)),
    ...patch,
  };
  await putSpacingState(next);
  return next;
}

/** Flip the study-later star. Returns its new value. */
export async function toggleStudyLater(cardId: string): Promise<boolean> {
  const current = await getCardSpacing(cardId);
  const next = !(current?.studyLater ?? false);
  await patchCardSpacing(cardId, { studyLater: next });
  return next;
}

/**
 * Set the review-meta flag, with an optional note saying why.
 *
 * Clearing it drops the note too — a note explaining a flag that is no
 * longer set describes nothing.
 */
export async function setReviewFlag(
  cardId: string,
  flagged: boolean,
  note?: string,
): Promise<void> {
  const trimmed = note?.trim();
  await patchCardSpacing(cardId, flagged
    ? { reviewFlagged: true, reviewFlagNote: trimmed || undefined }
    : { reviewFlagged: false, reviewFlagNote: undefined });
}

/** Every review-flagged card in a module, most recently engaged first.
 *  Never-engaged rows sort last rather than as the epoch. */
export async function listReviewFlagged(
  moduleRef: string,
): Promise<SpacingState[]> {
  const rows = await db.spacingState
    .where('moduleRef').equals(moduleRef)
    .filter(r => r.reviewFlagged === true)
    .toArray();
  return rows.sort((a, b) => (b.lastEngagedAt ?? 0) - (a.lastEngagedAt ?? 0));
}

/** How many cards in a module carry the study-later star. */
export async function countStudyLater(moduleRef: string): Promise<number> {
  return db.spacingState
    .where('moduleRef').equals(moduleRef)
    .filter(r => r.studyLater === true)
    .count();
}

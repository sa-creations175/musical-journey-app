/**
 * Moving everything a card owns onto another card.
 *
 * =====================================================================
 * ONE MECHANISM, TWO FOLD-INS, AND A THIRD WILL COME.
 *
 * `retiredCategoryMigration` wrote this first, for Named Notes and
 * Tritone Pairs folding into `degree-notes`. Ruling 37 folds three
 * hand-written slash cards into their generated twins, which is a
 * different PROOF over the same MACHINERY — and a second copy of "move
 * the spacing row, the attempts, the annotation and the diary" is the
 * copy that falls behind on the day one of the four tables changes.
 *
 * So the proof stays with each fold-in, where it belongs, and the
 * moving lives here.
 *
 * =====================================================================
 * NOTHING IS DELETED AND RE-INSERTED WHERE THE KEY ALLOWS AN UPDATE,
 * which is what makes the two-device case safe rather than merely
 * survivable:
 *
 *   · `spacingState` KEEPS ITS PRIMARY KEY and changes `itemRef`. The
 *     derived id looks like it depends on the card —
 *     `sp-harmonic-fluency-both-nn-1` — but every lookup goes through
 *     `[moduleRef+itemRef+hand]` and the derived id is only ever minted
 *     for a brand-new row. So the row keeps its identity, sync sees one
 *     upsert on one primary key, and the orphan sweep never sees a row
 *     go missing. Both devices hold the same row id and both move it to
 *     the same place.
 *   · `attempts` changes `itemId` — a field, indexed, never a key.
 *   · `harmonicDiaryEntries` changes `skillId` — likewise.
 *   · `skillAnnotations` IS keyed on `skillId`, so that one is a real
 *     write-then-delete. It is also the smallest table here and the one
 *     a reader has usually never written to at all.
 *
 * =====================================================================
 * IDEMPOTENT BY DATA, NOT BY A FLAG. The queries look for rows still
 * keyed on a source id, and a second run finds none. A stored "already
 * ran" pref would refuse to touch a legacy row that arrived by sync
 * from a device that had not opened the app since the change — and that
 * row is exactly what this exists to move. The one thing a lagging
 * device can do is push a legacy row back; the next run moves it again,
 * MERGING rather than overwriting, so the outcome is one row either
 * way — an extra pass, not a lost history.
 * =====================================================================
 */
import { db, type SpacingState } from '../../lib/db';
import { canonicalSkillId } from '../skills/registry';
import { PERFORMANCE_HISTORY_MAX } from '../../lib/spacingState';

const MODULE_REF = 'harmonic-fluency';

export interface MovedRows {
  attempts: number;
  spacing: number;
  spacingMerged: number;
  annotations: number;
  diary: number;
}

export const NOTHING_MOVED: MovedRows = {
  attempts: 0, spacing: 0, spacingMerged: 0, annotations: 0, diary: 0,
};

export function movedTotal(r: MovedRows): number {
  return r.attempts + r.spacing + r.spacingMerged + r.annotations + r.diary;
}

/**
 * Everything keyed to each source card, moved onto its destination.
 *
 * The caller supplies a mapping it has PROVEN — that the two cards are
 * the same question — because a wrong pair attaches a history to a
 * question the reader never answered, and nothing looks broken: the
 * card simply reads more practised than it is and is scheduled
 * accordingly. This function does not check that and could not.
 */
export async function moveCardRows(
  map: ReadonlyMap<string, string>,
): Promise<MovedRows> {
  if (map.size === 0) return NOTHING_MOVED;

  const skillMap = new Map(
    [...map].map(([from, to]) => [
      canonicalSkillId(MODULE_REF, 'card', from),
      canonicalSkillId(MODULE_REF, 'card', to),
    ]),
  );

  // Indexed reads, not full scans: `attempts` grows for ever and this
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
  ) return NOTHING_MOVED;

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
  };
}

/**
 * Two rows for one card, folded into one.
 *
 * Only reachable AFTER a fold-in has shipped — the destination card did
 * not exist before it, or was not the destination — so nothing could
 * have been drilled on it. It happens when a device that was behind
 * pushes a legacy row back and the reader has since drilled the new
 * card. Histories concatenate in time order, the flags OR (a flag is a
 * request, and two requests are one), and the SCHEDULE comes from
 * whichever row was engaged with last, because that is the one that
 * reflects what the reader actually knows now.
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

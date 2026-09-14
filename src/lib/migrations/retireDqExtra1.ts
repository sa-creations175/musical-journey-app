/**
 * `dq-extra-1` folds into `dq-maj-4`. Silas's answer of 14 Sep 2026 to
 * the Diatonic Chord Qualities report (`~/cc-scratch/
 * ANSWERS_TAB1_MINOR_QUALITIES.md`): "retire it. Fold its history the way
 * retired cards are folded."
 *
 * =====================================================================
 * WHY `dq-maj-4`.
 *
 * `dq-extra-1` asked for major's 4 as a triad — the triad-only card the
 * 13 Sep decision ruled out. `dq-maj-4` asks for the same chord on the
 * same degree of the same scale, as the seventh chord the deck is built
 * on, and its reveal opens the chart on the very cell `dq-extra-1`'s did.
 * A reader who answered one has practised the other. That choice is
 * Claude's, and the report says so.
 *
 * =====================================================================
 * THE WAY RETIRED CARDS ARE FOLDED is `migrations/retire913.ts`, the
 * Chord Recognition fold of 11 Sep: one idempotent pass, run once as a
 * Dexie upgrade, rows MERGED where the reader has history on both cards,
 * nothing hand-written dropped, two pieces of written text never
 * overwriting each other. Its merge rules are imported rather than
 * restated, so the two folds cannot come to disagree about what "further
 * along" or "sooner due" means.
 *
 * A Harmonic Fluency card keys its history on the card id itself — an
 * attempt's `itemId`, a spacing row's `itemRef`, a past practice block's
 * `itemRefs`, a goal's carried-over `relatedItems` — and its diary entry
 * and annotation on the skill id `harmonic-fluency:card:<id>`. Those are
 * the six places this moves. The ids are written out rather than read
 * from the catalog, for the reason `retire913.ts` gives: a migration has
 * to keep working against the data it was written for.
 * =====================================================================
 */
import {
  mergeAnnotation, mergeDiary, mergeSpacing, type MigrationTx,
} from './retire913';

export const RETIRED_CARD = 'dq-extra-1';
export const TARGET_CARD = 'dq-maj-4';

const MODULE_REF = 'harmonic-fluency';
const SKILL_PREFIX = `${MODULE_REF}:card:`;
const RETIRED_SKILL = `${SKILL_PREFIX}${RETIRED_CARD}`;
const TARGET_SKILL = `${SKILL_PREFIX}${TARGET_CARD}`;

type Row = Record<string, unknown>;

export interface CardFoldCounts {
  attempts: number;
  spacingMoved: number;
  spacingMerged: number;
  diaryMoved: number;
  diaryMerged: number;
  annotations: number;
  goals: number;
  blocks: number;
}

/**
 * Move everything filed under `dq-extra-1` onto `dq-maj-4`. Idempotent:
 * a second run finds nothing under the retired id and changes nothing.
 */
export async function foldRetiredDiatonicCard(tx: MigrationTx): Promise<CardFoldCounts> {
  const counts: CardFoldCounts = {
    attempts: 0, spacingMoved: 0, spacingMerged: 0, diaryMoved: 0,
    diaryMerged: 0, annotations: 0, goals: 0, blocks: 0,
  };

  // 1. attempts — every row has its own id, so a rewrite never collides.
  const attempts = (await tx.table('attempts').toArray()) as Row[];
  for (const row of attempts) {
    if (row.moduleId !== MODULE_REF || row.itemId !== RETIRED_CARD) continue;
    await tx.table('attempts').update(String(row.id), { itemId: TARGET_CARD });
    counts.attempts += 1;
  }

  // 2. spacingState — one row per [moduleRef + itemRef + hand]; a fold
  //    onto a slot the reader already has is a merge, never a drop.
  const spacing = (await tx.table('spacingState').toArray()) as Row[];
  const slot = (r: Row, ref: string) => `${ref}|${String(r.hand)}`;
  const targets = new Map<string, Row>();
  for (const row of spacing) {
    if (row.moduleRef === MODULE_REF && row.itemRef === TARGET_CARD) targets.set(slot(row, TARGET_CARD), row);
  }
  for (const row of spacing) {
    if (row.moduleRef !== MODULE_REF || row.itemRef !== RETIRED_CARD) continue;
    const target = targets.get(slot(row, TARGET_CARD));
    if (target === undefined) {
      // THE ROW'S ID IS LEFT ALONE: it is the sync key.
      await tx.table('spacingState').update(String(row.id), { itemRef: TARGET_CARD });
      targets.set(slot(row, TARGET_CARD), { ...row, itemRef: TARGET_CARD });
      counts.spacingMoved += 1;
    } else {
      await tx.table('spacingState').update(String(target.id), mergeSpacing(target, row));
      await tx.table('spacingState').delete(String(row.id));
      counts.spacingMerged += 1;
    }
  }

  // 3. harmonicDiaryEntries — one entry per skill.
  const entries = (await tx.table('harmonicDiaryEntries').toArray()) as Row[];
  const retiredEntry = entries.find(e => e.skillId === RETIRED_SKILL);
  if (retiredEntry !== undefined) {
    const target = entries.find(e => e.skillId === TARGET_SKILL);
    if (target === undefined) {
      await tx.table('harmonicDiaryEntries').update(String(retiredEntry.entryId), { skillId: TARGET_SKILL });
      counts.diaryMoved += 1;
    } else {
      await tx.table('harmonicDiaryEntries').update(String(target.entryId), mergeDiary(target, retiredEntry));
      await tx.table('harmonicDiaryEntries').delete(String(retiredEntry.entryId));
      counts.diaryMerged += 1;
    }
  }

  // 4. skillAnnotations — keyed ON the skill id, so a move is a new row
  //    and a delete.
  const retiredNote = (await tx.table('skillAnnotations').get(RETIRED_SKILL)) as Row | undefined;
  if (retiredNote !== undefined) {
    const target = (await tx.table('skillAnnotations').get(TARGET_SKILL)) as Row | undefined;
    if (target === undefined) {
      await tx.table('skillAnnotations').put({ ...retiredNote, skillId: TARGET_SKILL });
    } else {
      await tx.table('skillAnnotations').update(TARGET_SKILL, mergeAnnotation(target, retiredNote));
    }
    await tx.table('skillAnnotations').delete(RETIRED_SKILL);
    counts.annotations += 1;
  }

  // 5. goals — a carried-over scope listing the retired card is an item
  //    the goal could never cover.
  const goals = (await tx.table('goals').toArray()) as Row[];
  for (const goal of goals) {
    if (!Array.isArray(goal.relatedItems)) continue;
    const refs = (goal.relatedItems as unknown[]).map(String);
    if (!refs.includes(RETIRED_CARD)) continue;
    await tx.table('goals').update(String(goal.id), {
      relatedItems: [...new Set(refs.map(r => (r === RETIRED_CARD ? TARGET_CARD : r)))],
    });
    counts.goals += 1;
  }

  // 6. practiceBlocks — what past blocks drilled, which is read back.
  const blocks = (await tx.table('practiceBlocks').toArray()) as Row[];
  for (const block of blocks) {
    if (!Array.isArray(block.itemRefs)) continue;
    const refs = (block.itemRefs as unknown[]).map(String);
    if (!refs.includes(RETIRED_CARD)) continue;
    await tx.table('practiceBlocks').update(String(block.id), {
      itemRefs: refs.map(r => (r === RETIRED_CARD ? TARGET_CARD : r)),
    });
    counts.blocks += 1;
  }

  return counts;
}

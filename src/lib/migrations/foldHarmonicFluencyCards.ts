/**
 * Retired Harmonic Fluency cards fold into the cards that ask the same
 * fact. One implementation, called with a different map by each ruling
 * that retires cards.
 *
 * =====================================================================
 * EXTRACTED FROM `retireDqExtra1.ts`, which folded one card. The Ear-Theory
 * Crossover retirement and the duplicates of 14 Sep 2026 fold twenty more,
 * several of them onto the same survivor (`et-3` and `et-4` both become
 * `fh-14`), so the one-card version became this one and `retireDqExtra1`
 * calls it with a map of one. A second copy of the six tables below would
 * be the second implementation of a step that already exists.
 *
 * =====================================================================
 * WHAT MOVES. A Harmonic Fluency card keys its history on the card id
 * itself (an attempt's `itemId`, a spacing row's `itemRef`, a past
 * practice block's `itemRefs`, a goal's carried-over `relatedItems`) and
 * its diary entry and annotation on the skill id
 * `harmonic-fluency:card:<id>`. Those are the six places this moves.
 *
 * The merge rules are `retire913.ts`'s, imported rather than restated, so
 * the folds cannot come to disagree about what "further along" or "sooner
 * due" means. Where the reader has history on both cards the rows merge;
 * nothing written by hand is dropped; two pieces of written text never
 * overwrite each other.
 *
 * =====================================================================
 * TWO DEVICES, EITHER ORDER. There is no "already ran" flag: a second
 * run finds nothing keyed on a retired id and changes nothing. A spacing
 * row keeps its primary key and changes `itemRef`, so the laptop and the
 * phone each move the same row to the same place, whichever opens first.
 *
 * NOTHING HERE READS THE CATALOG. A migration has to keep working against
 * the data it was written for, so every map is written out by its caller.
 * That the pairs are right is proved against the live deck in the tests
 * beside each map.
 * =====================================================================
 */
import {
  mergeAnnotation, mergeDiary, mergeSpacing, type MigrationTx,
} from './retire913';

/** Retired card id → the card id its history moves onto. */
export type CardFolds = Readonly<Record<string, string>>;

const MODULE_REF = 'harmonic-fluency';
const SKILL_PREFIX = `${MODULE_REF}:card:`;

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
 * Move everything filed under each retired card onto its target.
 * Idempotent: a second run finds nothing under a retired id.
 */
export async function foldHarmonicFluencyCards(
  tx: MigrationTx,
  folds: CardFolds,
): Promise<CardFoldCounts> {
  const counts: CardFoldCounts = {
    attempts: 0, spacingMoved: 0, spacingMerged: 0, diaryMoved: 0,
    diaryMerged: 0, annotations: 0, goals: 0, blocks: 0,
  };
  const targetOf = (ref: string): string | undefined =>
    Object.prototype.hasOwnProperty.call(folds, ref) ? folds[ref] : undefined;
  const skillTargetOf = (skillId: string): string | undefined => {
    if (!skillId.startsWith(SKILL_PREFIX)) return undefined;
    const target = targetOf(skillId.slice(SKILL_PREFIX.length));
    return target === undefined ? undefined : `${SKILL_PREFIX}${target}`;
  };

  // 1. attempts — every row has its own id, so a rewrite never collides.
  const attempts = (await tx.table('attempts').toArray()) as Row[];
  for (const row of attempts) {
    if (row.moduleId !== MODULE_REF) continue;
    const target = targetOf(String(row.itemId));
    if (target === undefined) continue;
    await tx.table('attempts').update(String(row.id), { itemId: target });
    counts.attempts += 1;
  }

  // 2. spacingState — one row per [moduleRef + itemRef + hand]. A fold
  //    onto a slot the reader already has is a merge, never a drop, and
  //    the map is updated as rows land, so two retired cards folding onto
  //    one survivor merge into each other rather than both into nothing.
  const spacing = (await tx.table('spacingState').toArray()) as Row[];
  const slot = (ref: string, hand: unknown) => `${ref}|${String(hand)}`;
  const bySlot = new Map<string, Row>();
  for (const row of spacing) {
    if (row.moduleRef === MODULE_REF) bySlot.set(slot(String(row.itemRef), row.hand), row);
  }
  for (const row of spacing) {
    if (row.moduleRef !== MODULE_REF) continue;
    const target = targetOf(String(row.itemRef));
    if (target === undefined) continue;
    const twin = bySlot.get(slot(target, row.hand));
    if (twin === undefined) {
      // THE ROW'S ID IS LEFT ALONE: it is the sync key.
      await tx.table('spacingState').update(String(row.id), { itemRef: target });
      bySlot.set(slot(target, row.hand), { ...row, itemRef: target });
      counts.spacingMoved += 1;
    } else {
      const merged = mergeSpacing(twin, row);
      await tx.table('spacingState').update(String(twin.id), merged);
      await tx.table('spacingState').delete(String(row.id));
      bySlot.set(slot(target, row.hand), { ...twin, ...merged });
      counts.spacingMerged += 1;
    }
    bySlot.delete(slot(String(row.itemRef), row.hand));
  }

  // 3. harmonicDiaryEntries — one entry per skill.
  const entries = (await tx.table('harmonicDiaryEntries').toArray()) as Row[];
  const entryBySkill = new Map<string, Row>();
  for (const e of entries) entryBySkill.set(String(e.skillId), e);
  for (const entry of entries) {
    const target = skillTargetOf(String(entry.skillId));
    if (target === undefined) continue;
    const twin = entryBySkill.get(target);
    if (twin === undefined) {
      await tx.table('harmonicDiaryEntries').update(String(entry.entryId), { skillId: target });
      entryBySkill.set(target, { ...entry, skillId: target });
      counts.diaryMoved += 1;
    } else {
      const merged = mergeDiary(twin, entry);
      await tx.table('harmonicDiaryEntries').update(String(twin.entryId), merged);
      await tx.table('harmonicDiaryEntries').delete(String(entry.entryId));
      entryBySkill.set(target, { ...twin, ...merged });
      counts.diaryMerged += 1;
    }
    entryBySkill.delete(String(entry.skillId));
  }

  // 4. skillAnnotations — keyed ON the skill id, so a move is a new row
  //    and a delete.
  const annotations = (await tx.table('skillAnnotations').toArray()) as Row[];
  const noteBySkill = new Map<string, Row>();
  for (const a of annotations) noteBySkill.set(String(a.skillId), a);
  for (const note of annotations) {
    const target = skillTargetOf(String(note.skillId));
    if (target === undefined) continue;
    const twin = noteBySkill.get(target);
    if (twin === undefined) {
      const moved = { ...note, skillId: target };
      await tx.table('skillAnnotations').put(moved);
      noteBySkill.set(target, moved);
    } else {
      const merged = mergeAnnotation(twin, note);
      await tx.table('skillAnnotations').update(target, merged);
      noteBySkill.set(target, { ...twin, ...merged });
    }
    await tx.table('skillAnnotations').delete(String(note.skillId));
    noteBySkill.delete(String(note.skillId));
    counts.annotations += 1;
  }

  // 5. goals — a carried-over scope listing a retired card is an item the
  //    goal could never cover.
  const goals = (await tx.table('goals').toArray()) as Row[];
  for (const goal of goals) {
    if (!Array.isArray(goal.relatedItems)) continue;
    const refs = (goal.relatedItems as unknown[]).map(String);
    if (!refs.some(r => targetOf(r) !== undefined)) continue;
    await tx.table('goals').update(String(goal.id), {
      relatedItems: [...new Set(refs.map(r => targetOf(r) ?? r))],
    });
    counts.goals += 1;
  }

  // 6. practiceBlocks — what past blocks drilled, which is read back.
  const blocks = (await tx.table('practiceBlocks').toArray()) as Row[];
  for (const block of blocks) {
    if (!Array.isArray(block.itemRefs)) continue;
    const refs = (block.itemRefs as unknown[]).map(String);
    if (!refs.some(r => targetOf(r) !== undefined)) continue;
    await tx.table('practiceBlocks').update(String(block.id), {
      itemRefs: refs.map(r => targetOf(r) ?? r),
    });
    counts.blocks += 1;
  }

  return counts;
}

/** The console line an upgrade prints, the same for every fold. */
export function describeCardFold(what: string, n: CardFoldCounts): string {
  return `[harmonic-fluency] ${what}: ${n.attempts} attempt(s), `
    + `${n.spacingMoved} spacing row(s) moved and ${n.spacingMerged} merged, `
    + `${n.diaryMoved} diary entr(ies) moved and ${n.diaryMerged} merged, `
    + `${n.annotations} annotation(s), ${n.goals} goal(s), ${n.blocks} practice block(s).`;
}

/**
 * Resolve the prep-screen per-item breakdown into an ordered list of
 * chord-shape drill cells for the in-session drill runner (Level 3
 * auto-nav). The chord-shape counterpart to inSessionScaleRunner.
 *
 * Unlike scale cells (resolved synchronously from the itemRef),
 * chord-shape cells are DB rows: each itemRef maps to a DrillSkill
 * (materialised on first touch via findOrCreateSkill) plus a DrillType
 * for DrillSessionModal. Resolution is therefore async — the runner
 * awaits it before mounting the first modal.
 */
import { db, type DrillSkill, type DrillType } from '../../lib/db';
import { findOrCreateSkill, parseShapesItemRef } from '../shapes-and-patterns/drillModel';
import type { BreakdownItem } from './inSessionScaleRunner';

export interface ChordShapeRunnerItem extends BreakdownItem {
  skill: DrillSkill;
  drillType: DrillType;
}

/** True when a breakdown's first item is a chord-shape itemRef — the
 *  signal to drive the in-session chord-shape runner instead of a
 *  route fallback. Sync (parses the ref only), so it can gate render. */
export function isChordShapeRunnerBlock(
  items: ReadonlyArray<BreakdownItem> | null | undefined,
): boolean {
  return (
    !!items &&
    items.length > 0 &&
    parseShapesItemRef(items[0].itemRef)?.kind === 'chord-shape'
  );
}

/** Map breakdown items to chord-shape skill + drillType in order,
 *  dropping any that aren't chord-shapes or have no drill type. Async:
 *  materialises skills + reads their drill types from Dexie. */
export async function resolveChordShapeRunnerItems(
  items: ReadonlyArray<BreakdownItem>,
): Promise<ChordShapeRunnerItem[]> {
  const out: ChordShapeRunnerItem[] = [];
  for (const item of items) {
    const desc = parseShapesItemRef(item.itemRef);
    if (!desc || desc.kind !== 'chord-shape') continue;
    const skill = await findOrCreateSkill(desc);
    const drillType = (
      await db.drillTypes.where('skillId').equals(skill.id).sortBy('order')
    )[0];
    if (!drillType) continue;
    out.push({ ...item, skill, drillType });
  }
  return out;
}

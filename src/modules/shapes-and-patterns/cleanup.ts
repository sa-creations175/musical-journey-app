import { db, type DrillType } from '../../lib/db';

/**
 * One-time cleanup: the legacy "ghost-keyboard" mental-visualisation
 * variant was retired when the flashcard format replaced it. If a
 * user materialised a ghost-keyboard DrillSkill before that change,
 * it still lives in their DB as an orphan row (invisible in the UI
 * but returned by `db.drillSkills.toArray()`, which would surface it
 * in the Catalogue).
 *
 * Idempotent — no-ops after the first run. Safe to call on every
 * app boot.
 */
export async function cleanupGhostKeyboardIfNeeded(): Promise<void> {
  const orphans = await db.drillSkills
    .where('[kind+variant]').equals(['mental-viz', 'ghost-keyboard'])
    .toArray();
  if (orphans.length === 0) return;

  const skillIds = orphans.map(s => s.id);
  // Grab associated types + sessions so we can cascade in a single
  // transaction.
  const types = await db.drillTypes.where('skillId').anyOf(skillIds).toArray();
  const typeIds = types.map(t => t.id);
  const sessions = typeIds.length > 0
    ? await db.drillSessions.where('drillTypeId').anyOf(typeIds).toArray()
    : [];
  const sessionIds = sessions.map(s => s.id);

  await db.transaction(
    'rw',
    [db.drillSkills, db.drillTypes, db.drillSessions],
    async () => {
      await db.drillSkills.bulkDelete(skillIds);
      if (typeIds.length > 0) await db.drillTypes.bulkDelete(typeIds);
      if (sessionIds.length > 0) await db.drillSessions.bulkDelete(sessionIds);
    },
  );
}

/**
 * One-time cleanup: scale skills used to seed three drill types per
 * scale (ascending, descending, both). The directional variants were
 * retired in favour of a single "Scale drill" — the user's only
 * actually-used direction was both. Cascade-deletes any rows whose
 * name is "Scale ascending" or "Scale descending" along with their
 * logged drillSessions, and renames any surviving "Both directions
 * (continuous)" rows to the new canonical "Scale drill" so existing
 * heat-grid cells match what newly-materialised cells look like.
 *
 * Idempotent — no-ops once existing data is migrated.
 */
const LEGACY_DIRECTIONAL_NAMES: ReadonlySet<string> = new Set([
  'Scale ascending',
  'Scale descending',
]);
const LEGACY_BOTH_NAME = 'Both directions (continuous)';
const NEW_SCALE_DRILL_NAME = 'Scale drill';

export async function cleanupScaleDirectionalDrillsIfNeeded(): Promise<void> {
  const scaleSkills = await db.drillSkills.where('kind').equals('scale').toArray();
  if (scaleSkills.length === 0) return;

  const scaleSkillIds = new Set(scaleSkills.map(s => s.id));
  const allTypes = await db.drillTypes
    .where('skillId')
    .anyOf(Array.from(scaleSkillIds))
    .toArray();

  const directionalRows = allTypes.filter(t => LEGACY_DIRECTIONAL_NAMES.has(t.name));
  const renameRows: DrillType[] = allTypes.filter(t => t.name === LEGACY_BOTH_NAME);

  if (directionalRows.length === 0 && renameRows.length === 0) return;

  const directionalIds = directionalRows.map(t => t.id);
  const sessions = directionalIds.length > 0
    ? await db.drillSessions.where('drillTypeId').anyOf(directionalIds).toArray()
    : [];
  const sessionIds = sessions.map(s => s.id);

  await db.transaction(
    'rw',
    [db.drillTypes, db.drillSessions],
    async () => {
      if (directionalIds.length > 0) await db.drillTypes.bulkDelete(directionalIds);
      if (sessionIds.length > 0) await db.drillSessions.bulkDelete(sessionIds);
      for (const row of renameRows) {
        await db.drillTypes.update(row.id, { name: NEW_SCALE_DRILL_NAME });
      }
    },
  );
}

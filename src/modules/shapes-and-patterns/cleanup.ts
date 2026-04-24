import { db } from '../../lib/db';

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

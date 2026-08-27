/**
 * Clearing the stages the retired self-assessment declared.
 *
 * =====================================================================
 * A DECLARATION WAS NEVER A RATING, AND IT WAS COUNTING AS ONE.
 *
 * The chord cell used to ask "How well do you know this?" and write
 * `acquired` onto every inversion of a cell from one tap, through
 * `assertSpacingStage` — a deliberate state declaration with no
 * performanceHistory behind it. Retiring the prompt stopped new ones.
 * These are the rows it already wrote.
 *
 * They are not inert. A staged row counts toward goal coverage and
 * reaches the session generator, so a chord declared once months ago
 * has been shaping what the app thinks you know and what it plans for
 * you, on no evidence. Clearing them makes every chord start from what
 * has actually been drilled.
 *
 * DELETED, NOT RESET TO 'new'. Absence of a row IS the canonical new
 * state — `assertSpacingStage(…, null)` deletes for exactly this
 * reason. A row saying "new" would be a record that something happened
 * here, and nothing did.
 *
 * =====================================================================
 * BOTH CONDITIONS, NOT EITHER. THE INTERSECTION IS THE SAFE SET.
 *
 * A row is cleared only when it is staged AND has an empty
 * performanceHistory AND has no drill session behind it. Those three
 * agreed exactly on the corpus this was written for (4 rows, one cell,
 * all `acquired`) — but they can disagree, and where they do the row
 * has evidence of some kind and is left alone. Requiring all three
 * cannot delete anything earned; requiring any one of them could.
 * =====================================================================
 */

import { db, type DrillSession, type DrillSkill, type SpacingState } from '../db';
import { getPref, setPref } from '../userPrefs';

export const PREF_DECLARED_STAGES_CLEARED = 'shapesDeclaredStagesCleared';

/** Stages a declaration could have written. `new` is not one of them —
 *  the prompt only ever seeded `acquiring` or `acquired`, and the two
 *  above are included so a row promoted since is still recognised. */
const STAGED = new Set(['acquiring', 'acquired', 'consolidated', 'mastered']);

/** `chord-shape:<quality>:<key>[:<inversionState>]` → the join key. */
function keyForItemRef(itemRef: string): string {
  const p = itemRef.split(':');
  return `${p[1] ?? ''}|${p[2] ?? ''}|${p[3] ?? ''}`;
}

function keyForSkill(skill: DrillSkill): string {
  return `${skill.quality ?? ''}|${skill.keyName ?? ''}|${skill.inversionState ?? ''}`;
}

export interface ClearReport {
  /** Already run — nothing was touched. */
  skipped: boolean;
  /** Rows deleted. */
  cleared: number;
  /** Staged rows left alone because they had evidence behind them. */
  keptWithEvidence: number;
}

/**
 * Which rows qualify. Pure, so the count and the delete cannot
 * disagree about what they are talking about.
 */
export function declaredNeverDrilled(
  spacing: ReadonlyArray<SpacingState>,
  skills: ReadonlyArray<DrillSkill>,
  sessions: ReadonlyArray<DrillSession>,
): SpacingState[] {
  const drilledSkillIds = new Set(sessions.map(s => s.skillId));
  const drilledKeys = new Set(
    skills
      .filter(s => s.kind === 'chord-shape' && drilledSkillIds.has(s.id))
      .map(keyForSkill),
  );

  return spacing.filter(r => {
    if (r.moduleRef !== 'shapes-and-patterns') return false;
    if (typeof r.itemRef !== 'string' || !r.itemRef.startsWith('chord-shape:')) return false;
    if (!STAGED.has(r.acquisitionStage)) return false;
    // Any recorded signal at all means this is not a bare declaration.
    if (Array.isArray(r.performanceHistory) && r.performanceHistory.length > 0) return false;
    // Any drill at all, for this exact square, means the same.
    if (drilledKeys.has(keyForItemRef(r.itemRef))) return false;
    return true;
  });
}

/**
 * Run it. Once, gated on a pref, and the pref syncs — so a second
 * device does not re-run a clear that has already happened, and a
 * second run on this one is a no-op.
 */
export async function clearDeclaredChordShapeStages(): Promise<ClearReport> {
  if (await getPref<boolean>(PREF_DECLARED_STAGES_CLEARED, false)) {
    return { skipped: true, cleared: 0, keptWithEvidence: 0 };
  }

  const [spacing, skills, sessions] = await Promise.all([
    db.spacingState.where('moduleRef').equals('shapes-and-patterns').toArray(),
    db.drillSkills.where('kind').equals('chord-shape').toArray(),
    db.drillSessions.toArray(),
  ]);

  const doomed = declaredNeverDrilled(spacing, skills, sessions);
  const stagedTotal = spacing.filter(r =>
    typeof r.itemRef === 'string'
    && r.itemRef.startsWith('chord-shape:')
    && STAGED.has(r.acquisitionStage)).length;

  if (doomed.length > 0) {
    // Plain bulkDelete: the sync layer hooks `deleting` on this table,
    // so the removal propagates the same way `assertSpacingStage`'s own
    // delete does. Nothing bespoke is needed to make it travel.
    await db.spacingState.bulkDelete(doomed.map(r => r.id));
  }
  await setPref(PREF_DECLARED_STAGES_CLEARED, true);

  return {
    skipped: false,
    cleared: doomed.length,
    keptWithEvidence: stagedTotal - doomed.length,
  };
}

export function describeClear(r: ClearReport): string {
  if (r.skipped) return '[spacing] declared chord-shape stages already cleared';
  return `[spacing] cleared ${r.cleared} declared chord-shape stage`
    + `${r.cleared === 1 ? '' : 's'} with nothing drilled behind them`
    + (r.keptWithEvidence > 0
      ? `; kept ${r.keptWithEvidence} with evidence` : '');
}

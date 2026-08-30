/**
 * Carrying four cards' history onto their identity ids.
 *
 * =====================================================================
 * THE IDS MOVED BECAUSE THE SPELLING WAS NEVER AN IDENTITY.
 *
 * `MAJOR_ROOTS` spells the sixth key G♭ and `MINOR_ROOTS` spells the
 * ninth G♯. Both are display choices — each scale reads the way it is
 * written — and both were reaching card ids, where the app has exactly
 * one vocabulary. `lib/spelling.ts` states the rule: the identity never
 * reaches a screen, and it is the only thing an id may be built from.
 *
 * Four cards had been drilled under the old ids, so their rows have to
 * come with them. Everything else generated under a display spelling
 * had no history and simply mints differently from now on.
 * =====================================================================
 *
 * A RENAME, NOT A RE-KEY, AND THAT IS WHY IT SYNCS CLEANLY. Neither
 * table's sync identity is the field being changed — `attempts` and
 * `spacingState` both use `idField: 'id'`, the row's own UUID, which
 * this does not touch. `spacingState.itemRef` is the top-level column
 * `item_ref`; `attempts.itemId` rides inside the `data` blob. So the
 * server sees an upsert on the same primary key with a changed field:
 * no second row, nothing stranded. (`attempts` is `appendOnly`, which
 * suppresses only the pull-side orphan sweep — the Dexie hooks still
 * enqueue on `updating`.)
 *
 * =====================================================================
 * IT VERIFIES BEFORE IT WRITES, AND REFUSES RATHER THAN ADAPTS.
 *
 * The row counts were checked against the live database and authorise
 * exactly these four cards and eight rows. They were also minutes old
 * at the time, and practice continues. So this counts what it is about
 * to touch and stops if the shape is not the authorised one — a
 * migration that adjusted itself to what it found would be a different
 * migration than the one that was agreed to.
 *
 * It also refuses if anything already sits on a destination id. There
 * is nothing to merge into today; if that changes, merging two
 * histories is a decision, not a rename.
 * =====================================================================
 */
import { db } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';

export const PREF_HF_IDENTITY_IDS_MIGRATED = 'hfIdentityCardIdsMigrated';

/** old id → identity id. Four cards, verified against the database. */
export const IDENTITY_ID_MOVES: Readonly<Record<string, string>> = {
  'pent-major-Gb': 'pent-major-F#',
  'pent-relative-Gb': 'pent-relative-F#',
  'pr-1564-Gb': 'pr-1564-F#',
  'pent-minor-G#': 'pent-minor-Ab',
};

/** What the authorised shape looks like: one attempt and one spacing
 *  row per card, and nothing already at any destination. */
const EXPECTED_ROWS_PER_CARD = 1;

export interface IdentityMigrationReport {
  /** Already run — nothing was touched. */
  skipped: boolean;
  /** The shape did not match; nothing was touched. Human-readable. */
  refused: string | null;
  attemptsMoved: number;
  spacingMoved: number;
}

/** Count what is there, without changing any of it. */
export async function surveyIdentityIds(): Promise<{
  attempts: Record<string, number>;
  spacing: Record<string, number>;
  destinationAttempts: Record<string, number>;
  destinationSpacing: Record<string, number>;
}> {
  const attempts: Record<string, number> = {};
  const spacing: Record<string, number> = {};
  const destinationAttempts: Record<string, number> = {};
  const destinationSpacing: Record<string, number> = {};

  for (const [from, to] of Object.entries(IDENTITY_ID_MOVES)) {
    attempts[from] = await db.attempts.where('itemId').equals(from).count()
      .catch(async () => (await db.attempts.filter(a => a.itemId === from).toArray()).length);
    destinationAttempts[to] = await db.attempts.filter(a => a.itemId === to).count();
    spacing[from] = await db.spacingState.filter(s => s.itemRef === from).count();
    destinationSpacing[to] = await db.spacingState.filter(s => s.itemRef === to).count();
  }
  return { attempts, spacing, destinationAttempts, destinationSpacing };
}

/**
 * Why this survey may not be migrated, or null when it may.
 *
 * Pure, so the rule can be read and tested without a database.
 */
export function refusalFor(
  survey: Awaited<ReturnType<typeof surveyIdentityIds>>,
): string | null {
  for (const [from, to] of Object.entries(IDENTITY_ID_MOVES)) {
    if (survey.attempts[from] !== EXPECTED_ROWS_PER_CARD) {
      return `${from}: expected ${EXPECTED_ROWS_PER_CARD} attempt, found ${survey.attempts[from]}`;
    }
    if (survey.spacing[from] !== EXPECTED_ROWS_PER_CARD) {
      return `${from}: expected ${EXPECTED_ROWS_PER_CARD} spacing row, found ${survey.spacing[from]}`;
    }
    if (survey.destinationAttempts[to] !== 0) {
      return `${to}: ${survey.destinationAttempts[to]} attempt(s) already there — merging two histories is a decision, not a rename`;
    }
    if (survey.destinationSpacing[to] !== 0) {
      return `${to}: ${survey.destinationSpacing[to]} spacing row(s) already there — merging two histories is a decision, not a rename`;
    }
  }
  return null;
}

export async function migrateIdentityCardIds(): Promise<IdentityMigrationReport> {
  const empty = { skipped: false, refused: null, attemptsMoved: 0, spacingMoved: 0 };
  if (await getPref<boolean>(PREF_HF_IDENTITY_IDS_MIGRATED, false)) {
    return { ...empty, skipped: true };
  }

  const survey = await surveyIdentityIds();
  const refused = refusalFor(survey);
  if (refused !== null) {
    // NOT marked done. A refusal is a state to come back to, not a
    // step that has been taken.
    console.warn('[hf] identity id migration refused:', refused);
    return { ...empty, refused };
  }

  let attemptsMoved = 0;
  let spacingMoved = 0;
  for (const [from, to] of Object.entries(IDENTITY_ID_MOVES)) {
    // `modify` rather than delete-and-insert: the row keeps its own
    // `id`, so sync sees an update. See the header.
    attemptsMoved += await db.attempts.filter(a => a.itemId === from)
      .modify(a => { a.itemId = to; });
    spacingMoved += await db.spacingState.filter(s => s.itemRef === from)
      .modify(s => { s.itemRef = to; });
  }

  await setPref(PREF_HF_IDENTITY_IDS_MIGRATED, true);
  return { skipped: false, refused: null, attemptsMoved, spacingMoved };
}

export function describeIdentityMigration(r: IdentityMigrationReport): string {
  if (r.skipped) return '[hf] identity card ids: already migrated';
  if (r.refused !== null) return `[hf] identity card ids: REFUSED — ${r.refused}`;
  return `[hf] identity card ids: moved ${r.attemptsMoved} attempt(s) and `
    + `${r.spacingMoved} spacing row(s) across ${Object.keys(IDENTITY_ID_MOVES).length} cards`;
}

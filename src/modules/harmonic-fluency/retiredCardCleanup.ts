/**
 * Taking the rows out from under a card that no longer exists.
 *
 * =====================================================================
 * `ksc-3` WAS `ks-16` A SECOND TIME.
 *
 * Same question to the byte — "The relative major of A minor is _____"
 * — same answer, a different set of decoys, and a `-sc` suffix on the
 * skill tag that made one skill look like two. The card is gone from
 * the catalog. Its rows are not, because they live in a database the
 * catalog cannot reach.
 *
 * `ks-16` is the survivor because its one attempt is a day newer. That
 * was the only thing separating them.
 *
 * =====================================================================
 * IT DELETES. NOTHING TOMBSTONES THE CARD, AND THAT IS ACCEPTED.
 *
 * The rows go, and with them the one attempt from 23 August and the
 * spacing row it created. The star, the study-later toggle, the review
 * flag and the flag note live ON that spacing row, so they would go
 * too — which is exactly why the shape is checked first. There were
 * none. If there are now, the ruling was made about a different card
 * than the one in the database, and this refuses.
 *
 * =====================================================================
 * IT VERIFIES BEFORE IT WRITES, AND REFUSES RATHER THAN ADAPTS.
 *
 * The rule `identityIdMigration` states, followed rather than
 * restated: a one-shot that adjusted itself to whatever it found would
 * be a different one-shot than the one that was agreed to. The
 * authorised shape is one attempt, one spacing row, and nothing
 * hand-authored on it. Anything else logs and leaves the pref unset,
 * so it is a state to come back to rather than a step taken.
 *
 * =====================================================================
 * IT SYNCS, BECAUSE IT GOES THROUGH DEXIE.
 *
 * The `deleting` hook enqueues for every synced table when signed in,
 * so both rows are deleted in Supabase too. `attempts` being
 * `appendOnly` suppresses only the pull-side orphan sweep — a delete
 * made here still propagates. A raw IndexedDB delete would not, and
 * the attempt would come back on the next pull.
 * =====================================================================
 */
import { db } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';

export const PREF_KSC3_RETIRED = 'hfRetiredDuplicateKsc3';

/** The card that was retired. */
export const RETIRED_CARD_ID = 'ksc-3';

/** The card it duplicated, kept. Named so the reason is readable from
 *  the console line rather than only from this file. */
export const SURVIVING_CARD_ID = 'ks-16';

const MODULE_REF = 'harmonic-fluency';

/** One attempt, one spacing row. What the database held when the
 *  ruling was made. */
const AUTHORISED_ATTEMPTS = 1;
const AUTHORISED_SPACING_ROWS = 1;

export interface RetiredCardReport {
  /** Already run — nothing was touched. */
  skipped: boolean;
  /** The shape did not match; nothing was touched. Human-readable. */
  refused: string | null;
  attemptsDeleted: number;
  spacingDeleted: number;
}

export interface RetiredCardSurvey {
  attempts: number;
  spacingRows: number;
  /** Any of the three user-authored fields set on the spacing row.
   *  None of them is derivable from anything, so any one of them
   *  makes this a decision rather than a cleanup. */
  handAuthored: string[];
}

/** Count what is there, without changing any of it. */
export async function surveyRetiredCard(): Promise<RetiredCardSurvey> {
  const attempts = await db.attempts
    .filter(a => a.moduleId === MODULE_REF && a.itemId === RETIRED_CARD_ID)
    .count();
  const rows = await db.spacingState
    .filter(s => s.moduleRef === MODULE_REF && s.itemRef === RETIRED_CARD_ID)
    .toArray();
  const handAuthored: string[] = [];
  for (const row of rows) {
    if (row.studyLater === true) handAuthored.push('studyLater');
    if (row.reviewFlagged === true) handAuthored.push('reviewFlagged');
    if (typeof row.reviewFlagNote === 'string' && row.reviewFlagNote !== '') {
      handAuthored.push('reviewFlagNote');
    }
  }
  return { attempts, spacingRows: rows.length, handAuthored };
}

/**
 * Why this survey may not be cleaned up, or null when it may.
 *
 * Pure, so the rule can be read and tested without a database.
 */
export function refusalFor(survey: RetiredCardSurvey): string | null {
  if (survey.handAuthored.length > 0) {
    return `${RETIRED_CARD_ID}: ${survey.handAuthored.join(', ')} set on the `
      + 'spacing row — that was written by hand and is not derivable from '
      + 'anything, so deleting it is a decision rather than a cleanup';
  }
  if (survey.attempts !== AUTHORISED_ATTEMPTS) {
    return `${RETIRED_CARD_ID}: expected ${AUTHORISED_ATTEMPTS} attempt, `
      + `found ${survey.attempts}`;
  }
  if (survey.spacingRows !== AUTHORISED_SPACING_ROWS) {
    return `${RETIRED_CARD_ID}: expected ${AUTHORISED_SPACING_ROWS} spacing `
      + `row, found ${survey.spacingRows}`;
  }
  return null;
}

export async function cleanUpRetiredCard(): Promise<RetiredCardReport> {
  const empty = {
    skipped: false, refused: null, attemptsDeleted: 0, spacingDeleted: 0,
  };
  if (await getPref<boolean>(PREF_KSC3_RETIRED, false)) {
    return { ...empty, skipped: true };
  }

  const survey = await surveyRetiredCard();
  const refused = refusalFor(survey);
  if (refused !== null) {
    // NOT marked done. A refusal is a state to come back to, not a
    // step that has been taken.
    console.warn('[hf] retired-card cleanup refused:', refused);
    return { ...empty, refused };
  }

  const attemptsDeleted = await db.attempts
    .filter(a => a.moduleId === MODULE_REF && a.itemId === RETIRED_CARD_ID)
    .delete();
  const spacingDeleted = await db.spacingState
    .filter(s => s.moduleRef === MODULE_REF && s.itemRef === RETIRED_CARD_ID)
    .delete();

  await setPref(PREF_KSC3_RETIRED, true);
  return { skipped: false, refused: null, attemptsDeleted, spacingDeleted };
}

export function describeRetiredCardCleanup(r: RetiredCardReport): string {
  if (r.skipped) return `[hf] ${RETIRED_CARD_ID}: already cleaned up`;
  if (r.refused !== null) {
    return `[hf] ${RETIRED_CARD_ID}: REFUSED — ${r.refused}`;
  }
  return `[hf] ${RETIRED_CARD_ID} retired (duplicate of ${SURVIVING_CARD_ID}): `
    + `deleted ${r.attemptsDeleted} attempt(s) and ${r.spacingDeleted} `
    + 'spacing row(s)';
}

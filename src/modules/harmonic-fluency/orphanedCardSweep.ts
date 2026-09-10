/**
 * Rows with no live card behind them.
 *
 * =====================================================================
 * THE RULE LIVES IN `lib/orphanSweep`; THIS FILE IS THE DECK'S HALF.
 *
 * What an orphan is, that it is reported and never deleted, and what
 * counts as written by hand are all one thing across the app and are
 * written down once — see that file's header, which is the argument.
 * This one says which rows are the deck's, which ids are live, and
 * what the `[hf]` line reads like.
 *
 * =====================================================================
 * IT REPORTS. IT DELETES NOTHING, AND THAT CHANGED ON 10 SEP 2026.
 *
 * The file was `orphanedCardCleanup.ts` and it used to delete, against
 * a written-down list of the exact ids it was authorised to remove —
 * `REMOVED_WITHOUT_SUCCESSOR`, one entry per card retired without a
 * replacement. That list was the authorisation: it could not widen on
 * its own, and the pass refused outright if any id on it was back in
 * the deck. The list went with the migration passes it belonged to
 * (restructure commit 9).
 *
 * =====================================================================
 * ANNOTATIONS AND DIARY ENTRIES ARE KEYED ON A SKILL ID, not a card
 * id, so the live set is turned into skill ids and matched that way
 * round. The alternative — parsing a card id back out of a skill id —
 * is the shape `catalog.ts` refuses in terms: an id is a handle, not
 * a schema.
 * =====================================================================
 */
import { db } from '../../lib/db';
import {
  authoredOnAnnotation,
  authoredOnSpacing,
  collectOrphans,
  describeAuthored,
  describeCounts,
  type OrphanReport,
  type SweptRow,
} from '../../lib/orphanSweep';
import { FLASHCARDS } from './catalog';
import { canonicalSkillId } from '../skills/registry';

const MODULE_REF = 'harmonic-fluency';

/** The scope's own name, which is what the line calls the catalog. */
const SCOPE = 'the deck';

const TABLES = ['attempts', 'spacing', 'annotations', 'diary'] as const;

const PHRASES: Readonly<Record<string, string>> = {
  attempts: 'attempt(s)',
  spacing: 'spacing row(s)',
  annotations: 'annotation(s)',
  diary: 'diary entr(ies)',
};

export type { Orphan, OrphanReport } from '../../lib/orphanSweep';
export { authoredOnAnnotation, authoredOnSpacing };

/**
 * Every harmonic-fluency row whose card id is not in the deck.
 *
 * READS ONLY, and reads by index: `attempts` grows for ever and this
 * runs on every app start.
 */
export async function reportOrphanedCards(): Promise<OrphanReport> {
  const live = new Set(FLASHCARDS.map(c => c.id));
  const rows: SweptRow[] = [];

  for (const row of await db.attempts.where('moduleId').equals(MODULE_REF).toArray()) {
    rows.push({ ref: row.itemId, table: 'attempts' });
  }
  for (const row of await db.spacingState.where('moduleRef').equals(MODULE_REF).toArray()) {
    rows.push({
      ref: row.itemRef, table: 'spacing', authored: authoredOnSpacing(row),
    });
  }

  const prefix = canonicalSkillId(MODULE_REF, 'card', '');
  const cardIdOf = (skillId: string): string | null => (
    skillId.startsWith(prefix) ? skillId.slice(prefix.length) : null
  );
  for (const row of await db.skillAnnotations.toArray()) {
    const cardId = cardIdOf(row.skillId);
    if (cardId === null || cardId === '') continue;
    rows.push({
      ref: cardId, table: 'annotations', authored: authoredOnAnnotation(row),
    });
  }
  for (const row of await db.harmonicDiaryEntries.toArray()) {
    const cardId = cardIdOf(row.skillId);
    if (cardId === null || cardId === '') continue;
    rows.push({ ref: cardId, table: 'diary', authored: ['diaryEntry'] });
  }

  return collectOrphans([{
    scope: SCOPE, tables: TABLES, rows, isLive: ref => live.has(ref),
  }]);
}

/**
 * The console line, or null when there is nothing to say.
 *
 * SILENCE IS THE EXPECTED OUTCOME. This should print on no boot at all;
 * a line here means a card left the deck without its rows.
 */
export function describeOrphans(r: OrphanReport): string | null {
  if (r.orphans.length === 0) return null;
  return r.orphans.map(o => (
    `[hf] ${o.ref} is not in ${o.scope} and still has `
    + `${describeCounts(o.counts, PHRASES)}${describeAuthored(o.authored)}`
  )).join('\n');
}

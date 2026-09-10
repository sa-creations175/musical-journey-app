/**
 * Rows with no live card behind them.
 *
 * =====================================================================
 * THE STANDING RULE, NOT A STEP TO BE TAKEN.
 *
 * A `spacingState` row, an attempt, a skill annotation and a diary
 * entry are all keyed on a card id. The catalog is the only thing that
 * says which ids exist, and it is code — so a card can leave the deck
 * in a commit while its rows stay in a database the catalog cannot
 * reach, read on screen as practice against a question nobody can be
 * asked any more.
 *
 * This is the check that says so. It runs on every app start, it should
 * come back empty, and when it does not it names what it found.
 *
 * =====================================================================
 * IT REPORTS. IT DELETES NOTHING, AND THAT CHANGED ON 10 SEP 2026.
 *
 * It used to delete, against a written-down list of the exact ids it
 * was authorised to remove — `REMOVED_WITHOUT_SUCCESSOR`, one entry per
 * card retired without a replacement. That list was the authorisation:
 * it could not widen on its own, and the pass refused outright if any
 * id on it was back in the deck.
 *
 * The list went with the migration passes it belonged to (restructure
 * commit 9). What is left is the rule underneath it, and the rule alone
 * cannot carry a delete. "This id is not in the catalog" is true of a
 * card retired on purpose AND of a card whose generator threw during
 * import, of a legacy id from a version this build has never seen, and
 * of a row synced from a device running last week's deck. Deleting on
 * that would be deleting a reader's history because a module failed to
 * load.
 *
 * So it is read-only. Rows that should go are removed in the commit
 * that retires their card, where the exact set is known and can be
 * argued about; this is what notices when that did not happen.
 *
 * =====================================================================
 * WHAT A READER WROTE IS NAMED SEPARATELY.
 *
 * A study-later toggle, a review flag and its note, a priority, tags, a
 * custom name, a private note, a diary entry: none is derivable from
 * anything, and an orphaned row carrying one is a different problem
 * from an orphaned schedule. The line says which, so the decision that
 * follows can be the right one.
 * =====================================================================
 */
import { db } from '../../lib/db';
import { FLASHCARDS } from './catalog';
import { canonicalSkillId } from '../skills/registry';

const MODULE_REF = 'harmonic-fluency';

/** One orphaned card id, and what is sitting under it. */
export interface Orphan {
  cardId: string;
  attempts: number;
  spacing: number;
  annotations: number;
  diary: number;
  /** The hand-written fields found, named so the line says what is at
   *  stake rather than only that something is. */
  authored: string[];
}

export interface OrphanReport {
  orphans: Orphan[];
}

/** What a reader wrote by hand on a spacing row. */
export function authoredOnSpacing(row: {
  studyLater?: boolean; reviewFlagged?: boolean; reviewFlagNote?: string;
}): string[] {
  const found: string[] = [];
  if (row.studyLater === true) found.push('studyLater');
  if (row.reviewFlagged === true) found.push('reviewFlagged');
  if (typeof row.reviewFlagNote === 'string' && row.reviewFlagNote !== '') {
    found.push('reviewFlagNote');
  }
  return found;
}

/** What a reader wrote by hand on a skill annotation. An annotation
 *  with nothing set is a row the app made, not a thought. */
export function authoredOnAnnotation(row: {
  priority?: unknown; tags?: readonly unknown[];
  customName?: string; note?: string;
}): string[] {
  const found: string[] = [];
  if (row.priority !== undefined) found.push('priority');
  if ((row.tags?.length ?? 0) > 0) found.push('tags');
  if (typeof row.customName === 'string' && row.customName !== '') {
    found.push('customName');
  }
  if (typeof row.note === 'string' && row.note !== '') found.push('note');
  return found;
}

/**
 * Every harmonic-fluency row whose card id is not in the deck.
 *
 * READS ONLY, and reads by index: `attempts` grows for ever and this
 * runs on every app start.
 */
export async function reportOrphanedCards(): Promise<OrphanReport> {
  const live = new Set(FLASHCARDS.map(c => c.id));
  const found = new Map<string, Orphan>();
  const at = (cardId: string): Orphan => {
    const existing = found.get(cardId);
    if (existing !== undefined) return existing;
    const made: Orphan = {
      cardId, attempts: 0, spacing: 0, annotations: 0, diary: 0, authored: [],
    };
    found.set(cardId, made);
    return made;
  };
  const note = (o: Orphan, fields: readonly string[]) => {
    for (const f of fields) if (!o.authored.includes(f)) o.authored.push(f);
  };

  for (const row of await db.attempts.where('moduleId').equals(MODULE_REF).toArray()) {
    if (!live.has(row.itemId)) at(row.itemId).attempts += 1;
  }
  for (const row of await db.spacingState.where('moduleRef').equals(MODULE_REF).toArray()) {
    if (live.has(row.itemRef)) continue;
    const o = at(row.itemRef);
    o.spacing += 1;
    note(o, authoredOnSpacing(row));
  }

  /**
   * ANNOTATIONS AND DIARY ENTRIES ARE KEYED ON A SKILL ID, not a card
   * id, so the live set is turned into skill ids and matched that way
   * round. The alternative — parsing a card id back out of a skill id —
   * is the shape `catalog.ts` refuses in terms: an id is a handle, not
   * a schema.
   */
  const skillIdOf = new Map(
    [...live].map(id => [canonicalSkillId(MODULE_REF, 'card', id), id] as const),
  );
  const cardIdOf = (skillId: string): string | null => {
    if (skillIdOf.has(skillId)) return null;
    const prefix = canonicalSkillId(MODULE_REF, 'card', '');
    return skillId.startsWith(prefix) ? skillId.slice(prefix.length) : null;
  };
  for (const row of await db.skillAnnotations.toArray()) {
    const cardId = cardIdOf(row.skillId);
    if (cardId === null || cardId === '') continue;
    const o = at(cardId);
    o.annotations += 1;
    note(o, authoredOnAnnotation(row));
  }
  for (const row of await db.harmonicDiaryEntries.toArray()) {
    const cardId = cardIdOf(row.skillId);
    if (cardId === null || cardId === '') continue;
    const o = at(cardId);
    o.diary += 1;
    note(o, ['diaryEntry']);
  }

  return {
    orphans: [...found.values()]
      .map(o => ({ ...o, authored: [...o.authored].sort() }))
      .sort((a, b) => a.cardId.localeCompare(b.cardId)),
  };
}

/**
 * The console line, or null when there is nothing to say.
 *
 * SILENCE IS THE EXPECTED OUTCOME. This should print on no boot at all;
 * a line here means a card left the deck without its rows.
 */
export function describeOrphans(r: OrphanReport): string | null {
  if (r.orphans.length === 0) return null;
  return r.orphans.map(o => {
    const rows = [
      o.attempts > 0 ? `${o.attempts} attempt(s)` : null,
      o.spacing > 0 ? `${o.spacing} spacing row(s)` : null,
      o.annotations > 0 ? `${o.annotations} annotation(s)` : null,
      o.diary > 0 ? `${o.diary} diary entr(ies)` : null,
    ].filter(x => x !== null).join(', ');
    const hand = o.authored.length === 0
      ? ''
      : ` — and ${o.authored.join(', ')} written by hand`;
    return `[hf] ${o.cardId} is not in the deck and still has ${rows}${hand}`;
  }).join('\n');
}

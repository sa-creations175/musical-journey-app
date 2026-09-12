/**
 * Three chord cards fold into three others. Silas's ruling of
 * 11 Sep 2026 (`~/cc-scratch/NEXT_TAB1_RETIRE_913.md`).
 *
 * `maj9_13` → `maj13`, `dom9_13` → `dom13`, `min9_11` → `min11`. The
 * cards went in the commit before this one; this is everything the
 * reader answered on them, moved onto the card that survived.
 *
 * =====================================================================
 * WHY THE RULES ARE A FILE AND NOT EIGHT LINES INSIDE THE UPGRADE.
 *
 * A Dexie upgrade runs once per browser and cannot be replayed, so the
 * app's precedent (v36, `scaleIdentityMigration.test.ts`) is to restate
 * the migration's body inside its test and accept that the copy can
 * drift. That is honest for eight lines. This fold crosses nine tables
 * and needs a merge rule for each, and a restatement of it would be a
 * second implementation that the test proves nothing about.
 *
 * So the whole fold lives here as one function over a MINIMAL table
 * interface, `db.ts` v43 hands it the real upgrade transaction, and the
 * test hands it real tables with seeded rows. One implementation, and
 * the thing under test is the thing that ships.
 *
 * THE PRECEDENT'S REASON STILL HOLDS WHERE IT MATTERS: nothing here
 * imports a catalog, a seed or any module code. A migration has to keep
 * working against the data shape it was written for, and module code is
 * free to change underneath it — so the three ids and the two key
 * formats are written out below rather than derived from anything.
 *
 * =====================================================================
 * NOTHING ANSWERED IS LOST, AND NOTHING WRITTEN BY HAND IS DROPPED.
 *
 * Where the reader has history on BOTH cards the rows merge rather than
 * one winning: the v36 rewrite dropped the loser on a collision, which
 * was safe there because the collision was unreachable, and is not safe
 * here because a reader who drilled Tier 4 answered both cards. What
 * the app itself calls hand-written (`lib/orphanSweep.ts`) is carried
 * across every merge: a study-later toggle, a review flag and its note,
 * a priority, tags, a custom name, a private note, a diary entry.
 *
 * Two pieces of hand-written text never overwrite each other. The
 * surviving card's text comes first and the retired card's is appended
 * under it, so Silas can tidy it himself.
 * =====================================================================
 */

/** The retired card, and the card it folds into. */
export const RETIRED_TO_TARGET: Readonly<Record<string, string>> = {
  maj9_13: 'maj13',
  dom9_13: 'dom13',
  min9_11: 'min11',
};

/** Chord Recognition's module ref, as `recordEngagement` writes it. */
const MODULE_REF = 'chord-recognition';

/** How the diary and the skills catalogue key a chord. */
const SKILL_PREFIX = 'chord-recognition:item:';

/**
 * The pref the focus picker stores its chosen chords under. Written
 * out rather than imported from `goalConfig.focusSelectionKey`, for the
 * reason the header gives.
 */
const FOCUS_PREF_KEY = 'chordRecognitionFocusSelection';

/**
 * An itemRef with a retired chord in it, rewritten — or null.
 *
 * TWO FORMS, ONE RULE. Attempts and spacing rows carry
 * `attemptItemId(chordId, inversion)`, which is `maj9_13:0`; curation
 * rows, focus selections and goal scopes carry the bare `maj9_13`.
 * Splitting on the first colon covers both, and an inversion suffix
 * rides along untouched.
 */
export function foldItemRef(ref: string): string | null {
  const [chordId, ...rest] = ref.split(':');
  const target = RETIRED_TO_TARGET[chordId];
  if (target === undefined) return null;
  return [target, ...rest].join(':');
}

/** The same, for the `chord-recognition:item:<id>` skill id. */
export function foldSkillId(skillId: string): string | null {
  if (!skillId.startsWith(SKILL_PREFIX)) return null;
  const folded = foldItemRef(skillId.slice(SKILL_PREFIX.length));
  return folded === null ? null : SKILL_PREFIX + folded;
}

/**
 * Two pieces of hand-written text, both kept.
 *
 * The surviving card's comes first because it is the one that stays.
 * An empty side contributes nothing, and text already containing the
 * other is left alone — so running this twice cannot append twice.
 */
export function joinText(
  target: string | undefined,
  retired: string | undefined,
): string | undefined {
  const kept = (target ?? '').trim();
  const added = (retired ?? '').trim();
  if (kept === '') return added === '' ? undefined : added;
  if (added === '' || kept.includes(added)) return kept;
  return `${kept}\n${added}`;
}

/** new → acquiring → acquired → consolidated → mastered. */
const STAGE_ORDER = [
  'new', 'acquiring', 'acquired', 'consolidated', 'mastered',
] as const;

/** Whichever of two acquisition stages is further along. An unknown
 *  stage counts as the earliest, so a stray value can never promote a
 *  card past what it earned. */
export function furtherStage(a: unknown, b: unknown): string {
  const rank = (s: unknown): number =>
    STAGE_ORDER.indexOf(s as typeof STAGE_ORDER[number]);
  return rank(b) > rank(a) ? String(b) : String(a);
}

type Row = Record<string, unknown>;

const num = (v: unknown): number | null =>
  typeof v === 'number' ? v : null;

/** The later of two timestamps, either of which may be missing. */
const later = (a: unknown, b: unknown): number | null => {
  const x = num(a); const y = num(b);
  if (x === null) return y;
  if (y === null) return x;
  return Math.max(x, y);
};

/** The sooner of two due dates. A card due tomorrow on either row is
 *  due tomorrow merged: the reader sees it again rather than having a
 *  due date quietly pushed out. */
const sooner = (a: unknown, b: unknown): number | null => {
  const x = num(a); const y = num(b);
  if (x === null) return y;
  if (y === null) return x;
  return Math.min(x, y);
};

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const flag = (a: unknown, b: unknown): boolean | undefined =>
  a === true || b === true ? true : undefined;

/**
 * What the surviving spacing row becomes.
 *
 * The schedule takes the FURTHER of the two on everything it tracks —
 * the later engagement, the longer interval, the further stage — and
 * the SOONER due date. A row that is maintaining on either side is
 * maintaining merged: an absent `spacingStage` already reads as
 * maintaining everywhere else, and dropping a card with real history
 * back into a first-exposure tally would re-teach what the reader
 * knows.
 */
export function mergeSpacing(target: Row, retired: Row): Row {
  const history = [...list(target.performanceHistory), ...list(retired.performanceHistory)]
    .sort((a, b) => {
      const at = num((a as Row).t) ?? num((a as Row).at) ?? 0;
      const bt = num((b as Row).t) ?? num((b as Row).at) ?? 0;
      return at - bt;
    });
  const maintaining =
    target.spacingStage !== 'acquiring' || retired.spacingStage !== 'acquiring';
  const merged: Row = {
    acquisitionStage: furtherStage(target.acquisitionStage, retired.acquisitionStage),
    currentIntervalDays: Math.max(
      num(target.currentIntervalDays) ?? 0,
      num(retired.currentIntervalDays) ?? 0,
    ),
    lastEngagedAt: later(target.lastEngagedAt, retired.lastEngagedAt),
    nextDueAt: sooner(target.nextDueAt, retired.nextDueAt),
    performanceHistory: history,
    spacingStage: maintaining ? 'maintaining' : 'acquiring',
    exposuresDone: Math.max(
      num(target.exposuresDone) ?? 0,
      num(retired.exposuresDone) ?? 0,
    ),
    extraExposures: Math.max(
      num(target.extraExposures) ?? 0,
      num(retired.extraExposures) ?? 0,
    ),
  };
  // Hand-written, per `authoredOnSpacing`.
  const studyLater = flag(target.studyLater, retired.studyLater);
  if (studyLater !== undefined) merged.studyLater = studyLater;
  const reviewFlagged = flag(target.reviewFlagged, retired.reviewFlagged);
  if (reviewFlagged !== undefined) merged.reviewFlagged = reviewFlagged;
  const note = joinText(
    target.reviewFlagNote as string | undefined,
    retired.reviewFlagNote as string | undefined,
  );
  if (note !== undefined) merged.reviewFlagNote = note;
  return merged;
}

/** What the surviving diary entry becomes: its own text first, the
 *  retired card's under it, and the union of both sets of tags. */
export function mergeDiary(target: Row, retired: Row): Row {
  const tags = (a: unknown, b: unknown): string[] =>
    [...new Set([...list(a), ...list(b)].map(String))];
  return {
    userText: joinText(
      target.userText as string | undefined,
      retired.userText as string | undefined,
    ) ?? '',
    emotionalTags: tags(target.emotionalTags, retired.emotionalTags),
    genreTags: tags(target.genreTags, retired.genreTags),
    isStarterEdited: target.isStarterEdited === true || retired.isStarterEdited === true,
    lastEdited: later(target.lastEdited, retired.lastEdited) ?? Date.now(),
  };
}

/** What the surviving annotation becomes, per `authoredOnAnnotation`. */
export function mergeAnnotation(target: Row, retired: Row): Row {
  const merged: Row = {
    tags: [...new Set([...list(target.tags), ...list(retired.tags)].map(String))],
    updatedAt: later(target.updatedAt, retired.updatedAt) ?? Date.now(),
  };
  const priority = target.priority ?? retired.priority;
  if (priority !== undefined) merged.priority = priority;
  const customName = target.customName ?? retired.customName;
  if (customName !== undefined) merged.customName = customName;
  const note = joinText(
    target.note as string | undefined,
    retired.note as string | undefined,
  );
  if (note !== undefined) merged.note = note;
  return merged;
}

/** What the surviving curation row becomes, per `authoredOnCuration`. */
export function mergeCuration(target: Row, retired: Row): Row {
  const merged: Row = {
    updatedAt: later(target.updatedAt, retired.updatedAt) ?? Date.now(),
  };
  const label = target.customLabel ?? retired.customLabel;
  if (label !== undefined) merged.customLabel = label;
  const flagged = flag(target.flagged, retired.flagged);
  if (flagged !== undefined) merged.flagged = flagged;
  const hidden = flag(target.hidden, retired.hidden);
  if (hidden !== undefined) merged.hidden = hidden;
  const fromRepertoire = flag(target.addedFromRepertoire, retired.addedFromRepertoire);
  if (fromRepertoire !== undefined) merged.addedFromRepertoire = fromRepertoire;
  const note = joinText(
    target.flagNote as string | undefined,
    retired.flagNote as string | undefined,
  );
  if (note !== undefined) merged.flagNote = note;
  return merged;
}

/** The surviving chord's tally, with the retired card's added in. Its
 *  own description wins; the retired one's is kept only where the
 *  survivor has none. */
export function mergeChordCounts(target: Row, retired: Row): Row {
  const merged: Row = {
    correct: (num(target.correct) ?? 0) + (num(retired.correct) ?? 0),
    total: (num(target.total) ?? 0) + (num(retired.total) ?? 0),
  };
  const sound = target.soundCustom ?? retired.soundCustom;
  if (sound !== undefined) merged.soundCustom = sound;
  return merged;
}

/** The least of a Dexie table this migration needs. */
export interface MigrationTable {
  toArray(): Promise<unknown[]>;
  get(key: string): Promise<unknown>;
  update(key: string, changes: object): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  put(row: object): Promise<unknown>;
}

/** The least of an upgrade transaction this migration needs. */
export interface MigrationTx {
  table(name: string): MigrationTable;
}

export interface FoldCounts {
  attempts: number;
  spacingMoved: number;
  spacingMerged: number;
  diaryMoved: number;
  diaryMerged: number;
  annotations: number;
  curations: number;
  chordRows: number;
  goals: number;
  blocks: number;
  focusKeys: number;
}

/**
 * Move everything filed under the three retired cards onto the cards
 * they fold into. Idempotent: a second run finds no retired ref left
 * and changes nothing.
 *
 * EVERY TABLE IS READ WHOLE rather than through its index. An upgrade
 * runs once per browser, where a full walk of `attempts` costs one
 * read; the orphan sweep uses the index instead because it runs on
 * every app start.
 */
export async function foldRetiredChordCards(tx: MigrationTx): Promise<FoldCounts> {
  const counts: FoldCounts = {
    attempts: 0, spacingMoved: 0, spacingMerged: 0, diaryMoved: 0,
    diaryMerged: 0, annotations: 0, curations: 0, chordRows: 0,
    goals: 0, blocks: 0, focusKeys: 0,
  };

  // 1. attempts — the event log. Every row carries its own uuid, so a
  //    rewritten itemId can never collide with another row.
  const attempts = (await tx.table('attempts').toArray()) as Row[];
  for (const row of attempts) {
    if (row.moduleId !== MODULE_REF) continue;
    const next = foldItemRef(String(row.itemId));
    if (next === null) continue;
    await tx.table('attempts').update(String(row.id), { itemId: next });
    counts.attempts += 1;
  }

  // 2. spacingState — the schedule. One row per
  //    [moduleRef + itemRef + hand], so a fold onto a slot the reader
  //    already has is a MERGE, never a drop.
  const spacing = (await tx.table('spacingState').toArray()) as Row[];
  const slotOf = (r: Row, ref: string): string =>
    `${String(r.moduleRef)}|${ref}|${String(r.hand)}`;
  const bySlot = new Map<string, Row>();
  for (const row of spacing) bySlot.set(slotOf(row, String(row.itemRef)), row);
  for (const row of spacing) {
    if (row.moduleRef !== MODULE_REF) continue;
    const next = foldItemRef(String(row.itemRef));
    if (next === null) continue;
    const target = bySlot.get(slotOf(row, next));
    if (target === undefined) {
      // THE ROW'S ID IS LEFT ALONE. It is the sync key, and v36 moved
      // refs the same way — lookups go through the index, never the id.
      await tx.table('spacingState').update(String(row.id), { itemRef: next });
      bySlot.set(slotOf(row, next), { ...row, itemRef: next });
      counts.spacingMoved += 1;
    } else {
      await tx.table('spacingState').update(String(target.id), mergeSpacing(target, row));
      await tx.table('spacingState').delete(String(row.id));
      counts.spacingMerged += 1;
    }
    bySlot.delete(slotOf(row, String(row.itemRef)));
  }

  // 3. harmonicDiaryEntries — one entry per skill.
  const entries = (await tx.table('harmonicDiaryEntries').toArray()) as Row[];
  const bySkill = new Map<string, Row>();
  for (const e of entries) bySkill.set(String(e.skillId), e);
  for (const entry of entries) {
    const next = foldSkillId(String(entry.skillId));
    if (next === null) continue;
    const target = bySkill.get(next);
    if (target === undefined) {
      await tx.table('harmonicDiaryEntries').update(String(entry.entryId), { skillId: next });
      bySkill.set(next, { ...entry, skillId: next });
      counts.diaryMoved += 1;
    } else {
      await tx.table('harmonicDiaryEntries')
        .update(String(target.entryId), mergeDiary(target, entry));
      await tx.table('harmonicDiaryEntries').delete(String(entry.entryId));
      counts.diaryMerged += 1;
    }
    bySkill.delete(String(entry.skillId));
  }

  // 4. skillAnnotations — keyed ON the skill id, so a move is a new
  //    row plus a delete rather than an update.
  const annotations = (await tx.table('skillAnnotations').toArray()) as Row[];
  const annotationBySkill = new Map<string, Row>();
  for (const a of annotations) annotationBySkill.set(String(a.skillId), a);
  for (const row of annotations) {
    const next = foldSkillId(String(row.skillId));
    if (next === null) continue;
    const target = annotationBySkill.get(next);
    if (target === undefined) {
      await tx.table('skillAnnotations').put({ ...row, skillId: next });
    } else {
      await tx.table('skillAnnotations')
        .update(next, mergeAnnotation(target, row));
    }
    await tx.table('skillAnnotations').delete(String(row.skillId));
    counts.annotations += 1;
  }

  // 5. etItemCuration — keyed on the bare chord id, same shape.
  const curations = (await tx.table('etItemCuration').toArray()) as Row[];
  const curationByRef = new Map<string, Row>();
  for (const c of curations) curationByRef.set(String(c.itemRef), c);
  for (const row of curations) {
    const next = foldItemRef(String(row.itemRef));
    if (next === null) continue;
    const target = curationByRef.get(next);
    if (target === undefined) {
      await tx.table('etItemCuration').put({ ...row, itemRef: next });
    } else {
      await tx.table('etItemCuration').update(next, mergeCuration(target, row));
    }
    await tx.table('etItemCuration').delete(String(row.itemRef));
    counts.curations += 1;
  }

  // 6. chordQualities — the card itself. The tally goes onto the
  //    surviving chord and the row goes, or the quiz keeps asking a
  //    question the catalog no longer has an answer for.
  for (const [retiredId, targetId] of Object.entries(RETIRED_TO_TARGET)) {
    const retired = (await tx.table('chordQualities').get(retiredId)) as Row | undefined;
    if (retired === undefined) continue;
    const target = (await tx.table('chordQualities').get(targetId)) as Row | undefined;
    if (target !== undefined) {
      await tx.table('chordQualities').update(targetId, mergeChordCounts(target, retired));
    }
    await tx.table('chordQualities').delete(retiredId);
    counts.chordRows += 1;
  }

  // 7. userPrefs — the focus picker's chosen chords, as bare ids.
  const focus = (await tx.table('userPrefs').get(FOCUS_PREF_KEY)) as Row | undefined;
  if (focus !== undefined && Array.isArray(focus.value)) {
    const keys = (focus.value as unknown[]).map(String);
    const folded = [...new Set(keys.map(k => foldItemRef(k) ?? k))];
    if (folded.join(' ') !== keys.join(' ')) {
      await tx.table('userPrefs').put({ key: FOCUS_PREF_KEY, value: folded });
      counts.focusKeys += 1;
    }
  }

  // 8. goals — carry-over pushes leftover itemRefs into a monthly
  //    goal's `relatedItems`, as bare chord ids. A retired id left
  //    there is an item the goal can never cover.
  const goals = (await tx.table('goals').toArray()) as Row[];
  for (const goal of goals) {
    if (!Array.isArray(goal.relatedItems)) continue;
    const refs = (goal.relatedItems as unknown[]).map(String);
    if (!refs.some(r => foldItemRef(r) !== null)) continue;
    await tx.table('goals').update(String(goal.id), {
      relatedItems: [...new Set(refs.map(r => foldItemRef(r) ?? r))],
    });
    counts.goals += 1;
  }

  // 9. practiceBlocks — what each past block drilled. Migrated for the
  //    reason v36 gave: these are READ, and a stale ref resolves to
  //    nothing without saying so.
  const blocks = (await tx.table('practiceBlocks').toArray()) as Row[];
  for (const block of blocks) {
    if (!Array.isArray(block.itemRefs)) continue;
    const refs = (block.itemRefs as unknown[]).map(String);
    if (!refs.some(r => foldItemRef(r) !== null)) continue;
    await tx.table('practiceBlocks').update(String(block.id), {
      itemRefs: refs.map(r => foldItemRef(r) ?? r),
    });
    counts.blocks += 1;
  }

  return counts;
}

/**
 * Named Notes and Tritone Pairs are gone. Their practice is not.
 *
 * =====================================================================
 * TWO CLAIMS, AND ONLY ONE OF THEM IS EASY.
 *
 * That the rows move is easy to check and easy to get right. What this
 * file is really for is the two things that cannot be seen on screen:
 *
 * THAT NO ROW MOVES ONTO THE WRONG CARD. A mapping with one bad line
 * attaches a history to a question that was never answered, and nothing
 * looks broken — the card simply reads more practised than it is and is
 * scheduled accordingly. So the pairing is re-derived here from the two
 * sides and every pair is checked for a byte-identical answer, which is
 * the same claim the migration makes and the reason the F♯ card stays
 * out.
 *
 * THAT IT IS SAFE TO RUN TWICE, ON EITHER DEVICE, IN ANY ORDER. Silas
 * moves between a laptop and a phone within minutes and the phone may
 * be on an older build. So: a second run moves nothing; a legacy row
 * pushed back by a lagging device is moved again and MERGED rather than
 * duplicated; and the spacing row keeps its primary key, which is what
 * makes the whole thing an upsert rather than a delete the orphan sweep
 * could resolve the wrong way.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { pitchClassOf } from '../../../lib/spelling';
import { canonicalSkillId } from '../../skills/registry';
import { spacingRowId } from '../../../lib/spacingState';
import {
  migrateRetiredCategories, pairsFor, retiredCardMapping, retiredCards,
} from '../retiredCategoryMigration';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 7, 1);

const cardById = new Map(FLASHCARDS.map(c => [c.id, c]));
const axisOf = (id: string) =>
  (cardById.get(id) as { axis?: Record<string, string | number> }).axis!;

/** A spacing row keyed the way the app keys one. */
function spacingRow(itemRef: string, over: Record<string, unknown> = {}) {
  return {
    id: spacingRowId(MODULE, itemRef, 'both'),
    itemRef, moduleRef: MODULE, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquired',
    currentIntervalDays: 21, lastEngagedAt: T, nextDueAt: T + 1000,
    performanceHistory: [{ t: T, kind: 'attempt', correct: true }],
    studyLater: true, reviewFlagged: true, reviewFlagNote: 'come back to this',
    ...over,
  };
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.skillAnnotations.clear();
  await db.harmonicDiaryEntries.clear();
});

// =====================================================================
// The mapping
// =====================================================================

describe('which new card each retired one became', () => {
  const { moves, unpaired } = retiredCardMapping();

  it('pairs every retired card, and leaves none behind', () => {
    // 24 Named Notes + 12 Tritone Pairs = 36, less the F♯ card, which is
    // still in the deck under its own id and is therefore not retired.
    expect(retiredCards()).toHaveLength(35);
    expect(moves).toHaveLength(35);
    expect(unpaired).toEqual([]);
  });

  it('the F♯ card is not in it, because it is still in the deck', () => {
    // The one card whose answer the new family genuinely changes: the 4
    // of F♯ is B and the 4 of G♭ is C♭. It kept `nn-12`, so its rows
    // never move at all.
    expect(retiredCards().map(c => c.id)).not.toContain('nn-12');
    expect(moves.map(m => m.from)).not.toContain('nn-12');
    expect(cardById.get('nn-12')!.category).toBe('degree-notes');
    expect(cardById.get('nn-12')!.correctAnswer).toBe('B');
  });

  it('every pair has the identical ANSWER, character for character', () => {
    // Not the same pitch — the same spelling. This is the check that
    // makes the mapping provable rather than trusted.
    for (const { from, to } of moves) {
      const before = retiredCards().find(c => c.id === from)!;
      expect(cardById.get(to)!.correctAnswer, `${from} -> ${to}`)
        .toBe(before.correctAnswer);
    }
  });

  it('every pair asks about the same key, spelled either way', () => {
    // "Tritone of G♯" and "the ♯4 of A♭" are one question. Five of the
    // twelve tritone cards are exactly that, which is why this compares
    // pitch classes where the answer check compares strings.
    for (const { from, to } of moves) {
      const before = retiredCards().find(c => c.id === from)!;
      const subject = String(
        (before as { axis: Record<string, string | number> }).axis.key
        ?? (before as { axis: Record<string, string | number> }).axis.note,
      );
      expect(pitchClassOf(String(axisOf(to).key)), `${from} -> ${to}`)
        .toBe(pitchClassOf(subject));
    }
  });

  it('lands every tritone card on a six-semitone card', () => {
    // Eleven on a ♯4 and `tt-12` on the ♭5 of B, because its answer was
    // F and the ♯4 of B is E♯. Which of the pair a card lands on is
    // decided by its ANSWER and never by which one came first.
    for (const { from, to } of moves.filter(m => m.from.startsWith('tt-'))) {
      expect(cardById.get(to)!.facets?.semitones, from).toBe(6);
    }
    expect(moves.find(m => m.from === 'tt-12')!.to).toBe('dgn-B-b5');
  });

  it('refuses a card whose answer is spelled differently', () => {
    // The reversal. A card asking the 4 of F♯ and answering B finds
    // nothing, because the family answers C♭ — which is the same key on
    // a keyboard and a different answer on the page.
    const fSharp = { ...cardById.get('nn-12')!, id: 'pretend' };
    const targets = FLASHCARDS.filter(c => c.id.startsWith('dgn-'));
    expect(pairsFor(fSharp, targets)).toEqual([]);
  });

  it('refuses a card whose subject is a different key', () => {
    const wrongKey = {
      ...cardById.get('dgn-C-5')!,
      id: 'pretend',
      axis: { key: 'D', degree: '5' },
    };
    const targets = FLASHCARDS.filter(c => c.id.startsWith('dgn-'));
    // The 5 of C is G; nothing in D answers G at the 5.
    expect(pairsFor(wrongKey, targets)).toEqual([]);
  });

  it('lands only on a "name it" card', () => {
    // Both retired categories asked for a NOTE. Placing a row on the
    // reversal, or on the pressed card, would attach a history to a
    // question that was never asked.
    for (const { to } of moves) expect(to.startsWith('dgn-')).toBe(true);
  });
});

// =====================================================================
// The rows
// =====================================================================

describe('what follows the card', () => {
  it('moves the spacing row, the attempts, the annotation and the diary', async () => {
    const from = 'nn-1';
    const to = retiredIdFor(from);
    await db.attempts.bulkAdd([
      { id: 'a1', moduleId: MODULE, itemId: from, timestamp: T, isCorrect: true },
      { id: 'a2', moduleId: MODULE, itemId: from, timestamp: T + 1, isCorrect: false },
    ] as never[]);
    await db.spacingState.add(spacingRow(from) as never);
    await db.skillAnnotations.add({
      skillId: canonicalSkillId(MODULE, 'card', from),
      priority: 'high', tags: ['gospel'], note: 'the one I always miss',
      createdAt: T, updatedAt: T,
    } as never);
    await db.harmonicDiaryEntries.add({
      entryId: 'd1', skillId: canonicalSkillId(MODULE, 'card', from),
      userText: 'reminds me of the intro', isStarterEdited: true,
      emotionalTags: [], genreTags: [], createdAt: T, lastEdited: T,
    } as never);

    const report = await migrateRetiredCategories();

    expect(report.attempts).toBe(2);
    expect(report.spacing).toBe(1);
    expect(report.annotations).toBe(1);
    expect(report.diary).toBe(1);
    expect((await db.attempts.toArray()).map(a => a.itemId)).toEqual([to, to]);
    expect((await db.spacingState.toArray())[0].itemRef).toBe(to);
    expect((await db.skillAnnotations.toArray())[0].skillId)
      .toBe(canonicalSkillId(MODULE, 'card', to));
    expect((await db.harmonicDiaryEntries.toArray())[0].skillId)
      .toBe(canonicalSkillId(MODULE, 'card', to));
  });

  it('keeps the attempt timestamps exactly as they were', async () => {
    // A migration that rewrote them would be a falsified record.
    await db.attempts.add(
      { id: 'a1', moduleId: MODULE, itemId: 'tt-1', timestamp: T, isCorrect: true } as never,
    );
    await migrateRetiredCategories();
    expect((await db.attempts.toArray())[0].timestamp).toBe(T);
  });

  it('brings the schedule and the hand-written flags with it', async () => {
    // THE DIFFERENCE FROM THE `sdm-2-down-6th` MIGRATION. There the
    // question changed, so the interval was a claim about a question
    // that no longer existed and was withdrawn. Here the question is
    // asserted identical, so the schedule is honest and travels.
    await db.spacingState.add(spacingRow('tt-1') as never);
    await migrateRetiredCategories();
    const row = (await db.spacingState.toArray())[0];
    expect(row.itemRef).toBe(retiredIdFor('tt-1'));
    expect(row.currentIntervalDays).toBe(21);
    expect(row.nextDueAt).toBe(T + 1000);
    expect(row.acquisitionStage).toBe('acquired');
    expect(row.studyLater).toBe(true);
    expect(row.reviewFlagged).toBe(true);
    expect(row.reviewFlagNote).toBe('come back to this');
  });

  it('never touches a row belonging to another card or another module', async () => {
    await db.spacingState.bulkAdd([
      spacingRow('dgn-C-1'),
      { ...spacingRow('some-shape'), moduleRef: 'shapes-and-patterns',
        id: spacingRowId('shapes-and-patterns', 'some-shape', 'both') },
      spacingRow('nn-1'),
    ] as never[]);
    await db.attempts.bulkAdd([
      { id: 'a1', moduleId: 'reading', itemId: 'nn-1', timestamp: T, isCorrect: true },
    ] as never[]);

    await migrateRetiredCategories();

    const refs = (await db.spacingState.toArray()).map(r => r.itemRef).sort();
    expect(refs).toEqual(['dgn-C-1', 'dgn-C-5', 'some-shape']);
    // A `reading` attempt that happens to carry the string `nn-1` is a
    // different module's item and is not this migration's business.
    expect((await db.attempts.toArray())[0].itemId).toBe('nn-1');
  });

  it('says nothing and writes nothing when there is nothing to move', async () => {
    const report = await migrateRetiredCategories();
    expect(report).toMatchObject({
      attempts: 0, spacing: 0, spacingMerged: 0, annotations: 0, diary: 0,
    });
    expect(await db.spacingState.count()).toBe(0);
  });
});

// =====================================================================
// Two devices, either order, more than once
// =====================================================================

describe('safe to run twice', () => {
  it('moves nothing on a second run, and duplicates nothing', async () => {
    await db.attempts.add(
      { id: 'a1', moduleId: MODULE, itemId: 'nn-1', timestamp: T, isCorrect: true } as never,
    );
    await db.spacingState.add(spacingRow('nn-1') as never);

    const first = await migrateRetiredCategories();
    const second = await migrateRetiredCategories();

    expect(first.spacing).toBe(1);
    expect(second).toMatchObject({ attempts: 0, spacing: 0, spacingMerged: 0 });
    expect(await db.spacingState.count()).toBe(1);
    expect(await db.attempts.count()).toBe(1);
  });

  it('keeps the spacing row’s primary key, so sync sees an upsert', async () => {
    // THE CLAIM THE TWO-DEVICE CASE RESTS ON. A delete-plus-insert
    // would put the row in front of the orphan sweep, which resolves
    // against whichever device synced last. Only `itemRef` moves, and
    // both devices hold the same row id and move it to the same place.
    const id = spacingRowId(MODULE, 'nn-1', 'both');
    await db.spacingState.add(spacingRow('nn-1') as never);
    await migrateRetiredCategories();
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
  });

  it('merges rather than duplicates when a lagging device pushes a row back', async () => {
    // The sequence §1.6 of the plan warns about: laptop migrates, phone
    // is behind, phone pushes the old row up, and it comes back down.
    // The reader has drilled the new card in the meantime.
    const to = retiredIdFor('nn-1');
    await db.spacingState.add(spacingRow('nn-1') as never);
    await migrateRetiredCategories();

    // The new card, drilled since — and then the legacy row, back.
    await db.spacingState.update(spacingRowId(MODULE, 'nn-1', 'both'), {
      lastEngagedAt: T + 5000,
      performanceHistory: [{ t: T + 5000, kind: 'attempt', correct: true }],
      currentIntervalDays: 34, nextDueAt: T + 9000, studyLater: false,
      reviewFlagged: false, reviewFlagNote: undefined,
    });
    await db.spacingState.add(spacingRow('nn-1', { id: 'stale-uuid-from-phone' }) as never);

    const report = await migrateRetiredCategories();

    expect(report.spacingMerged).toBe(1);
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe(to);
    // Both histories, in time order; the fresher schedule; the flags
    // OR-ed, because a flag is a request and two requests are one.
    expect(rows[0].performanceHistory.map(h => h.t)).toEqual([T, T + 5000]);
    expect(rows[0].currentIntervalDays).toBe(34);
    expect(rows[0].lastEngagedAt).toBe(T + 5000);
    expect(rows[0].studyLater).toBe(true);
    expect(rows[0].reviewFlagNote).toBe('come back to this');
  });

  it('merges an annotation rather than dropping either side', async () => {
    const to = canonicalSkillId(MODULE, 'card', retiredIdFor('nn-1'));
    await db.skillAnnotations.bulkAdd([
      { skillId: canonicalSkillId(MODULE, 'card', 'nn-1'),
        tags: ['gospel'], note: 'the old note', createdAt: T, updatedAt: T },
      { skillId: to, tags: ['blues'], priority: 'high',
        createdAt: T + 1, updatedAt: T + 1 },
    ] as never[]);

    await migrateRetiredCategories();

    const rows = await db.skillAnnotations.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].skillId).toBe(to);
    expect([...rows[0].tags].sort()).toEqual(['blues', 'gospel']);
    // The destination's own priority stands; the legacy note fills in
    // where the destination had none, so nothing hand-written is lost.
    expect(rows[0].priority).toBe('high');
    expect(rows[0].note).toBe('the old note');
  });
});

/** Where a retired card's rows belong, from the migration's own map. */
function retiredIdFor(from: string): string {
  const move = retiredCardMapping().moves.find(m => m.from === from);
  if (move === undefined) throw new Error(`${from} has no pair`);
  return move.to;
}

/**
 * The slash family regenerated for thirteen keys, and eighty-four
 * cards' practice with it.
 *
 * =====================================================================
 * THE PAIR THAT COULD GO WRONG IS F♯ AND G♭, as it was for the modes.
 * `sc-1-3-F#` MEANS the G♭ card while SPELLING F♯; if its rows landed
 * on the new F♯ card, a reader would find a key they had never drilled
 * reading as practised. That pair is asserted by name.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { spacingRowId } from '../../../lib/spacingState';
import { reusedIds } from '../foldInByIdentity';
import {
  describeSlashFoldIn, foldInSlashCards, retiredSlashCardRecords, slashMapping,
} from '../slashFoldIn';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 4);

function spacingRow(itemRef: string, over: Record<string, unknown> = {}) {
  return {
    id: spacingRowId(MODULE, itemRef, 'both'),
    itemRef, moduleRef: MODULE, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquired',
    currentIntervalDays: 21, lastEngagedAt: T, nextDueAt: T + 1000,
    performanceHistory: [{ t: T, kind: 'attempt', correct: true }],
    studyLater: true,
    ...over,
  } as never;
}

beforeEach(async () => {
  await db.attempts.clear();
  await db.spacingState.clear();
  await db.skillAnnotations.clear();
  await db.harmonicDiaryEntries.clear();
});

describe('which new card each retired one became', () => {
  const { moves, unpaired } = slashMapping();

  it('pairs all eighty-four, and leaves none behind', () => {
    // Seven shapes across the twelve identity keys.
    expect(retiredSlashCardRecords()).toHaveLength(84);
    expect(moves).toHaveLength(84);
    expect(unpaired).toEqual([]);
  });

  it('lands the G♭ cards on G♭, not on the new F♯ ones', () => {
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('sc-1-3-F#')).toBe('sc-slash-1-3-Gb');
    expect(by.get('sc-5-7-F#')).toBe('sc-slash-5-7-Gb');
    expect(by.get('sc-2-1-F#')).toBe('sc-slash-2-1-Gb');
  });

  it('and F♯ major is a different card with a different answer', () => {
    const sharp = FLASHCARDS.find(c => c.id === 'sc-slash-1-3-F#')!;
    const flat = FLASHCARDS.find(c => c.id === 'sc-slash-1-3-Gb')!;
    expect(sharp.correctAnswer).toBe('F♯/A♯');
    expect(flat.correctAnswer).toBe('G♭/B♭');
  });

  it('proves each with the same question and the same answer', () => {
    const live = new Map(FLASHCARDS.map(c => [c.id, c]));
    const old = new Map(retiredSlashCardRecords().map(c => [c.id, c]));
    for (const { from, to } of moves) {
      expect(live.get(to)!.question, from).toBe(old.get(from)!.question);
      expect(live.get(to)!.correctAnswer, from).toBe(old.get(from)!.correctAnswer);
    }
  });

  it('mints no retired id again', () => {
    expect(reusedIds(retiredSlashCardRecords())).toEqual([]);
    // And the old shape is gone rather than merely these instances.
    for (const c of FLASHCARDS.filter(x => x.category === 'slash-chords')) {
      expect(c.id, c.id).not.toMatch(/^sc-\d-\d/);
    }
  });

  it('covers seven shapes in thirteen keys', () => {
    expect(FLASHCARDS.filter(c => c.id.startsWith('sc-slash-'))).toHaveLength(91);
  });
});

describe('what follows the card', () => {
  it('moves the row and its flag, and touches nothing else', async () => {
    await db.spacingState.bulkPut([
      spacingRow('sc-1-3-F#'), spacingRow('sc-13'),
    ] as never[]);
    const r = await foldInSlashCards();
    expect(r.spacing).toBe(1);

    const moved = await db.spacingState.get(spacingRowId(MODULE, 'sc-1-3-F#', 'both'));
    expect(moved!.itemRef).toBe('sc-slash-1-3-Gb');
    expect(moved!.studyLater).toBe(true);
    expect((await db.spacingState.toArray()).map(s => s.itemRef).sort())
      .toEqual(['sc-13', 'sc-slash-1-3-Gb']);
  });
});

describe('safe on either device, in either order, more than once', () => {
  it('a second run moves nothing and says nothing', async () => {
    await db.spacingState.add(spacingRow('sc-4-5-D'));
    await foldInSlashCards();
    const again = await foldInSlashCards();
    expect(again).toMatchObject({ attempts: 0, spacing: 0, spacingMerged: 0 });
    expect(describeSlashFoldIn(again)).toBeNull();
  });

  it('merges when a lagging device pushes one back', async () => {
    await db.spacingState.add(spacingRow('sc-slash-4-5-D', {
      lastEngagedAt: T + 5000, studyLater: false,
    }));
    await db.spacingState.add(spacingRow('sc-4-5-D', { lastEngagedAt: T }));
    const r = await foldInSlashCards();
    expect(r.spacingMerged).toBe(1);
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('sc-slash-4-5-D');
    expect(rows[0].studyLater).toBe(true);
  });

  it('runs on a database that never had any of these rows', async () => {
    const r = await foldInSlashCards();
    expect(r).toMatchObject({ attempts: 0, spacing: 0, unpaired: [] });
  });
});

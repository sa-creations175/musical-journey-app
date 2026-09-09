/**
 * The pentatonic family: the notes move, the formulas and the
 * "share the same" cards do not.
 *
 * =====================================================================
 * TWO KINDS OF UNPAIRED, AND BOTH ARE RULINGS RATHER THAN GAPS.
 *
 * The five formula cards have no replacement at all — pick the notes,
 * per key, no formulas. The twelve relative cards have a replacement
 * that asks something else: which minor pentatonic to play over a major
 * key, rather than what two scales share. A pairing that moved a row
 * onto a different question would be the wrong-mapping failure this
 * whole mechanism exists to refuse.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { FLASHCARDS } from '../catalog';
import { spacingRowId } from '../../../lib/spacingState';
import { reusedIds } from '../foldInByIdentity';
import {
  describePentatonicFoldIn, foldInPentatonicCards, pentatonicMapping,
  retiredPentatonicCards,
} from '../pentatonicFoldIn';

const MODULE = 'harmonic-fluency';
const T = Date.UTC(2026, 8, 6);

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
});

describe('which new card each retired one became', () => {
  const { moves, unpaired } = pentatonicMapping();

  it('moves every notes card and nothing else', () => {
    expect(retiredPentatonicCards()).toHaveLength(41);
    expect(moves).toHaveLength(24);
    expect(unpaired).toHaveLength(17);
  });

  it('keeps the C minor card\'s history, which lived at pent-8', () => {
    const by = new Map(moves.map(m => [m.from, m.to]));
    expect(by.get('pent-8')).toBe('pent-notes-minor-C');
    expect(by.get('pent-major-F#')).toBe('pent-notes-major-Gb');
  });

  it('gives F♯ major pentatonic a card of its own', () => {
    // The thirteenth root, and the reason the family needed a new
    // prefix: `pent-major-F#` already meant the G♭ card.
    const sharp = FLASHCARDS.find(c => c.id === 'pent-notes-major-F#')!;
    expect(sharp.correctAnswer).toBe('F♯, G♯, A♯, C♯, D♯');
    const flat = FLASHCARDS.find(c => c.id === 'pent-notes-major-Gb')!;
    expect(flat.correctAnswer).toBe('G♭, A♭, B♭, D♭, E♭');
  });

  it('there is no thirteenth MINOR root, and that is a stop', () => {
    // G♭ minor pentatonic is G♭ B𝄫 C♭ D♭ F♭. The follow-up ruling that
    // let double accidentals into the deck said not to widen it beyond
    // intervals, so the card is reported rather than written.
    expect(FLASHCARDS.some(c => c.id === 'pent-notes-minor-Gb')).toBe(false);
    expect(FLASHCARDS.filter(c => c.id.startsWith('pent-notes-minor-')))
      .toHaveLength(12);
  });

  it('refuses the formula cards, which have no replacement', () => {
    const why = new Map(unpaired.map(u => [u.from, u.reason]));
    for (const id of ['pent-1', 'pent-2', 'pent-5', 'pent-6', 'pent-9']) {
      expect(why.get(id), id).toContain('nothing in the deck asks');
    }
  });

  it('refuses the relative cards, which have a DIFFERENT replacement', () => {
    const why = new Map(unpaired.map(u => [u.from, u.reason]));
    expect(why.get('pent-10')).toContain('nothing in the deck asks');
    expect(unpaired.filter(u => u.from.startsWith('pent-relative-')))
      .toHaveLength(11);
    // And what replaced them asks its own question.
    const lick = FLASHCARDS.find(c => c.id === 'pent-lick-C')!;
    expect(lick.correctAnswer).toBe('A minor pentatonic');
  });

  it('never puts a gloss in an option', () => {
    // `scaleName` writes "G♯ (A♭) minor pentatonic" because the scale
    // is genuinely double-named — right in a question, a tell in an
    // option, where three of thirteen would carry a bracket.
    for (const c of FLASHCARDS.filter(x => x.id.startsWith('pent-lick-'))) {
      for (const option of [c.correctAnswer, ...c.decoys]) {
        expect(option, `${c.id}: ${option}`).not.toContain('(');
      }
    }
  });

  it('mints no retired id again', () => {
    expect(reusedIds(retiredPentatonicCards())).toEqual([]);
  });
});

describe('what follows the card', () => {
  it('moves a notes row and leaves a retired formula row alone', async () => {
    await db.spacingState.bulkPut([
      spacingRow('pent-major-Ab'), spacingRow('pent-1'),
    ] as never[]);
    const r = await foldInPentatonicCards();
    expect(r.spacing).toBe(1);
    expect((await db.spacingState.toArray()).map(s => s.itemRef).sort())
      .toEqual(['pent-1', 'pent-notes-major-Ab']);
  });
});

describe('safe on either device, in either order, more than once', () => {
  it('a second run moves nothing, but still says what could not pair', async () => {
    await db.spacingState.add(spacingRow('pent-major-Ab'));
    await foldInPentatonicCards();
    const again = await foldInPentatonicCards();
    expect(again).toMatchObject({ attempts: 0, spacing: 0, spacingMerged: 0 });
    expect(describePentatonicFoldIn(again)).toContain('pent-1');
  });

  it('merges when a lagging device pushes one back', async () => {
    await db.spacingState.add(spacingRow('pent-notes-major-Ab', {
      lastEngagedAt: T + 5000, studyLater: false,
    }));
    await db.spacingState.add(spacingRow('pent-major-Ab', { lastEngagedAt: T }));
    const r = await foldInPentatonicCards();
    expect(r.spacingMerged).toBe(1);
    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('pent-notes-major-Ab');
    expect(rows[0].studyLater).toBe(true);
  });
});

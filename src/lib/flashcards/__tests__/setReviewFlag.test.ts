// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import { setReviewFlag, listFlaggedCards } from '../spacedRepetition';

describe('setReviewFlag + listFlaggedCards round-trip', () => {
  beforeEach(async () => {
    await db.flashcardStates.clear();
  });

  it('persists flagged=true and surfaces it via the filter query', async () => {
    await setReviewFlag('card-a', true, 'check the phrasing here');

    const row = await db.flashcardStates.get('card-a');
    expect(row?.flagged).toBe(true);
    expect(row?.flagNote).toBe('check the phrasing here');

    const viaFilter = await db.flashcardStates
      .filter(s => s.flagged === true)
      .toArray();
    expect(viaFilter.map(r => r.cardId)).toEqual(['card-a']);

    const viaHelper = await listFlaggedCards();
    expect(viaHelper.map(r => r.cardId)).toEqual(['card-a']);
  });

  it('clears flag and note when flagged=false', async () => {
    await setReviewFlag('card-b', true, 'first note');
    await setReviewFlag('card-b', false);

    const row = await db.flashcardStates.get('card-b');
    expect(row?.flagged).toBe(false);
    expect(row?.flagNote).toBeUndefined();

    const flagged = await db.flashcardStates
      .filter(s => s.flagged === true)
      .toArray();
    expect(flagged).toEqual([]);
  });

  it('preserves the flag through a subsequent SR update (no overwrite)', async () => {
    await setReviewFlag('card-c', true, 'remember this');

    const { recordAttempt } = await import('../spacedRepetition');
    await recordAttempt('card-c', true);

    const row = await db.flashcardStates.get('card-c');
    expect(row?.flagged).toBe(true);
    expect(row?.flagNote).toBe('remember this');
  });

  it('matches a real HF cardId so the panel-side cardsById lookup will succeed', async () => {
    const { FLASHCARDS } = await import('../../../modules/harmonic-fluency/catalog');
    const realCardId = FLASHCARDS[0]!.id;
    await setReviewFlag(realCardId, true);
    const rows = await db.flashcardStates
      .filter(s => s.flagged === true)
      .toArray();
    expect(rows.map(r => r.cardId)).toContain(realCardId);
    const cardsById = new Map(FLASHCARDS.map(c => [c.id, c]));
    expect(cardsById.get(realCardId)).toBeDefined();
  });
});

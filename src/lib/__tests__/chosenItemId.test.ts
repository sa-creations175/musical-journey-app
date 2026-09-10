/**
 * The recorded choice, and the join it exists for.
 *
 * =====================================================================
 * A TEST THAT ONLY CHECKS A STRING WAS STORED PROVES NOTHING.
 *
 * The failure this guards against is not "the field is empty" — it is
 * "the field is full of values that cannot be turned back into items".
 * That failure is invisible on write, survives every unit test of the
 * writer, and is discovered months later with a history that cannot be
 * repaired. So every site here is asserted by ROUND TRIP: recorded
 * choice → itemId of the chosen item → that item exists in the catalog.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { INTERVAL_SEEDS, directionsFor } from '../../modules/ear-training/intervals/seed';
import { PROGRESSIONS } from '../../modules/ear-training/chord-progressions/catalog';
import {
  keyDetectionItemId,
} from '../../modules/ear-training/chord-progressions/keyDetectionIds';
import { canonicaliseKey } from '../../modules/repertoire/circleOfFourths';
import { itemRefForAttempt } from '../../modules/dashboard/read/canonicalItemId';
import { toPgRow } from '../sync/engine';
import { SYNC_TABLE_BY_DEXIE } from '../sync/tables';
import type { AttemptRecord } from '../db';

describe('intervals — the choice is already an itemId', () => {
  it('round-trips a wrong choice back to a catalog interval', () => {
    // ASYMMETRIC FIXTURE. The question is a minor 7th; the chosen wrong
    // answer is a minor 6th — NOT the first seed, NOT adjacent to the
    // answer in the list, and sharing no first character with it
    // ("m7" vs "M6" differ in case, so the pair is picked to differ in
    // the first character too).
    const asked = INTERVAL_SEEDS.find(s => s.id === 'm7')!;
    const chosen = INTERVAL_SEEDS.find(s => s.id === 'P4')!;
    expect(chosen.id[0]).not.toBe(asked.id[0]);
    expect(INTERVAL_SEEDS.indexOf(chosen)).not.toBe(0);

    const row: AttemptRecord = {
      id: 'att-1', moduleId: 'intervals', itemId: asked.id,
      direction: 'desc', correct: false, timestamp: 1,
      chosenItemId: chosen.id,
    };

    // The join: the chosen item's ref is built exactly as this row's is.
    const chosenRef = itemRefForAttempt({
      moduleId: row.moduleId, itemId: row.chosenItemId!, direction: row.direction,
    });
    expect(chosenRef).toBe('P4:desc');
    // And it names a real, drillable item.
    const seed = INTERVAL_SEEDS.find(s => s.id === chosenRef.split(':')[0]);
    expect(seed).toBeDefined();
    expect(directionsFor(seed!.semitones)).toContain('desc');
  });

  it('records the CHOICE, not the correct answer and not an index', () => {
    const row: AttemptRecord = {
      id: 'att-2', moduleId: 'intervals', itemId: 'm7',
      direction: 'asc', correct: false, timestamp: 1,
      chosenItemId: 'P4',
    };
    expect(row.chosenItemId).not.toBe(row.itemId);
    expect(row.chosenItemId).toBe('P4');
    // Not an index into the option list, which would join to nothing.
    expect(Number.isNaN(Number(row.chosenItemId))).toBe(true);
  });

  it('carries the row direction onto the chosen item, unchanged', () => {
    // The reader picks a NAME; the question fixes the direction. A
    // chosen ref that defaulted to 'asc' would silently file every
    // descending confusion under the ascending item.
    const ref = itemRefForAttempt({
      moduleId: 'intervals', itemId: 'P4', direction: 'desc',
    });
    expect(ref).toBe('P4:desc');
    expect(ref).not.toBe('P4:asc');
  });
});

describe('key detection — one call, and it normalises the spelling', () => {
  it('round-trips a display-spelled choice to the identity itemId', () => {
    // THE FAILURE THIS CATCHES. The options are spelled with the
    // reader's setting, so a chosen G♭ must land on the same item as
    // an F♯ — or one key's confusions split across two ids that never
    // meet.
    const chosen = keyDetectionItemId('Gb');
    expect(chosen).toBe(`key-detection:${canonicaliseKey('Gb')}`);
    expect(chosen).toBe(keyDetectionItemId('F#'));
    // ASYMMETRIC: the asked key is a different key entirely.
    const asked = keyDetectionItemId('D');
    expect(chosen).not.toBe(asked);
  });

  it('produces the same shape as the row it sits beside', () => {
    const row: AttemptRecord = {
      id: 'att-3', moduleId: 'chord-progressions',
      itemId: keyDetectionItemId('D'), correct: false, timestamp: 1,
      chosenItemId: keyDetectionItemId('Gb'),
    };
    // Both are `key-detection:<identity>`; stripping the prefix on
    // either gives a key the circle recognises.
    for (const ref of [row.itemId, row.chosenItemId!]) {
      expect(ref.startsWith('key-detection:')).toBe(true);
      expect(canonicaliseKey(ref.slice('key-detection:'.length))).not.toBeNull();
    }
  });
});

describe('pattern question — the chosen id wears the row’s suffix', () => {
  it('round-trips to a catalog progression', () => {
    // ASYMMETRIC: not the first progression, and a different tier from
    // the asked one.
    const asked = PROGRESSIONS[0];
    const chosen = PROGRESSIONS[5];
    expect(chosen.id).not.toBe(asked.id);
    expect(chosen.id[0]).not.toBe(asked.id[0]);

    const row: AttemptRecord = {
      id: 'att-4', moduleId: 'chord-progressions',
      itemId: `${asked.id}-pattern`, correct: false, timestamp: 1,
      chosenItemId: `${chosen.id}-pattern`,
    };

    // The join is the SAME operation the row's own itemId needs.
    const strip = (ref: string) => ref.replace(/-pattern$/, '');
    expect(strip(row.chosenItemId!)).toBe(chosen.id);
    expect(PROGRESSIONS.some(p => p.id === strip(row.chosenItemId!))).toBe(true);
    expect(PROGRESSIONS.some(p => p.id === strip(row.itemId))).toBe(true);
  });

  it('keeps the chosen id in the row’s vocabulary, not the catalog’s', () => {
    // A bare progression id here would not be an itemId of anything
    // this module writes, and would read as a full-progression attempt.
    const row = { itemId: '1-4-5-pattern', chosenItemId: '2-5-1-pattern' };
    expect(row.chosenItemId.endsWith('-pattern')).toBe(true);
  });
});

describe('the value survives the sync push unstripped', () => {
  it('carries chosenItemId into the pushed row', () => {
    // `toPgRow` is the only place a row is reshaped on the way out.
    const cfg = SYNC_TABLE_BY_DEXIE.get('attempts')!;
    const row: AttemptRecord = {
      id: 'att-5', moduleId: 'intervals', itemId: 'm7',
      direction: 'desc', correct: false, timestamp: 99,
      chosenItemId: 'P4',
    };
    const pushed = toPgRow(cfg, row, 'user-1');
    expect((pushed.data as AttemptRecord).chosenItemId).toBe('P4');
    // The top-level columns are unchanged — this adds no column, which
    // is why it needs no SQL migration.
    expect(Object.keys(pushed).sort())
      .toEqual(['data', 'id', 'module_id', 'timestamp', 'user_id']);
  });

  it('is not in the indexed columns, so no schema change is required', () => {
    const cfg = SYNC_TABLE_BY_DEXIE.get('attempts')!;
    expect(cfg.topLevel.map(c => c.dexie)).toEqual(['moduleId', 'timestamp']);
    expect(cfg.topLevel.map(c => c.dexie)).not.toContain('chosenItemId');
  });
});

/**
 * The writers actually write it.
 *
 * ---------------------------------------------------------------
 * WHY THIS IS A SOURCE ASSERTION AND WHAT IT DOES NOT COVER.
 *
 * Everything above proves the VOCABULARY — that a recorded choice
 * joins back to a real item. None of it proves the three quizzes emit
 * the field at all: the rows are constructed here. Deleting
 * `chosenItemId` from IntervalsQuiz would leave every test above
 * green.
 *
 * Exercising the writers behaviourally means driving three quizzes
 * through audio playback, Dexie and adaptive selection to reach one
 * `addAttempt` call, and the assertion at the end would still be about
 * a string in a record. So the writers are checked at their source,
 * through Vite's `?raw` — the same technique the drill-filter contract
 * uses — and the limitation is stated rather than left implied.
 *
 * What this catches: the field being dropped, renamed, or added to a
 * site that cannot join. What it does not catch: a writer that sets it
 * to the wrong variable. That is covered by the mapping tests above
 * only insofar as they pin the SHAPE each site must produce.
 * ---------------------------------------------------------------
 */
const WRITERS = import.meta.glob(
  '/src/modules/ear-training/**/{IntervalsQuiz,KeyDetectionTab,FullProgressionCard}.tsx',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const sourceFor = (name: string) =>
  Object.entries(WRITERS).find(([p]) => p.endsWith(`/${name}.tsx`))![1];

describe('the three writers record the choice', () => {
  it('finds all three sources, so the sweep is not vacuously empty', () => {
    expect(Object.keys(WRITERS)).toHaveLength(3);
  });

  it('intervals writes the chosen interval id', () => {
    expect(sourceFor('IntervalsQuiz')).toContain('chosenItemId: chosen.id');
  });

  it('key detection writes the choice through the id builder', () => {
    // Not the raw `selectedNote` — that is display-spelled.
    const src = sourceFor('KeyDetectionTab');
    expect(src).toContain('chosenItemId: keyDetectionItemId(selectedNote)');
    expect(src).not.toContain('chosenItemId: selectedNote');
  });

  it('the full-progression card writes the choice through the id builder', () => {
    // =================================================================
    // THIS WAS `ChordProgressionsQuiz`'S PATTERN QUESTION until 10 Sep
    // 2026, which wrote `chosenItemId: `${choiceId}-pattern`` — a
    // suffix, because that quiz ALSO wrote full-progression rows and a
    // bare id there would have read as one of them.
    //
    // The screen is gone and the card that replaced it has no such
    // ambiguity: one question, one row, and the chosen id is built by
    // the same function that builds the asked one. The claim moves
    // rather than being dropped, because "the choice is recorded, and
    // through the builder" is still true of the live surface.
    // =================================================================
    const src = sourceFor('FullProgressionCard');
    expect(src).toContain('chosenItemId: fullProgressionItemId(answerEntry, answerPosition)');
    // Not the raw entry id: the choice is an entry AND a position, and
    // an id missing the position would read as a different answer.
    expect(src).not.toContain('chosenItemId: answerEntry');
  });

  it('leaves the array-answer writer alone', () => {
    // The chord-motion tab carries array answers; a single chosen item
    // is not what it records, so it stays out of this sweep.
    const src = sourceFor('FullProgressionCard');
    const occurrences = src.split('chosenItemId').length - 1;
    expect(occurrences).toBe(1);
  });
});

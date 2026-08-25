/**
 * The two things the registry could not supply before 2b.
 *
 * 1. Reading was not in it at all — 188 items invisible to every
 *    surface that reads the catalogue.
 * 2. Every record was a SUMMARY. A tier is twenty reps collapsed to a
 *    word; a strip needs the reps.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSkillRegistry } from '../registry';
import { readingSkillRows } from '../../reading/skillRecords';
import { enumerateReading } from '../../goals/scopeEnumeration';
import { noteItemRef, signatureItemRef, SIGNATURES } from '../../reading/catalog';
import { INTERVAL_SEEDS, directionsFor } from '../../ear-training/intervals/seed';
import { db, type AttemptRecord } from '../../../lib/db';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 24, 12);

/** `attempts` has a CLIENT-GENERATED primary key, so a fixture without
 *  one is rejected outright rather than auto-numbered. */
let nextId = 0;
const att = (
  moduleId: string, itemId: string, correct: boolean, daysAgo: number,
  extra: Partial<AttemptRecord> = {},
): AttemptRecord => ({
  id: `fixture-${nextId++}`,
  moduleId, itemId, correct, timestamp: NOW - daysAgo * DAY, ...extra,
});

beforeEach(async () => {
  await db.attempts.clear();
  await db.flashcardStates.clear();
});

describe('reading is in the registry', () => {
  it('emits one row per catalog item, and none the parser refuses', () => {
    const rows = readingSkillRows();
    expect(rows).toHaveLength(enumerateReading().length);
    expect(rows.length).toBeGreaterThan(180);
    // Every ref round-trips: no row carries an id as its label, which is
    // the §1.8b defect this would otherwise reintroduce at scale.
    for (const r of rows) expect(r.name).not.toContain(r.itemRef);
  });

  it('gives every row typed coordinates, never parsed out of the id', () => {
    const rows = readingSkillRows();
    const sig = rows.find(r => r.skill === 'sig')!;
    expect(Object.keys(sig.axis).sort())
      .toEqual(['accidentals', 'direction', 'mode', 'signature']);
    const note = rows.find(r => r.skill === 'note')!;
    expect(Object.keys(note.axis).sort()).toEqual(['clef', 'position']);
    const chord = rows.find(r => r.skill === 'chord')!;
    expect(Object.keys(chord.axis).sort()).toEqual(['clef', 'position', 'quality']);
    const shape = rows.find(r => r.skill === 'shape')!;
    expect(Object.keys(shape.axis).sort()).toEqual(['family', 'position']);
  });

  it('signs the accidental count so the axis orders itself', () => {
    // Flats negative, C at zero, sharps positive — which IS the circle
    // of fifths, so no second ordering table is needed.
    const rows = readingSkillRows().filter(r => r.skill === 'sig');
    const forSig = (id: string) =>
      rows.find(r => r.axis.signature === id)!.axis.accidentals;
    expect(forSig('6f')).toBe(-6);
    expect(forSig('0')).toBe(0);
    expect(forSig('6s')).toBe(6);
    // ASYMMETRIC: 6f and 6s share a count and must not collide.
    expect(forSig('6f')).not.toBe(forSig('6s'));
  });

  it('appears in buildSkillRegistry with its own module label', async () => {
    const records = await buildSkillRegistry(NOW);
    const reading = records.filter(r => r.moduleId === 'reading');
    expect(reading.length).toBe(enumerateReading().length);
    expect(reading[0].moduleLabel).toBe('reading');
    expect(reading[0].moduleRoute).toBe('/reading');
    // The skill id carries the SKILL as its subtype, not a constant —
    // annotations key on it, so a constant would be a stored mistake.
    const subtypes = new Set(reading.map(r => r.skillId.split(':')[1]));
    expect([...subtypes].sort()).toEqual(['chord', 'note', 'shape', 'sig']);
  });
});

describe('a record carries the window, not a summary of it', () => {
  it('returns the actual reps, newest first, for a reading item', async () => {
    const ref = noteItemRef('treble', 0);
    // ASYMMETRIC — a palindrome reads the same reversed, and outcomes
    // that differ are what prove this is not a count.
    await db.attempts.bulkAdd([
      att('reading', ref, true, 0),
      att('reading', ref, false, 1),
      att('reading', ref, false, 2),
    ]);
    const rec = (await buildSkillRegistry(NOW)).find(r => r.itemId === ref)!;
    expect(rec.window.map(w => w.correct)).toEqual([true, false, false]);
    expect(rec.window.map(w => w.timestamp))
      .toEqual([NOW, NOW - DAY, NOW - 2 * DAY]);
  });

  it('caps the window rather than carrying a whole history', async () => {
    const ref = signatureItemRef(SIGNATURES[0].id, 'major', 'name');
    await db.attempts.bulkAdd(
      Array.from({ length: 40 }, (_, i) => att('reading', ref, i % 2 === 0, i)),
    );
    const rec = (await buildSkillRegistry(NOW)).find(r => r.itemId === ref)!;
    expect(rec.window).toHaveLength(20);
    // Newest twenty, not the oldest twenty.
    expect(rec.window[0].timestamp).toBe(NOW);
  });

  it('carries reps for harmonic fluency, whose TIER reads another source', async () => {
    // The tier comes from FlashcardState; the strip comes from attempts.
    // Pinned because they can disagree — see the note in registry.ts.
    await db.attempts.bulkAdd([
      att('harmonic-fluency', 'tt-1', true, 0),
      att('harmonic-fluency', 'tt-1', false, 1),
    ]);
    const rec = (await buildSkillRegistry(NOW)).find(r => r.itemId === 'tt-1')!;
    expect(rec.window.map(w => w.correct)).toEqual([true, false]);
  });

  it('splits interval reps by direction', async () => {
    await db.attempts.bulkAdd([
      att('intervals', 'M3', true, 0, { direction: 'asc' }),
      att('intervals', 'M3', false, 1, { direction: 'desc' }),
    ]);
    const records = await buildSkillRegistry(NOW);
    const asc = records.find(r => r.itemId === 'M3:asc')!;
    const desc = records.find(r => r.itemId === 'M3:desc')!;
    expect(asc.window.map(w => w.correct)).toEqual([true]);
    expect(desc.window.map(w => w.correct)).toEqual([false]);
  });

  it('leaves the window EMPTY where a module records no reps', async () => {
    // Not "no reps yet" — production lessons carry a self-rating, so
    // there is nothing to strip and never will be.
    const records = await buildSkillRegistry(NOW);
    const lesson = records.find(r => r.moduleId === 'production')!;
    expect(lesson.window).toEqual([]);
    // And the distinction is real: an attempt-shaped module with no
    // attempts is also empty, which is why the comment at each call
    // site is the only thing that tells them apart.
    const reading = records.find(r => r.moduleId === 'reading')!;
    expect(reading.window).toEqual([]);
  });
});

describe('the catalogue stopped listing a skill the drill cannot serve', () => {
  it('emits no Unison (descending) row', async () => {
    const records = await buildSkillRegistry(NOW);
    const intervals = records.filter(r => r.moduleId === 'intervals');
    expect(intervals.map(r => r.itemId)).not.toContain('P1:desc');
    expect(intervals.map(r => r.itemId)).toContain('P1:asc');
    // And the count follows the seed list rather than a literal pair.
    const expected = INTERVAL_SEEDS
      .reduce((n, s) => n + directionsFor(s.semitones).length, 0);
    expect(intervals).toHaveLength(expected);
  });
});

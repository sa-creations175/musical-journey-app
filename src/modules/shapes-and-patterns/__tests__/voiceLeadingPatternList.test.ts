/**
 * The pattern list: one section per id, and an overridden built-in is
 * still a built-in.
 *
 * THE REGRESSION THIS PINS. `minor-251` rendered twice — once from the
 * catalog and once from a custom entry carrying the same id — and the
 * second section had `builtin: false`, so its cells were handed no
 * click handler and its React key collided with the first. Both halves
 * of that are asserted below, because a fix that removes the duplicate
 * while also removing the drill flow would look right on screen and be
 * worse than the bug.
 */
import { describe, expect, it } from 'vitest';
import {
  applyRemove,
  applyRename,
  mergePatternList,
  overrideIsEmpty,
  type CustomPattern,
} from '../voiceLeadingPatternList';
import { VOICE_LEADING_PATTERNS } from '../catalog';

const MINOR_251 = VOICE_LEADING_PATTERNS.find(p => p.id === 'minor-251')!;

/** The row actually found in the live database — same id as the
 *  built-in, same label, created by a stray click on the title. */
const STRAY_ROW: CustomPattern = {
  id: 'minor-251',
  label: 'Minor 2-5-1',
  createdAt: Date.parse('2026-08-28T04:31:47.176Z'),
};

const OWN_PATTERN: CustomPattern = {
  id: 'custom-1756-abcd',
  label: 'Stepwise 7-3 Connecting',
  createdAt: 1,
};

describe('one section per id', () => {
  it('an override does not add a section — the count is the catalog', () => {
    const merged = mergePatternList([STRAY_ROW]);
    expect(merged).toHaveLength(VOICE_LEADING_PATTERNS.length);
    expect(merged.filter(p => p.id === 'minor-251')).toHaveLength(1);
  });

  it('no id appears twice, whatever is stored — the duplicate React key', () => {
    const merged = mergePatternList([
      STRAY_ROW,
      { id: 'five-one', label: 'Renamed', createdAt: 2 },
      OWN_PATTERN,
    ]);
    const ids = merged.map(p => p.id);
    expect(new Set(ids).size, `duplicate ids: ${ids.join(', ')}`)
      .toBe(ids.length);
  });

  it("a pattern of the reader's own still gets its own section", () => {
    const merged = mergePatternList([OWN_PATTERN]);
    expect(merged).toHaveLength(VOICE_LEADING_PATTERNS.length + 1);
    const own = merged.find(p => p.id === OWN_PATTERN.id)!;
    expect(own.builtin).toBe(false);
  });
});

describe('an overridden built-in keeps built-in behaviour', () => {
  /**
   * `builtin` is what the page tests before passing `onCellOpen`. If a
   * rename flipped it to false the one remaining grid would have dead
   * cells — the bug's worst symptom, surviving the fix.
   */
  it('stays drillable after a real rename', () => {
    const merged = mergePatternList([
      { id: 'minor-251', label: 'Minor ii-V-i, my voicing', createdAt: 3 },
    ]);
    const row = merged.find(p => p.id === 'minor-251')!;
    expect(row.builtin, 'an overridden built-in must still be drillable')
      .toBe(true);
    expect(row.overridden).toBe(true);
    expect(row.label).toBe('Minor ii-V-i, my voicing');
  });

  it('every catalog pattern is drillable no matter what is stored', () => {
    const merged = mergePatternList([
      STRAY_ROW,
      { id: 'dom7b9', label: 'Dark one', createdAt: 4 },
      OWN_PATTERN,
    ]);
    for (const p of VOICE_LEADING_PATTERNS) {
      expect(merged.find(m => m.id === p.id)!.builtin, p.id).toBe(true);
    }
  });
});

describe("the stray row already in the database is inert", () => {
  it('an override whose label matches the built-in is treated as absent', () => {
    expect(overrideIsEmpty(STRAY_ROW, MINOR_251.label)).toBe(true);
    const row = mergePatternList([STRAY_ROW]).find(p => p.id === 'minor-251')!;
    expect(row.label).toBe(MINOR_251.label);
    // `overridden` false is what hides the restore control, so the row
    // reads exactly as it would if nothing were stored at all.
    expect(row.overridden).toBe(false);
  });

  it('needs no write to become harmless — merging alone neutralises it', () => {
    const before = [STRAY_ROW];
    const merged = mergePatternList(before);
    expect(before).toEqual([STRAY_ROW]);   // untouched
    expect(merged.filter(p => p.id === 'minor-251')).toHaveLength(1);
  });
});

describe('the writer stops new stray rows being made', () => {
  it('renaming a built-in to its own label writes nothing', () => {
    expect(applyRename([], 'minor-251', MINOR_251.label, 5)).toEqual([]);
  });

  it('and deletes an override that already exists', () => {
    expect(applyRename([STRAY_ROW], 'minor-251', MINOR_251.label, 5))
      .toEqual([]);
  });

  it('surrounding whitespace does not defeat the check', () => {
    expect(applyRename([STRAY_ROW], 'minor-251', `  ${MINOR_251.label} `, 5))
      .toEqual([]);
  });

  it('an empty label writes nothing at all', () => {
    expect(applyRename([STRAY_ROW], 'minor-251', '   ', 5)).toBeNull();
  });

  it('a real rename stores exactly one override for that id', () => {
    const next = applyRename([STRAY_ROW], 'minor-251', 'My Minor', 5)!;
    expect(next.filter(c => c.id === 'minor-251')).toHaveLength(1);
    expect(next.find(c => c.id === 'minor-251')!.label).toBe('My Minor');
  });
});

describe('Remove restores the catalog default', () => {
  it('dropping an override brings the shipped name back', () => {
    const stored = applyRename([], 'minor-251', 'My Minor', 6)!;
    expect(mergePatternList(stored).find(p => p.id === 'minor-251')!.label)
      .toBe('My Minor');

    const after = applyRemove(stored, 'minor-251');
    const row = mergePatternList(after).find(p => p.id === 'minor-251')!;
    expect(row.label).toBe(MINOR_251.label);
    expect(row.overridden).toBe(false);
    // And it is still one section, still drillable.
    expect(mergePatternList(after).filter(p => p.id === 'minor-251'))
      .toHaveLength(1);
    expect(row.builtin).toBe(true);
  });

  it("removing the reader's own pattern drops the section", () => {
    const after = applyRemove([OWN_PATTERN], OWN_PATTERN.id);
    expect(mergePatternList(after)).toHaveLength(VOICE_LEADING_PATTERNS.length);
  });
});

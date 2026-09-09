/**
 * The pattern list: the catalog, with renames applied, and nothing
 * else in it.
 *
 * THE REGRESSION THIS PINS. `minor-251` rendered twice — once from the
 * catalog and once from a custom entry carrying the same id — and the
 * second section had no click handler on its cells and a React key
 * that collided with the first. Both halves are still asserted, because
 * a fix that removes the duplicate while also removing the drill flow
 * would look right on screen and be worse than the bug.
 *
 * WHAT CHANGED ON 8 SEPTEMBER (ruling 32): a stored entry whose id is
 * NOT a catalog id no longer gets a section at all. It never got a
 * drillable one — no `kind`, no `types`, no `positions`, so no
 * sub-cells and no itemRefs — and the box that made such entries is
 * gone. `builtin` went with it: every row is one.
 */
import { describe, expect, it } from 'vitest';
import {
  applyRename,
  isRemovedCustomPattern,
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

/** What "+ Add Voice-Leading Pattern" used to write. Ruling 32 removed
 *  the box; this is the shape of what it left behind. */
const RESIDUE: CustomPattern = {
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
      RESIDUE,
    ]);
    const ids = merged.map(p => p.id);
    expect(new Set(ids).size, `duplicate ids: ${ids.join(', ')}`)
      .toBe(ids.length);
  });

  it('residue from the removed box gets no section at all', () => {
    // Ruling 32. It used to get one, and the grid inside it printed
    // "sub-cell drill flow isn't available for user-added patterns
    // yet" — a row that could never be drilled.
    const merged = mergePatternList([RESIDUE]);
    expect(merged).toHaveLength(VOICE_LEADING_PATTERNS.length);
    expect(merged.find(p => p.id === RESIDUE.id)).toBeUndefined();
  });

  it('and is recognised by the prefix the box minted, not by the catalog', () => {
    // The database migration tells the two apart the same way. Asking
    // the catalog instead would make a pattern RETIRED from the catalog
    // turn its rename into residue and delete it.
    expect(isRemovedCustomPattern(RESIDUE)).toBe(true);
    expect(isRemovedCustomPattern(STRAY_ROW)).toBe(false);
    for (const p of VOICE_LEADING_PATTERNS) {
      expect(isRemovedCustomPattern(p), p.id).toBe(false);
    }
  });
});

describe('an overridden built-in is still the built-in', () => {
  it('keeps its name change and its place', () => {
    const merged = mergePatternList([
      { id: 'minor-251', label: 'Minor ii-V-i, my voicing', createdAt: 3 },
    ]);
    const row = merged.find(p => p.id === 'minor-251')!;
    expect(row.label).toBe('Minor ii-V-i, my voicing');
  });

  it('every catalog pattern survives whatever is stored', () => {
    // The page hands `onCellOpen` to every row it draws, so "is it in
    // this list" IS "is it drillable" now — which is why the whole
    // catalog being present is the assertion that replaces `builtin`.
    const merged = mergePatternList([
      STRAY_ROW,
      { id: 'dom7b9', label: 'Dark one', createdAt: 4 },
      RESIDUE,
    ]);
    expect(merged).toHaveLength(VOICE_LEADING_PATTERNS.length);
    for (const p of VOICE_LEADING_PATTERNS) {
      expect(merged.find(m => m.id === p.id), p.id).toBeDefined();
    }
  });
});

describe("the stray row already in the database is inert", () => {
  it('an override whose label matches the built-in is treated as absent', () => {
    expect(overrideIsEmpty(STRAY_ROW, MINOR_251.label)).toBe(true);
    const row = mergePatternList([STRAY_ROW]).find(p => p.id === 'minor-251')!;
    // Reads exactly as it would if nothing were stored at all.
    expect(row.label).toBe(MINOR_251.label);
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

describe('renaming is undone by renaming, not by a control', () => {
  /**
   * THERE IS NO RESTORE BUTTON, and this is what stands in for one.
   * Typing the shipped name back deletes the override at the writer,
   * so the round trip leaves the stored list exactly as it started.
   */
  it('typing the shipped name back returns the list to empty', () => {
    const renamed = applyRename([], 'minor-251', 'My Minor', 6)!;
    expect(mergePatternList(renamed).find(p => p.id === 'minor-251')!.label)
      .toBe('My Minor');

    const undone = applyRename(renamed, 'minor-251', MINOR_251.label, 7)!;
    expect(undone).toEqual([]);

    const row = mergePatternList(undone).find(p => p.id === 'minor-251')!;
    expect(row.label).toBe(MINOR_251.label);
    expect(mergePatternList(undone).filter(p => p.id === 'minor-251'))
      .toHaveLength(1);
  });
});

describe('what the database migration deletes', () => {
  /**
   * db.ts v42 walks the one pref and drops the rows the removed box
   * minted. Its filter is restated here rather than imported — a Dexie
   * upgrade runs once per browser and cannot be replayed — so what is
   * asserted alongside it is the PROPERTY, which no copy can fake: what
   * survives renders as exactly the catalog, and every rename in the
   * pref survives.
   */
  const migrate = (stored: ReadonlyArray<CustomPattern>) =>
    stored.filter(p => !p.id.startsWith('custom-'));

  it('drops the residue and keeps the renames', () => {
    const renamed: CustomPattern = { id: 'five-one', label: 'My 5-1', createdAt: 9 };
    const kept = migrate([RESIDUE, renamed, STRAY_ROW]);
    expect(kept).toEqual([renamed, STRAY_ROW]);
  });

  it('agrees with the predicate the page reads by', () => {
    // Two places decide "is this residue" and they must not disagree,
    // or a row deleted on one device comes back drawn on another.
    for (const row of [RESIDUE, STRAY_ROW,
      { id: 'five-one', label: 'My 5-1', createdAt: 9 }]) {
      expect(migrate([row]).length === 0, row.id)
        .toBe(isRemovedCustomPattern(row));
    }
  });

  it('leaves a rename working after it has run', () => {
    const renamed: CustomPattern = { id: 'five-one', label: 'My 5-1', createdAt: 9 };
    const after = migrate([RESIDUE, renamed]);
    expect(mergePatternList(after).find(p => p.id === 'five-one')!.label)
      .toBe('My 5-1');
    expect(mergePatternList(after)).toHaveLength(VOICE_LEADING_PATTERNS.length);
  });
});

describe('there is nothing left to Remove', () => {
  /**
   * `applyRemove` WENT WITH THE BOX (ruling 32). It served one control,
   * beside one kind of row, and both are gone. The claim that replaces
   * it is the one that matters: whatever is stored, the page draws the
   * catalog and only the catalog.
   */
  it('the list is the catalog whatever the pref holds', () => {
    for (const stored of [[], [STRAY_ROW], [RESIDUE], [STRAY_ROW, RESIDUE]]) {
      expect(mergePatternList(stored), JSON.stringify(stored))
        .toHaveLength(VOICE_LEADING_PATTERNS.length);
    }
  });

  it('renaming something that is not a catalog pattern writes nothing', () => {
    // The only writer left. A residue row cannot be renamed into
    // existence.
    expect(applyRename([RESIDUE], RESIDUE.id, 'Anything', 8)).toBeNull();
  });
});

// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import {
  loadFlaggedItemRefs,
  loadHiddenItemRefs,
  readCuration,
  readManyCurations,
  resolveDisplayLabel,
  setCustomLabel,
  setFlag,
  setHidden,
} from '../etCuration';

beforeEach(async () => {
  await db.etItemCuration.clear();
});

describe('readCuration', () => {
  it('returns null when no row exists', async () => {
    expect(await readCuration('maj')).toBeNull();
  });

  it('returns the row after a write', async () => {
    await setCustomLabel('maj', 'My major');
    const row = await readCuration('maj');
    expect(row?.itemRef).toBe('maj');
    expect(row?.customLabel).toBe('My major');
  });
});

describe('setCustomLabel', () => {
  it('stores a non-empty trimmed label', async () => {
    await setCustomLabel('maj', '  Major chord  ');
    expect((await readCuration('maj'))?.customLabel).toBe('Major chord');
  });

  it('clears the label when null is passed', async () => {
    await setCustomLabel('maj', 'My major');
    await setCustomLabel('maj', null);
    const row = await readCuration('maj');
    // Row exists (preserves "user has touched this item" signal)
    // but customLabel is gone.
    expect(row).not.toBeNull();
    expect(row?.customLabel).toBeUndefined();
  });

  it('clears the label when empty string is passed', async () => {
    await setCustomLabel('maj', 'My major');
    await setCustomLabel('maj', '   ');
    expect((await readCuration('maj'))?.customLabel).toBeUndefined();
  });
});

describe('setFlag', () => {
  it('flags an item with an optional note', async () => {
    await setFlag('maj7', true, 'sounds wrong');
    const row = await readCuration('maj7');
    expect(row?.flagged).toBe(true);
    expect(row?.flagNote).toBe('sounds wrong');
  });

  it('clears the flag and note when flagged=false', async () => {
    await setFlag('maj7', true, 'note');
    await setFlag('maj7', false);
    const row = await readCuration('maj7');
    expect(row?.flagged).toBeUndefined();
    expect(row?.flagNote).toBeUndefined();
  });

  it('preserves customLabel when toggling flag', async () => {
    await setCustomLabel('maj7', 'M7');
    await setFlag('maj7', true);
    expect((await readCuration('maj7'))?.customLabel).toBe('M7');
  });
});

describe('setHidden', () => {
  it('hides an item', async () => {
    await setHidden('1-4-5', true);
    expect((await readCuration('1-4-5'))?.hidden).toBe(true);
  });

  it('restores an item when hidden=false', async () => {
    await setHidden('1-4-5', true);
    await setHidden('1-4-5', false);
    expect((await readCuration('1-4-5'))?.hidden).toBeUndefined();
  });
});

describe('loadHiddenItemRefs', () => {
  it('returns the set of hidden itemRefs', async () => {
    await setHidden('maj', true);
    await setHidden('min', true);
    await setFlag('maj7', true); // flagged but NOT hidden — excluded
    const hidden = await loadHiddenItemRefs();
    expect(hidden).toEqual(new Set(['maj', 'min']));
  });

  it('returns an empty set when nothing is hidden', async () => {
    await setFlag('maj', true);
    const hidden = await loadHiddenItemRefs();
    expect(hidden.size).toBe(0);
  });
});

describe('loadFlaggedItemRefs', () => {
  it('returns the set of flagged itemRefs', async () => {
    await setFlag('maj', true);
    await setFlag('min', true, 'unsure');
    await setHidden('maj7', true); // hidden but NOT flagged — excluded
    const flagged = await loadFlaggedItemRefs();
    expect(flagged).toEqual(new Set(['maj', 'min']));
  });
});

describe('readManyCurations', () => {
  it('returns a map keyed by itemRef; missing rows are absent', async () => {
    await setCustomLabel('maj', 'M');
    await setHidden('min', true);
    const map = await readManyCurations(['maj', 'min', 'aug']);
    expect(map.get('maj')?.customLabel).toBe('M');
    expect(map.get('min')?.hidden).toBe(true);
    expect(map.has('aug')).toBe(false);
  });

  it('returns an empty map for an empty input', async () => {
    const map = await readManyCurations([]);
    expect(map.size).toBe(0);
  });
});

describe('resolveDisplayLabel', () => {
  it('returns the customLabel when present and non-empty', () => {
    expect(resolveDisplayLabel({ itemRef: 'maj', customLabel: 'M', updatedAt: 0 }, 'Major')).toBe('M');
  });

  it('falls back to the default when no customLabel is set', () => {
    expect(resolveDisplayLabel(null, 'Major')).toBe('Major');
    expect(resolveDisplayLabel({ itemRef: 'maj', updatedAt: 0 }, 'Major')).toBe('Major');
  });

  it('falls back when customLabel is whitespace only', () => {
    expect(resolveDisplayLabel({ itemRef: 'maj', customLabel: '   ', updatedAt: 0 }, 'Major')).toBe('Major');
  });
});

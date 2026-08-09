import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LYRIC_TRAY_COLLAPSED,
  DEFAULT_PATTERNS_COLLAPSED,
  STORAGE_KEY_LYRIC_TRAY_COLLAPSED,
  STORAGE_KEY_PATTERNS_COLLAPSED,
  loadLyricTrayCollapsed,
  loadPatternsCollapsed,
  parsePatternsCollapsed,
  saveLyricTrayCollapsed,
  savePatternsCollapsed,
} from '../leadSheetPrefs';

/** Minimal in-memory localStorage — the test env has no DOM. */
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe('parsePatternsCollapsed', () => {
  it('honours the two recognised values', () => {
    expect(parsePatternsCollapsed('collapsed')).toBe(true);
    expect(parsePatternsCollapsed('expanded')).toBe(false);
  });

  it('falls back to the default for anything unrecognised', () => {
    // The point of the defensive parse: a corrupt, legacy or
    // half-written value must not reach the caller as a decision.
    for (const raw of [
      null,
      undefined,
      '',
      'COLLAPSED',
      'true',
      '1',
      0,
      1,
      true,
      false,
      {},
      [],
      { collapsed: true },
    ]) {
      expect(parsePatternsCollapsed(raw)).toBe(DEFAULT_PATTERNS_COLLAPSED);
    }
  });

  it('defaults to COLLAPSED', () => {
    expect(DEFAULT_PATTERNS_COLLAPSED).toBe(true);
    expect(parsePatternsCollapsed(null)).toBe(true);
  });
});

describe('loadPatternsCollapsed / savePatternsCollapsed', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the default when nothing is stored', () => {
    expect(loadPatternsCollapsed()).toBe(true);
  });

  it('round-trips a deviation from the default', () => {
    savePatternsCollapsed(false);
    expect(store.get(STORAGE_KEY_PATTERNS_COLLAPSED)).toBe('expanded');
    expect(loadPatternsCollapsed()).toBe(false);
  });

  it('stores only the deviation — the default removes the key', () => {
    savePatternsCollapsed(false);
    expect(store.has(STORAGE_KEY_PATTERNS_COLLAPSED)).toBe(true);
    savePatternsCollapsed(true);
    expect(store.has(STORAGE_KEY_PATTERNS_COLLAPSED)).toBe(false);
    // Absent and explicitly-default mean the same thing.
    expect(loadPatternsCollapsed()).toBe(true);
  });

  it('reads through a corrupt stored value without throwing', () => {
    store.set(STORAGE_KEY_PATTERNS_COLLAPSED, '{"nope":1}');
    expect(loadPatternsCollapsed()).toBe(DEFAULT_PATTERNS_COLLAPSED);
  });

  it('survives storage that throws on access', () => {
    // Private-mode Safari and quota-exceeded both surface as throws.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadPatternsCollapsed()).toBe(DEFAULT_PATTERNS_COLLAPSED);
    expect(() => savePatternsCollapsed(false)).not.toThrow();
  });

  it('survives localStorage being absent entirely', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadPatternsCollapsed()).toBe(DEFAULT_PATTERNS_COLLAPSED);
    expect(() => savePatternsCollapsed(false)).not.toThrow();
  });
});

describe('the two collapse prefs are independent', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('both default to collapsed', () => {
    expect(DEFAULT_LYRIC_TRAY_COLLAPSED).toBe(true);
    expect(loadLyricTrayCollapsed()).toBe(true);
    expect(loadPatternsCollapsed()).toBe(true);
  });

  it('uses separate storage keys', () => {
    expect(STORAGE_KEY_LYRIC_TRAY_COLLAPSED).not.toBe(
      STORAGE_KEY_PATTERNS_COLLAPSED,
    );
  });

  it('expanding one leaves the other alone — they are not chained', () => {
    saveLyricTrayCollapsed(false);
    expect(loadLyricTrayCollapsed()).toBe(false);
    expect(loadPatternsCollapsed()).toBe(true);

    savePatternsCollapsed(false);
    saveLyricTrayCollapsed(true);
    expect(loadPatternsCollapsed()).toBe(false);
    expect(loadLyricTrayCollapsed()).toBe(true);
    // Only the deviating pref occupies storage.
    expect(store.has(STORAGE_KEY_LYRIC_TRAY_COLLAPSED)).toBe(false);
    expect(store.has(STORAGE_KEY_PATTERNS_COLLAPSED)).toBe(true);
  });
});

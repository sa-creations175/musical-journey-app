/**
 * Lead-sheet per-device UI prefs.
 *
 * Two prefs, each an independent collapse state:
 *   - the progression-patterns block under each bar grid
 *   - the per-section unplaced-lyrics tray
 *
 * **They are deliberately NOT chained.** Wanting the patterns open says
 * nothing about wanting every section's lyric tray open; one toggle
 * driving both would make each one's default a side effect of the
 * other. Separate keys, separate toggles.
 *
 * **Scope is GLOBAL for both, not per section or per song.** Each block
 * renders once per section, so a five-section song shows five of them;
 * keying a pref per section would mean five toggles to express one
 * preference, and would grow an unbounded map across every song's
 * section ids. One value covers every block everywhere.
 *
 * Storage: **localStorage**, not userPrefs / Dexie. Same rationale as
 * `goals/goalsLayerPrefs.ts`, `goals/goalRowCollapse.ts` and
 * `goals/goalsView.ts`, which all document it: userPrefs is a synced
 * table, and SyncContext runs `drain()` + `pullAll('replace')` on every
 * mount — a bidirectional pull that can wipe or stale-overwrite a local
 * write made just before a reload. `goalRowCollapse.ts` records having
 * reproduced that. Collapse state isn't worth coordinating across
 * devices, and localStorage is synchronous, survives reloads, and isn't
 * synced.
 *
 * **The default is COLLAPSED.** Only the deviation is stored — expanding
 * writes 'expanded', collapsing back to the default deletes the entry —
 * so the absence of a value and an explicit collapse mean the same
 * thing and the stored footprint stays at zero for the default case.
 *
 * `parsePatternsCollapsed` is a defensive deserializer: anything
 * unrecognised falls through to the default, so a corrupt, legacy or
 * partially-written value can't crash the lead sheet.
 */

export const STORAGE_KEY_PATTERNS_COLLAPSED = 'leadSheet.patternsCollapsed';
export const STORAGE_KEY_LYRIC_TRAY_COLLAPSED = 'leadSheet.lyricTrayCollapsed';

/** Both collapsed unless something valid says otherwise. */
export const DEFAULT_PATTERNS_COLLAPSED = true;
export const DEFAULT_LYRIC_TRAY_COLLAPSED = true;

/**
 * Coerce an arbitrary stored value to a collapsed boolean.
 *
 * Only the two exact strings are honoured. `null` (nothing stored),
 * anything malformed, and anything of the wrong type all resolve to the
 * given default, which is what makes a corrupt value harmless rather
 * than something to handle at the call site.
 */
export function parseCollapsed(raw: unknown, fallback: boolean): boolean {
  if (raw === 'collapsed') return true;
  if (raw === 'expanded') return false;
  return fallback;
}

function load(key: string, fallback: boolean): boolean {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return parseCollapsed(raw, fallback);
  } catch {
    return fallback;
  }
}

/** Persist only the deviation; storing the default removes the key. */
function save(key: string, collapsed: boolean, fallback: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (collapsed === fallback) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, collapsed ? 'collapsed' : 'expanded');
  } catch {
    /* ignore — a pref that can't be written just doesn't persist */
  }
}

export function parsePatternsCollapsed(raw: unknown): boolean {
  return parseCollapsed(raw, DEFAULT_PATTERNS_COLLAPSED);
}

export function loadPatternsCollapsed(): boolean {
  return load(STORAGE_KEY_PATTERNS_COLLAPSED, DEFAULT_PATTERNS_COLLAPSED);
}

export function savePatternsCollapsed(collapsed: boolean): void {
  save(STORAGE_KEY_PATTERNS_COLLAPSED, collapsed, DEFAULT_PATTERNS_COLLAPSED);
}

export function parseLyricTrayCollapsed(raw: unknown): boolean {
  return parseCollapsed(raw, DEFAULT_LYRIC_TRAY_COLLAPSED);
}

export function loadLyricTrayCollapsed(): boolean {
  return load(STORAGE_KEY_LYRIC_TRAY_COLLAPSED, DEFAULT_LYRIC_TRAY_COLLAPSED);
}

export function saveLyricTrayCollapsed(collapsed: boolean): void {
  save(STORAGE_KEY_LYRIC_TRAY_COLLAPSED, collapsed, DEFAULT_LYRIC_TRAY_COLLAPSED);
}

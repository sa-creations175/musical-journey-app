/**
 * Lead-sheet per-device UI prefs.
 *
 * Currently one pref: whether the progression-patterns block under each
 * bar grid is collapsed.
 *
 * **Scope is GLOBAL, not per section or per song.** The block renders
 * once per section, so a five-section song shows five of them; keying
 * the pref per section would mean five toggles to express one
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

/** Collapsed unless something valid says otherwise. */
export const DEFAULT_PATTERNS_COLLAPSED = true;

/**
 * Coerce an arbitrary stored value to a collapsed boolean.
 *
 * Only the two exact strings are honoured. `null` (nothing stored),
 * anything malformed, and anything of the wrong type all resolve to the
 * default, which is what makes a corrupt value harmless rather than
 * something to handle at the call site.
 */
export function parsePatternsCollapsed(raw: unknown): boolean {
  if (raw === 'collapsed') return true;
  if (raw === 'expanded') return false;
  return DEFAULT_PATTERNS_COLLAPSED;
}

export function loadPatternsCollapsed(): boolean {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY_PATTERNS_COLLAPSED)
        : null;
    return parsePatternsCollapsed(raw);
  } catch {
    return DEFAULT_PATTERNS_COLLAPSED;
  }
}

/** Persist only the deviation; storing the default removes the key. */
export function savePatternsCollapsed(collapsed: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (collapsed === DEFAULT_PATTERNS_COLLAPSED) {
      localStorage.removeItem(STORAGE_KEY_PATTERNS_COLLAPSED);
      return;
    }
    localStorage.setItem(
      STORAGE_KEY_PATTERNS_COLLAPSED,
      collapsed ? 'collapsed' : 'expanded',
    );
  } catch {
    /* ignore — a pref that can't be written just doesn't persist */
  }
}

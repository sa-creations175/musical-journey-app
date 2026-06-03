import { useSyncExternalStore } from 'react';

/**
 * Dev Mode — a developer toggle that suppresses practice-data writes
 * (attempts, spacingState, drillSessions) so test sessions don't
 * pollute real practice history.
 *
 * Persisted in sessionStorage ONLY — never localStorage, never Dexie.
 * That means it resets to OFF on every app restart / hard refresh, so
 * a forgotten toggle can never silently swallow real practice across
 * sessions. The trade-off (a refresh clears it mid-test) is the safer
 * default.
 *
 * Reads go through `isDevMode()` so non-React call sites (the practice
 * write helpers in practiceWrites.ts) can gate writes synchronously.
 * The `useDevMode()` hook wires the same value into React via
 * useSyncExternalStore so the Settings toggle and the header DEV badge
 * stay in sync — sessionStorage writes don't emit `storage` events in
 * the same tab, so `setDevMode` dispatches a custom event the hook
 * subscribes to.
 */

export const DEV_MODE_STORAGE_KEY = 'devMode';
const DEV_MODE_EVENT = 'devmodechange';

/** Synchronous read — safe to call from anywhere, including non-React
 *  module code. Returns false when sessionStorage is unavailable
 *  (SSR / privacy modes). */
export function isDevMode(): boolean {
  try {
    return sessionStorage.getItem(DEV_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Set dev mode on/off and notify subscribers (the React hook). */
export function setDevMode(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(DEV_MODE_STORAGE_KEY, 'true');
    else sessionStorage.removeItem(DEV_MODE_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable — nothing to persist; still emit the
    // event so any mounted hook re-reads (and reflects the no-op).
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DEV_MODE_EVENT));
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(DEV_MODE_EVENT, callback);
  // Also react to changes from other tabs, defensively.
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(DEV_MODE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/**
 * React hook — `{ devMode, toggleDevMode }`. `devMode` re-renders the
 * consumer whenever the value changes (via either the in-tab custom
 * event or a cross-tab storage event). `toggleDevMode` flips it.
 */
export function useDevMode(): {
  devMode: boolean;
  toggleDevMode: () => void;
} {
  const devMode = useSyncExternalStore(subscribe, isDevMode, () => false);
  return {
    devMode,
    toggleDevMode: () => setDevMode(!isDevMode()),
  };
}

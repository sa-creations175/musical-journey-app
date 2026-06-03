// @vitest-environment jsdom
/**
 * Dev Mode core — sessionStorage-backed toggle + change notification.
 * (The useDevMode hook is a thin useSyncExternalStore wrapper over
 * these; its data source and toggle logic are what's tested here.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEV_MODE_STORAGE_KEY, isDevMode, setDevMode } from '../devMode';

afterEach(() => {
  sessionStorage.clear();
});

describe('isDevMode / setDevMode', () => {
  it('defaults to off', () => {
    expect(isDevMode()).toBe(false);
  });

  it('turns on and off, persisting in sessionStorage', () => {
    setDevMode(true);
    expect(isDevMode()).toBe(true);
    expect(sessionStorage.getItem(DEV_MODE_STORAGE_KEY)).toBe('true');

    setDevMode(false);
    expect(isDevMode()).toBe(false);
    expect(sessionStorage.getItem(DEV_MODE_STORAGE_KEY)).toBeNull();
  });

  it('toggles via the !isDevMode() pattern the hook uses', () => {
    setDevMode(!isDevMode());
    expect(isDevMode()).toBe(true);
    setDevMode(!isDevMode());
    expect(isDevMode()).toBe(false);
  });

  it('reads as off again after sessionStorage clear (simulates refresh)', () => {
    setDevMode(true);
    expect(isDevMode()).toBe(true);
    sessionStorage.clear(); // a fresh page load starts with empty sessionStorage
    expect(isDevMode()).toBe(false);
  });
});

describe('change notification (drives the hook re-render)', () => {
  it('dispatches a devmodechange event whenever set', () => {
    const handler = vi.fn();
    window.addEventListener('devmodechange', handler);
    setDevMode(true);
    setDevMode(false);
    window.removeEventListener('devmodechange', handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

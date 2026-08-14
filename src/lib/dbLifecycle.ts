import { useSyncExternalStore } from 'react';

/**
 * What this tab does when ANOTHER tab wants to upgrade the database.
 *
 * ---------------------------------------------------------------
 * WHAT DEXIE ALREADY DOES, AND WHY IT ISN'T ENOUGH
 *
 * Dexie 4 ships a default `versionchange` subscriber (dexie.js:5946)
 * that closes the connection so the other tab's upgrade can proceed.
 * The upgrade is therefore NOT blocked in the ordinary case — but the
 * default closes with `disableAutoOpen: false`, so the next query in
 * this tab silently reopens the database. The reopen requests the
 * version this bundle declares, which is now LOWER than the one on
 * disk, and IndexedDB rejects it. The tab is left making queries that
 * never resolve, with only a console warning to say why.
 *
 * Subscribers chain in reverse (dexie.js:549 — `reverseStoppableEventChain`),
 * so a handler registered later runs FIRST and can return `false` to
 * suppress the default. db.ts uses that to close with auto-open
 * DISABLED and hand over to this module.
 * ---------------------------------------------------------------
 *
 * The connection is closed either way — that part is not a choice, the
 * other tab needs it. The choice is what this tab does next:
 *
 *   idle  → reload immediately. The user never sees it happen.
 *   busy  → show a blocking overlay and let the user reload when they
 *           are ready, so a half-answered card is never discarded.
 *
 * WHAT "IDLE" MEANS HERE, AND WHAT IT DELIBERATELY DOESN'T. There is no
 * single "practice in progress" signal in this app. Session state is
 * observable (SessionTimerContext), but standalone drill state is local
 * component state in a dozen components — ReadingDrill's part-filled
 * answer, IntervalsQuiz's played-but-unanswered card, a drill modal's
 * unsaved rating — and none of it is reachable from here. Threading a
 * busy-registration through all of them was considered and rejected as
 * sprawl.
 *
 * So idle is a NARROW WHITELIST, not a general check: no active
 * session, no in-session drill, and a route that is known to hold
 * nothing. Anything else — including anything new, since the default
 * for an unlisted route is "busy" — gets the overlay.
 *
 * That trade is deliberate. A check that is usually right would fail
 * precisely when the user is mid-answer, which is the case the whole
 * mechanism exists to protect. Erring toward the overlay costs a click
 * on a page nobody was using; erring the other way discards work.
 */

/** Nothing wrong; the database is open and usable. */
export type DbLifecycleState =
  | 'ok'
  /** Another tab is upgrading. This tab's connection is closed and
   *  every query from here on will fail — the overlay is not advisory. */
  | 'closed-for-upgrade'
  /** THIS tab is trying to upgrade and another connection won't yield. */
  | 'blocked';

const DB_LIFECYCLE_EVENT = 'dblifecyclechange';

let state: DbLifecycleState = 'ok';

/**
 * Routes that hold nothing the user would mind losing.
 *
 * Kept as an explicit allowlist rather than a denylist of drill routes:
 * a route added later defaults to "busy" and gets the overlay, which is
 * the safe direction. A denylist would default new routes to
 * auto-reload — silently, and only discovered by losing work.
 *
 * `/skills-catalogue` is NOT here despite being a browsing surface:
 * SkillDetailPanel edits annotations and associations inline.
 */
export function isNonDrillRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return true;              // Dashboard
  if (path === '/session-log') return true;   // stub page, renders nothing
  if (path.endsWith('/calendar')) return true; // read-only heatmaps
  return false;
}

export interface IdleInputs {
  pathname: string;
  /** True while a practice session is running OR paused. A paused
   *  session is still a session the user is inside. */
  sessionActive: boolean;
  /** True while an in-session drill runner owns the screen. */
  inSessionDrillActive: boolean;
}

/**
 * The whole decision, as a pure function of three observable inputs.
 * Every condition must hold; there is no "mostly idle".
 */
export function shouldAutoReload(input: IdleInputs): boolean {
  if (input.sessionActive) return false;
  if (input.inSessionDrillActive) return false;
  return isNonDrillRoute(input.pathname);
}

/**
 * Registered by DbUpgradeOverlay once it is mounted inside the router
 * and the session-timer provider — the only place with access to both
 * the current route and session state.
 *
 * Null until that happens (early boot, or a build where the component
 * was never mounted), and a null probe means BUSY. Reloading a tab
 * whose state we cannot observe is the one outcome worth avoiding.
 */
let idleProbe: (() => boolean) | null = null;

export function setIdleProbe(probe: (() => boolean) | null): void {
  idleProbe = probe;
}

/** Indirection so tests can assert the reload decision without the
 *  jsdom "not implemented: navigation" noise. Test-only. */
let performReload = (): void => {
  if (typeof window !== 'undefined') window.location.reload();
};

export function __setPerformReloadForTests(fn: () => void): void {
  performReload = fn;
}

function setState(next: DbLifecycleState): void {
  if (state === next) return;
  state = next;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DB_LIFECYCLE_EVENT));
  }
}

/**
 * Another tab wants to upgrade; this tab's connection has just been
 * closed. Reload if the probe says the tab is idle, otherwise raise the
 * overlay.
 *
 * A probe that throws is treated as busy. It runs arbitrary React-land
 * code, and the failure mode of guessing "idle" from an exception is
 * losing the user's work.
 */
export function onAnotherTabUpgrading(): void {
  let idle = false;
  try {
    idle = idleProbe ? idleProbe() : false;
  } catch {
    idle = false;
  }
  if (idle) {
    performReload();
    return;
  }
  setState('closed-for-upgrade');
}

/**
 * This tab is trying to upgrade and another connection is holding the
 * old version open — it never processed its `versionchange` (suspended
 * tab, crashed renderer, a browser that throttled it away).
 *
 * Nothing automatic can resolve this from here: the other tab is the
 * one that has to yield. So this is the message case, and it exists so
 * the app says what is wrong instead of sitting on a loading spinner.
 */
export function onUpgradeBlocked(): void {
  setState('blocked');
}

/** Test seam — resets module state between cases. */
export function __resetDbLifecycleForTests(): void {
  state = 'ok';
  idleProbe = null;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(DB_LIFECYCLE_EVENT, callback);
  return () => window.removeEventListener(DB_LIFECYCLE_EVENT, callback);
}

function getSnapshot(): DbLifecycleState {
  return state;
}

/** Current lifecycle state, re-rendering the consumer on change. */
export function useDbLifecycle(): DbLifecycleState {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'ok' as const);
}

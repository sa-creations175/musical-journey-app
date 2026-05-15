/**
 * Phase B Step 9b — carry-over banner UX state (localStorage).
 *
 * Three things to remember between renders:
 *
 *   1. Whether the user X-dismissed the banner for the current month.
 *      Dismissal lasts until the calendar rolls over — next month
 *      surfaces a fresh banner if leftover detection still fires.
 *
 *   2. Per-module Accept / Decline decisions for the current month.
 *      The review flow writes these when the user confirms;
 *      `pendingModulesForBanner` reads them to decide if the banner
 *      still has unanswered modules.
 *
 *   3. (Future) The accept marker is an explicit-commitment signal —
 *      future scope-extension code can read it to lift accepted
 *      items further than the baseline backlog priority. Today the
 *      backlog already surfaces all uncovered items via the
 *      candidate pool (Commit 1); Accept records intent without
 *      changing surfacing behaviour.
 *
 * Pure module — no React, no Dexie. Test in node-style or with
 * fake-localStorage. SSR-safe: guards window access defensively.
 */

import type { GoalFlowModuleId } from './goalVocabulary';

const BANNER_DISMISS_KEY = 'carryover.bannerDismissedForMonth';
const DECISIONS_KEY = 'carryover.decisionsForMonth';

export type CarryoverDecision = 'accepted' | 'declined';

/** All persisted decisions for the current month, keyed by moduleId.
 *  Stored as a JSON object. */
export type DecisionsByModule = Partial<Record<GoalFlowModuleId, CarryoverDecision>>;

// ---------------------------------------------------------------------
// localStorage shape — stored under one JSON blob per concern, keyed
// implicitly by the current calendar month. Old months expire by the
// "doesn't match `currentMonthKey`" check below — no cleanup needed.
// ---------------------------------------------------------------------

interface StoredDismiss {
  monthKey: string;
}

interface StoredDecisions {
  monthKey: string;
  byModule: DecisionsByModule;
}

/** YYYY-MM key for the calendar month containing `at`. */
export function currentMonthKey(at: number = Date.now()): string {
  const d = new Date(at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function safeRead<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.).
    // The banner just keeps appearing — preferable to silently
    // erasing the user's decision.
  }
}

// ---------------------------------------------------------------------
// Dismissal (X-click — "skip this month")
// ---------------------------------------------------------------------

export function isBannerDismissedForMonth(at: number = Date.now()): boolean {
  const stored = safeRead<StoredDismiss>(BANNER_DISMISS_KEY);
  return stored?.monthKey === currentMonthKey(at);
}

export function dismissBannerForMonth(at: number = Date.now()): void {
  safeWrite(BANNER_DISMISS_KEY, { monthKey: currentMonthKey(at) } satisfies StoredDismiss);
}

// ---------------------------------------------------------------------
// Per-module Accept / Decline decisions
// ---------------------------------------------------------------------

export function loadCarryoverDecisions(at: number = Date.now()): DecisionsByModule {
  const stored = safeRead<StoredDecisions>(DECISIONS_KEY);
  if (!stored || stored.monthKey !== currentMonthKey(at)) return {};
  return stored.byModule ?? {};
}

export function saveCarryoverDecisions(
  byModule: DecisionsByModule,
  at: number = Date.now(),
): void {
  safeWrite(DECISIONS_KEY, {
    monthKey: currentMonthKey(at),
    byModule,
  } satisfies StoredDecisions);
}

/**
 * The modules the banner still needs to surface — modules with
 * uncovered items that the user hasn't decided on yet. Drives the
 * "banner persists until decisions are made OR dismissed" rule.
 */
export function pendingModulesForBanner(
  detectedModules: ReadonlyArray<GoalFlowModuleId>,
  decisions: DecisionsByModule,
): GoalFlowModuleId[] {
  return detectedModules.filter(m => decisions[m] === undefined);
}

/** Test helper — wipes the localStorage keys this module owns.
 *  Exported (not test-only-named with leading _) because the
 *  fixture tests across multiple `describe` blocks share state via
 *  fake-localStorage and need a way to reset. */
export function _resetCarryoverBannerStateForTests(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(BANNER_DISMISS_KEY);
    window.localStorage.removeItem(DECISIONS_KEY);
  } catch {
    // ignore
  }
}

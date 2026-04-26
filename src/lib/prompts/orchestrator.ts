import { db, type PromptRecord } from '../db';
import { ACTIVE_SESSION_WINDOW_MS, DAILY_CAP, TIER_PRIORITY } from './types';

/**
 * The orchestrator entry point. Returns the next batch of prompts
 * the app should surface, applying the three Q10 rules:
 *
 *   - Active-session suppression: don't return any prompts while
 *     a practice session is in flight.
 *   - Tier prioritization: high > medium > low, FIFO within tier.
 *   - 3/day soft cap: counted by `prompts.shownAt` timestamps in
 *     the user's local calendar day.
 *
 * Phase 1 ships the logic; the only consumer surfacing prompts
 * today is `GoalsNudgeBanner`, which calls into events.ts ahead of
 * this. Phase 7 will route every prompt-bearing surface through
 * `selectNextPrompts`, at which point the centralized cap and tier
 * ordering matter end-to-end.
 */
export interface SelectNextOpts {
  /** Override `Date.now()` for tests; defaults to the current
   *  moment. */
  now?: number;
  /** Override the daily cap; defaults to DAILY_CAP. */
  max?: number;
}

export async function selectNextPrompts(opts: SelectNextOpts = {}): Promise<PromptRecord[]> {
  const now = opts.now ?? Date.now();
  const max = opts.max ?? DAILY_CAP;

  // Suppression first — cheapest correctness check, and the most
  // important: no other rule should ever override "the user is in
  // a session, leave them alone."
  if (await isAnySessionActive(now)) return [];

  // Daily cap — count what's already been shown today (local).
  const shownToday = await countShownToday(now);
  const remaining = Math.max(0, max - shownToday);
  if (remaining === 0) return [];

  // Pull queued prompts, drop expired ones, sort by tier desc then
  // createdAt asc.
  const queued = await db.prompts.where('status').equals('queued').toArray();
  const eligible = queued
    .filter(p => p.expiresAt === null || p.expiresAt > now)
    .sort((a, b) => {
      const tierDiff = TIER_PRIORITY[b.tier] - TIER_PRIORITY[a.tier];
      if (tierDiff !== 0) return tierDiff;
      return a.createdAt - b.createdAt;
    });

  return eligible.slice(0, remaining);
}

// -------------------------------------------------------------------
// Internals — exported for unit testing / dev-console verification.
// -------------------------------------------------------------------

/**
 * Local-calendar-day boundary helper. The cap is "today in the
 * user's wall clock" so it lines up with day profiles and the
 * user's lived sense of "today" — not UTC and not "the last 24
 * hours."
 */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/** How many prompts have already been surfaced today (local). */
export async function countShownToday(now: number): Promise<number> {
  const startMs = startOfLocalDay(now);
  const all = await db.prompts.toArray();
  return all.filter(p => p.shownAt !== null && p.shownAt >= startMs).length;
}

/**
 * Phase 1 active-session heuristic: any practiceSessions row with
 * startedAt within the last ACTIVE_SESSION_WINDOW_MS and a null
 * endedAt is "active." Phase 3+ will replace this with a real
 * session state machine when the timer ships; the rule's identity
 * doesn't change, just its evaluator.
 */
export async function isAnySessionActive(now: number): Promise<boolean> {
  const cutoff = now - ACTIVE_SESSION_WINDOW_MS;
  const recent = await db.practiceSessions
    .where('startedAt').above(cutoff)
    .toArray();
  return recent.some(s => s.endedAt === null);
}

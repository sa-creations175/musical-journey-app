import { db, type PromptRecord } from '../db';
import type { PromptSurface, PromptTier } from './types';

/**
 * Low-level CRUD on the `prompts` table.
 *
 * `enqueue` uses .put() with a freshly-built record (no stale-
 * snapshot risk — the record is constructed in-memory from the
 * input).
 *
 * State-transition mutations (markShown / markDismissed /
 * markEngaged / markExpired) use Dexie's `.where(...).modify(fn)`.
 * `modify` runs the mutation inside an implicit transaction, so
 * concurrent calls on the same row serialize and each fn sees the
 * most recently committed state — closing the read-modify-write
 * race that the alternative `get + put` pattern is vulnerable to.
 *
 * markShown additionally gates on `p.status === 'queued'` so a
 * fast-clicking user who dismisses a prompt before its in-flight
 * markShown completes doesn't have the dismissal silently
 * overwritten.
 */

interface EnqueueInput {
  promptType: string;
  tier: PromptTier;
  surface: PromptSurface;
  payload?: Record<string, unknown>;
  expiresAt?: number;
}

export async function enqueue(input: EnqueueInput): Promise<PromptRecord> {
  const now = Date.now();
  const record: PromptRecord = {
    id: `prompt-${Math.random().toString(36).slice(2, 8)}-${now.toString(36)}`,
    promptType: input.promptType,
    tier: input.tier,
    surface: input.surface,
    payload: input.payload ?? {},
    status: 'queued',
    createdAt: now,
    shownAt: null,
    dismissedAt: null,
    engagedAt: null,
    expiresAt: input.expiresAt ?? null,
    userDismissalCount: 0,
  };
  await db.prompts.put(record);
  return record;
}

export async function markShown(id: string): Promise<void> {
  // Guarded transition: queued → shown only. If the row has moved
  // past queued (most likely a fast dismiss landed first), no-op.
  await db.prompts.where('id').equals(id).modify(p => {
    if (p.status === 'queued') {
      p.status = 'shown';
      p.shownAt = Date.now();
    }
  });
}

export async function markDismissed(id: string): Promise<void> {
  await db.prompts.where('id').equals(id).modify(p => {
    p.status = 'dismissed';
    p.dismissedAt = Date.now();
    p.userDismissalCount = (p.userDismissalCount ?? 0) + 1;
  });
}

export async function markEngaged(id: string): Promise<void> {
  await db.prompts.where('id').equals(id).modify(p => {
    p.status = 'engaged';
    p.engagedAt = Date.now();
  });
}

export async function markExpired(id: string): Promise<void> {
  await db.prompts.where('id').equals(id).modify(p => {
    p.status = 'expired';
  });
}

/** All prompts of a given type, ordered by createdAt asc. */
export async function findByType(promptType: string): Promise<PromptRecord[]> {
  return db.prompts.where('promptType').equals(promptType).sortBy('createdAt');
}

// Data access for the lead-sheet voicing carousel (see
// docs/VOICING_CAROUSEL_DESIGN.md): load the candidate patterns for a chord
// quality, order them for the carousel, and persist user-saved patterns.
// The system catalog + seeder live in seedVoicingPatterns.ts.

import { db, type VoicingEntry, type VoicingPattern } from '../../lib/db';
import { sanitizeVoicing } from '../../lib/voicingColors';

/**
 * Order candidate patterns for the carousel: pinned first (in the user's pin
 * order), then non-pinned user-saved patterns, then non-pinned system
 * patterns — each group by sortOrder, id as a stable tiebreaker. Pure.
 *
 * `patterns` should already be the union of quality-matched + pinned-by-id
 * patterns (see loadVoicingCandidates); the carousel's "N of M" counter is
 * just this list's length.
 */
export function orderVoicingCandidates(
  patterns: ReadonlyArray<VoicingPattern>,
  pinnedIds: ReadonlyArray<string>,
): VoicingPattern[] {
  const pinnedOrder = new Map(pinnedIds.map((id, i) => [id, i]));
  // 0 = pinned, 1 = user-saved, 2 = system.
  const rank = (p: VoicingPattern) =>
    pinnedOrder.has(p.id) ? 0 : p.isSystem ? 2 : 1;
  return [...patterns].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return pinnedOrder.get(a.id)! - pinnedOrder.get(b.id)!;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Load every candidate pattern for the carousel: all patterns for the
 * quality (system + user) UNION any pinned-by-id patterns not already in
 * that set (so a pin always shows even if the chord quality later changed).
 * Deduped by id. The caller orders via orderVoicingCandidates.
 */
export async function loadVoicingCandidates(
  qualityId: string,
  pinnedIds: ReadonlyArray<string>,
): Promise<VoicingPattern[]> {
  const byQuality = await db.voicingPatterns
    .where('qualityId')
    .equals(qualityId)
    .toArray();
  const have = new Set(byQuality.map(p => p.id));
  const missingPinned = pinnedIds.filter(id => !have.has(id));
  if (missingPinned.length === 0) return byQuality;
  const extra = (await db.voicingPatterns.bulkGet(missingPinned)).filter(
    (p): p is VoicingPattern => Boolean(p),
  );
  return [...byQuality, ...extra];
}

/**
 * Create + persist a user voicing pattern (isSystem:false, so it syncs and
 * surfaces in the carousel for that quality everywhere — the global scope
 * confirmed for "save as pattern", O2). Offsets are sanitized first.
 */
export async function createUserVoicingPattern(
  qualityId: string,
  offsets: ReadonlyArray<number | VoicingEntry>,
  label = 'Saved voicing',
): Promise<VoicingPattern> {
  const now = Date.now();
  const pattern: VoicingPattern = {
    id: crypto.randomUUID(),
    qualityId,
    label,
    offsets: sanitizeVoicing(offsets),
    isSystem: false,
    // User rows sort after system rows (sortOrder 0–100s); a timestamp keeps
    // recently-saved ones last within the user group.
    sortOrder: now,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  };
  await db.voicingPatterns.put(pattern);
  return pattern;
}

import { db, type HarmonicDiaryEntry } from '../../lib/db';
import { canonicalSkillId } from '../skills/registry';
import { allStarters, starterToEntry } from './starters';

/**
 * Lightweight uuid-ish id generator, same pattern as the rest of the
 * app. Collisions are astronomically unlikely at the scale of a
 * single user's diary.
 */
function entryUid(): string {
  return `diary-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

// --- Legacy migration ---------------------------------------------
//
// The app has three per-module association tables from earlier
// releases (`progressionAssociations`, `modeAssociations`,
// `intervalDescriptions`). They each hold a single text field plus a
// module-specific key. On first open of the Harmonic Diary we lift
// those rows into the unified diary table so nothing the user has
// already written disappears.
//
// The migration is idempotent: re-running it only creates entries
// that don't already exist (keyed by `legacySource + skillId`). The
// legacy tables stay intact so per-module editors continue working
// while we incrementally refactor them.

export async function migrateLegacyAssociationsIfNeeded(): Promise<void> {
  const [existingEntries, progAssocs, modeAssocs, intervalDescs] = await Promise.all([
    db.harmonicDiaryEntries
      .where('legacySource').anyOf('progression', 'mode', 'interval')
      .toArray(),
    db.progressionAssociations.toArray(),
    db.modeAssociations.toArray(),
    db.intervalDescriptions.toArray(),
  ]);

  // Build a "(legacySource, skillId)" set so we skip already-migrated
  // rows even if the user has re-edited their associations since.
  const seen = new Set<string>();
  for (const e of existingEntries) {
    if (e.legacySource) seen.add(`${e.legacySource}:${e.skillId}`);
  }

  const toAdd: HarmonicDiaryEntry[] = [];
  const now = Date.now();

  for (const p of progAssocs) {
    if (!p.text?.trim()) continue;
    const skillId = canonicalSkillId('chord-progressions', 'item', p.progressionId);
    const key = `progression:${skillId}`;
    if (seen.has(key)) continue;
    toAdd.push({
      entryId: entryUid(),
      skillId,
      userText: p.text,
      claudeStarterText: undefined,
      isStarterEdited: true,
      emotionalTags: [],
      genreTags: [],
      createdAt: p.updatedAt ?? now,
      lastEdited: p.updatedAt ?? now,
      legacySource: 'progression',
    });
    seen.add(key);
  }

  for (const m of modeAssocs) {
    if (!m.text?.trim()) continue;
    const skillId = canonicalSkillId('scales-modes', 'mode', m.modeId);
    const key = `mode:${skillId}`;
    if (seen.has(key)) continue;
    toAdd.push({
      entryId: entryUid(),
      skillId,
      userText: m.text,
      claudeStarterText: undefined,
      isStarterEdited: true,
      emotionalTags: [],
      genreTags: [],
      createdAt: m.updatedAt ?? now,
      lastEdited: m.updatedAt ?? now,
      legacySource: 'mode',
    });
    seen.add(key);
  }

  for (const d of intervalDescs) {
    if (!d.text?.trim()) continue;
    // Interval descriptions predate the canonical skillId scheme;
    // give them a stable "description" subtype so they don't collide
    // with interval ear-training skill rows.
    const skillId = canonicalSkillId('intervals', 'description', d.intervalKey);
    const key = `interval:${skillId}`;
    if (seen.has(key)) continue;
    toAdd.push({
      entryId: entryUid(),
      skillId,
      userText: d.text,
      claudeStarterText: undefined,
      isStarterEdited: true,
      emotionalTags: [],
      genreTags: [],
      createdAt: d.updatedAt ?? now,
      lastEdited: d.updatedAt ?? now,
      legacySource: 'interval',
    });
    seen.add(key);
  }

  if (toAdd.length > 0) {
    await db.harmonicDiaryEntries.bulkAdd(toAdd);
  }
}

/**
 * Seed starter associations for every skill that doesn't yet have a
 * diary entry. Idempotent — a skillId already represented (legacy
 * migration, user-created entry, or previous starter run) is skipped.
 *
 * Starters land with `userText: ''` so the UI surfaces the starter
 * copy + "tap to customise" call-to-action. When the user edits,
 * `isStarterEdited` flips to true and `claudeStarterText` stays as a
 * reference they can revisit.
 */
export async function seedStartersIfNeeded(): Promise<void> {
  const existing = await db.harmonicDiaryEntries.toArray();
  const existingSkillIds = new Set<string>();
  for (const e of existing) existingSkillIds.add(e.skillId);

  const now = Date.now();
  const seeds = allStarters();
  const toAdd: HarmonicDiaryEntry[] = [];
  for (const seed of seeds) {
    if (existingSkillIds.has(seed.skillId)) continue;
    toAdd.push({
      entryId: entryUid(),
      ...starterToEntry(seed, now),
    });
  }

  if (toAdd.length > 0) {
    await db.harmonicDiaryEntries.bulkAdd(toAdd);
  }
}

// --- CRUD -----------------------------------------------------------

export async function loadAllDiaryEntries(): Promise<HarmonicDiaryEntry[]> {
  return db.harmonicDiaryEntries
    .orderBy('lastEdited')
    .reverse()
    .toArray();
}

export async function upsertDiaryEntry(
  skillId: string,
  patch: Partial<Omit<HarmonicDiaryEntry, 'entryId' | 'skillId' | 'createdAt'>>,
): Promise<HarmonicDiaryEntry> {
  const existing = await db.harmonicDiaryEntries.where('skillId').equals(skillId).first();
  const now = Date.now();
  if (existing) {
    const next: HarmonicDiaryEntry = {
      ...existing,
      ...patch,
      userText: patch.userText ?? existing.userText,
      emotionalTags: patch.emotionalTags ?? existing.emotionalTags,
      genreTags: patch.genreTags ?? existing.genreTags,
      isStarterEdited: patch.isStarterEdited ?? existing.isStarterEdited,
      lastEdited: now,
    };
    await db.harmonicDiaryEntries.put(next);
    return next;
  }
  const row: HarmonicDiaryEntry = {
    entryId: entryUid(),
    skillId,
    userText: patch.userText ?? '',
    claudeStarterText: patch.claudeStarterText,
    isStarterEdited: patch.isStarterEdited ?? ((patch.userText ?? '').trim() !== ''),
    emotionalTags: patch.emotionalTags ?? [],
    genreTags: patch.genreTags ?? [],
    createdAt: now,
    lastEdited: now,
  };
  await db.harmonicDiaryEntries.put(row);
  return row;
}

export async function deleteDiaryEntry(entryId: string): Promise<void> {
  await db.harmonicDiaryEntries.delete(entryId);
}

import { db, type HarmonicDiaryEntry, type SkillAnnotation } from '../../lib/db';
import { canonicalSkillId } from '../skills/registry';
import { whenSyncReady } from '../../lib/sync/syncReady';
import { getPref, setPref } from '../../lib/userPrefs';
import { allStarters, inferConceptTags, starterToEntry } from './starters';

/**
 * Lightweight uuid-ish id generator, same pattern as the rest of the
 * app. Collisions are astronomically unlikely at the scale of a
 * single user's diary.
 */
function entryUid(): string {
  return `diary-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

// --- Seed/migration version flags ---------------------------------
//
// Version-bump pattern (mirrors seedRepertoireIfNeeded). Each function
// stores a version number in userPrefs; when the constant here is
// bumped above the stored value, the function re-runs once. The
// snapshot-based dedup inside each function is the secondary safety
// net — it prevents re-adding skillIds that already exist on a
// version-bump re-run.
//
// In-flight guards prevent concurrent invocations from racing. Two
// parallel calls (e.g. React StrictMode's double-invoke of useEffect,
// or a remount before the first call resolves) would otherwise both
// see an empty snapshot and both `bulkAdd` 98 entries with fresh
// `entryUid()` keys — producing duplicates that share skillId but
// don't collide on Dexie's primary key. That's the bug that turned 98
// into 294.

export const SEED_DIARY_PREF = 'harmonicDiarySeedVersion';
export const SEED_DIARY_VERSION = 1;
const MIGRATE_LEGACY_PREF = 'harmonicDiaryLegacyMigrationVersion';
const MIGRATE_LEGACY_VERSION = 1;

let seedInFlight: Promise<void> | null = null;
let migrateInFlight: Promise<void> | null = null;

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
  if (migrateInFlight) return migrateInFlight;
  migrateInFlight = (async () => {
    try {
      await whenSyncReady();
      const stored = await getPref<number>(MIGRATE_LEGACY_PREF, 0);
      if (stored >= MIGRATE_LEGACY_VERSION) return;

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
      // This is the secondary safety net behind the version flag and
      // in-flight guard.
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
      await setPref(MIGRATE_LEGACY_PREF, MIGRATE_LEGACY_VERSION);
    } finally {
      migrateInFlight = null;
    }
  })();
  return migrateInFlight;
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
  if (seedInFlight) return seedInFlight;
  seedInFlight = (async () => {
    try {
      await whenSyncReady();
      const stored = await getPref<number>(SEED_DIARY_PREF, 0);
      if (stored >= SEED_DIARY_VERSION) return;

      const [existing, existingAnnotations] = await Promise.all([
        db.harmonicDiaryEntries.toArray(),
        db.skillAnnotations.toArray(),
      ]);
      const existingSkillIds = new Set<string>();
      for (const e of existing) existingSkillIds.add(e.skillId);
      const existingAnnSkillIds = new Set<string>();
      for (const a of existingAnnotations) existingAnnSkillIds.add(a.skillId);

      const now = Date.now();
      const seeds = allStarters();
      const entriesToAdd: HarmonicDiaryEntry[] = [];
      const annotationsToAdd: SkillAnnotation[] = [];
      for (const seed of seeds) {
        // Snapshot check is the secondary safety net behind the
        // version flag and in-flight guard. On a future SEED_VERSION
        // bump it lets us add only the genuinely new starters.
        if (!existingSkillIds.has(seed.skillId)) {
          entriesToAdd.push({
            entryId: entryUid(),
            ...starterToEntry(seed, now),
          });
        }
        // Pre-apply concept tags when no annotation exists for this
        // skill yet. Once the user starts editing tags, we stop
        // touching their row (the `existingAnnSkillIds` check).
        if (!existingAnnSkillIds.has(seed.skillId)) {
          const conceptTags = inferConceptTags(seed);
          if (conceptTags.length > 0) {
            annotationsToAdd.push({
              skillId: seed.skillId,
              tags: conceptTags,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      if (entriesToAdd.length > 0) {
        await db.harmonicDiaryEntries.bulkAdd(entriesToAdd);
      }
      if (annotationsToAdd.length > 0) {
        await db.skillAnnotations.bulkAdd(annotationsToAdd);
      }
      await setPref(SEED_DIARY_PREF, SEED_DIARY_VERSION);
    } finally {
      seedInFlight = null;
    }
  })();
  return seedInFlight;
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

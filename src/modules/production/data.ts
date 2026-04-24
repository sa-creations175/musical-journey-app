import {
  db,
  type GlossaryMastery,
  type ProductionLesson,
  type ProductionLessonMastery,
  type ProductionLessonSession,
  type ReferenceTrack,
} from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';
import { PRODUCTION_LESSONS } from './content/lessons';
import { GLOSSARY } from './content/glossary';
import { REFERENCE_TRACKS, STARTER_LEGACY_SONIC_NOTES } from './content/referenceTracks';
import { buildSpotifySearchLink, buildYouTubeProducerLink } from './searchLinks';

/** Flag set after the first time starter reference tracks are seeded.
 *  Once true we never re-seed, so the user's curation (deletes,
 *  archives, additions) is preserved across future builds. */
const PREF_REF_TRACKS_SEEDED = 'production.referenceTracks.seededAt';
/** Flag set after the most recent starter-content refresh pass has
 *  run. Bumped when the content/link format changes so users who
 *  already ran an earlier pass still receive the new backfill. Only
 *  updates starters the user hasn't edited. */
const PREF_REF_TRACKS_REFRESHED = 'production.referenceTracks.v3RefreshedAt';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/**
 * Seed the per-user state tables with any lessons / glossary terms /
 * starter tracks that aren't already present.
 *
 * Lessons and glossary terms seed on every mount — they're content
 * the app ships, and new versions may add rows that need to exist in
 * the user's DB. Reference tracks are different: the Library is a
 * user-owned space, so starters seed ONCE (guarded by
 * `PREF_REF_TRACKS_SEEDED`) and are never re-added afterwards. A
 * separate one-time pass (`PREF_REF_TRACKS_V2_REFRESHED`) rewrites
 * the original "fake technical analysis" notes to guided-listening
 * prose, but only for starters the user hasn't edited.
 */
export async function seedProductionIfNeeded(): Promise<void> {
  const now = Date.now();

  const [existingLessons, existingGlossary] = await Promise.all([
    db.productionLessons.toArray(),
    db.glossaryTermStates.toArray(),
  ]);

  const existingLessonIds = new Set(existingLessons.map(l => l.id));
  const existingGlossaryIds = new Set(existingGlossary.map(g => g.id));

  // --- Lessons ---
  const lessonRows: ProductionLesson[] = PRODUCTION_LESSONS
    .filter(l => !existingLessonIds.has(l.id))
    .map(l => ({
      id: l.id,
      pathId: l.pathId,
      order: l.order,
      mastery: 'not-started' as ProductionLessonMastery,
      revisitCount: 0,
      completedAt: null,
      lastOpenedAt: null,
      createdAt: now,
      updatedAt: now,
    }));

  // --- Glossary term states ---
  const glossaryRows = GLOSSARY
    .filter(g => !existingGlossaryIds.has(g.id))
    .map(g => ({
      id: g.id,
      mastery: 'not-yet' as GlossaryMastery,
      openCount: 0,
      lastEncounteredAt: null,
      gotItAt: null,
    }));

  // --- Reference tracks: seed ONCE only ---
  // Seeding rules:
  //   * First-time user (no existing tracks in DB) → seed all starters.
  //   * Existing user (tracks already in DB) → DON'T seed, just set the
  //     flag so we never seed on any future load. Respects deletes and
  //     additions the user has already made.
  // Both paths record the seededAt timestamp, making this a one-way
  // gate the user's library is safe from thereafter.
  const seededAt = await getPref<number>(PREF_REF_TRACKS_SEEDED, 0);
  let refRows: ReferenceTrack[] = [];
  if (seededAt === 0) {
    const existingCount = await db.referenceTracks.count();
    if (existingCount === 0) {
      refRows = REFERENCE_TRACKS.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        genre: t.genre,
        whatToListenFor: t.whatToListenFor,
        myListeningNotes: '',
        spotifyLink: t.spotifyLink ?? buildSpotifySearchLink(t.title, t.artist),
        youtubeLink: t.youtubeLink ?? buildYouTubeProducerLink(t.artist),
        tags: [...t.tags],
        isStarter: true,
        source: 'starter' as const,
        archived: false,
        addedAt: now,
        updatedAt: now,
      }));
    }
  }

  await db.transaction(
    'rw',
    [db.productionLessons, db.glossaryTermStates, db.referenceTracks, db.userPrefs],
    async () => {
      if (lessonRows.length > 0) await db.productionLessons.bulkAdd(lessonRows);
      if (glossaryRows.length > 0) await db.glossaryTermStates.bulkAdd(glossaryRows);
      if (refRows.length > 0) await db.referenceTracks.bulkAdd(refRows);
      if (seededAt === 0) await db.userPrefs.put({ key: PREF_REF_TRACKS_SEEDED, value: now });
    },
  );

  // --- One-time starter content refresh (fake-tech → guided-listening) ---
  // Runs exactly once per user, AFTER the initial seed. For each
  // starter track whose current `whatToListenFor` still matches the
  // original legacy sonic-notes text, we replace it with the new
  // guided-listening prose from the content file. If the text has
  // diverged at all, the user has edited it — we leave it alone.
  const refreshedAt = await getPref<number>(PREF_REF_TRACKS_REFRESHED, 0);
  if (refreshedAt === 0) {
    await refreshStarterListeningPrompts();
    await setPref(PREF_REF_TRACKS_REFRESHED, Date.now());
  }
}

async function refreshStarterListeningPrompts(): Promise<void> {
  const now = Date.now();
  const contentById = new Map(REFERENCE_TRACKS.map(t => [t.id, t]));
  const rows = await db.referenceTracks.toArray();
  const patches: Array<{ id: string; updates: Partial<ReferenceTrack> }> = [];
  for (const row of rows) {
    if (row.source !== 'starter' && !row.isStarter) continue;
    const content = contentById.get(row.id);
    if (!content) continue;
    const legacy = STARTER_LEGACY_SONIC_NOTES[row.id];
    // Treat a row as "unedited" when its current listening text is
    // either the legacy fake-tech prose OR already the new guided-
    // listening prose (second app-level refresh / restored backup).
    const current = row.whatToListenFor ?? row.sonicNotes ?? '';
    const isLegacy = legacy !== undefined && current.trim() === legacy.trim();
    const isAlreadyNew = current.trim() === content.whatToListenFor.trim();
    const contentUnedited = isLegacy || isAlreadyNew;

    // Canonical search links — every starter should carry them, even
    // when the user has edited the listening prose. A link format
    // migration isn't destructive, it just refreshes the URL.
    const canonicalSpotify = buildSpotifySearchLink(content.title, content.artist);
    const canonicalYouTube = buildYouTubeProducerLink(content.artist);

    const updates: Partial<ReferenceTrack> = {};
    if (contentUnedited && row.whatToListenFor !== content.whatToListenFor) {
      updates.whatToListenFor = content.whatToListenFor;
    }
    if (contentUnedited && row.source !== 'starter') {
      updates.source = 'starter';
    }
    if (!row.spotifyLink || row.spotifyLink.trim() === '') {
      updates.spotifyLink = canonicalSpotify;
    }
    if (!row.youtubeLink || row.youtubeLink.trim() === '') {
      updates.youtubeLink = canonicalYouTube;
    }
    if (Object.keys(updates).length === 0) continue;
    updates.updatedAt = now;
    patches.push({ id: row.id, updates });
  }
  if (patches.length === 0) return;
  await db.transaction('rw', db.referenceTracks, async () => {
    for (const p of patches) {
      await db.referenceTracks.update(p.id, p.updates);
    }
  });
}

// --- Lesson state CRUD ---------------------------------------------

export async function updateLessonMastery(
  lessonId: string,
  mastery: ProductionLessonMastery,
): Promise<void> {
  const now = Date.now();
  const row = await db.productionLessons.get(lessonId);
  if (!row) return;
  await db.productionLessons.update(lessonId, {
    mastery,
    completedAt: (mastery === 'completed' || mastery === 'mastered')
      ? (row.completedAt ?? now)
      : null,
    updatedAt: now,
  });
}

export async function recordLessonOpen(
  lessonId: string,
  openedDeepDive: boolean,
): Promise<void> {
  const now = Date.now();
  const existing = await db.productionLessons.get(lessonId);
  if (existing) {
    await db.productionLessons.update(lessonId, {
      revisitCount: existing.revisitCount + 1,
      lastOpenedAt: now,
      mastery: existing.mastery === 'not-started' ? 'in-progress' : existing.mastery,
      updatedAt: now,
    });
  }
  const session: ProductionLessonSession = {
    id: uid('pls'),
    lessonId,
    timestamp: now,
    openedDeepDive,
  };
  await db.productionLessonSessions.add(session);
}

// --- Glossary state CRUD -------------------------------------------

export async function markGlossaryGotIt(termId: string): Promise<void> {
  const now = Date.now();
  const existing = await db.glossaryTermStates.get(termId);
  if (existing) {
    await db.glossaryTermStates.update(termId, {
      mastery: 'got-it',
      gotItAt: existing.gotItAt ?? now,
      lastEncounteredAt: now,
      openCount: existing.openCount + 1,
    });
  } else {
    await db.glossaryTermStates.put({
      id: termId,
      mastery: 'got-it',
      openCount: 1,
      lastEncounteredAt: now,
      gotItAt: now,
    });
  }
}

export async function resetGlossaryMastery(termId: string): Promise<void> {
  const existing = await db.glossaryTermStates.get(termId);
  if (!existing) return;
  await db.glossaryTermStates.update(termId, {
    mastery: 'not-yet',
    gotItAt: null,
  });
}

export async function recordGlossaryOpen(termId: string): Promise<void> {
  const now = Date.now();
  const existing = await db.glossaryTermStates.get(termId);
  if (existing) {
    await db.glossaryTermStates.update(termId, {
      openCount: existing.openCount + 1,
      lastEncounteredAt: now,
    });
  } else {
    await db.glossaryTermStates.put({
      id: termId,
      mastery: 'not-yet',
      openCount: 1,
      lastEncounteredAt: now,
      gotItAt: null,
    });
  }
}

// --- Reference track CRUD ------------------------------------------

export async function addReferenceTrack(
  input: Omit<ReferenceTrack, 'id' | 'isStarter' | 'archived' | 'addedAt' | 'updatedAt' | 'source'> & {
    source?: 'user' | 'generated';
  },
): Promise<ReferenceTrack> {
  const now = Date.now();
  // Always ensure both search links are present. UI layers may also
  // compute these, but having the data layer backstop it means any
  // caller (including future importers) produces consistently-linked
  // rows without special-casing.
  const spotifyLink = input.spotifyLink && input.spotifyLink.trim() !== ''
    ? input.spotifyLink
    : buildSpotifySearchLink(input.title, input.artist);
  const youtubeLink = input.youtubeLink && input.youtubeLink.trim() !== ''
    ? input.youtubeLink
    : buildYouTubeProducerLink(input.artist);
  const row: ReferenceTrack = {
    id: uid('ref'),
    source: 'user',
    ...input,
    spotifyLink,
    youtubeLink,
    isStarter: false,
    archived: false,
    addedAt: now,
    updatedAt: now,
  };
  await db.referenceTracks.add(row);
  return row;
}

export async function updateReferenceTrack(
  id: string,
  patch: Partial<Omit<ReferenceTrack, 'id' | 'addedAt'>>,
): Promise<void> {
  await db.referenceTracks.update(id, { ...patch, updatedAt: Date.now() });
}

export async function archiveReferenceTrack(id: string, archived: boolean): Promise<void> {
  await db.referenceTracks.update(id, { archived, updatedAt: Date.now() });
}

export async function deleteReferenceTrack(id: string): Promise<void> {
  await db.referenceTracks.delete(id);
}

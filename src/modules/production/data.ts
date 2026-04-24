import {
  db,
  type GlossaryMastery,
  type ProductionLesson,
  type ProductionLessonMastery,
  type ProductionLessonSession,
  type ReferenceTrack,
} from '../../lib/db';
import { PRODUCTION_LESSONS } from './content/lessons';
import { GLOSSARY } from './content/glossary';
import { REFERENCE_TRACKS } from './content/referenceTracks';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/**
 * Seed the per-user state tables with any lessons / glossary terms /
 * starter tracks that aren't already present. Idempotent — runs on
 * every mount of the Production module without touching rows the
 * user has already interacted with.
 */
export async function seedProductionIfNeeded(): Promise<void> {
  const now = Date.now();

  const [existingLessons, existingGlossary, existingRefs] = await Promise.all([
    db.productionLessons.toArray(),
    db.glossaryTermStates.toArray(),
    db.referenceTracks.toArray(),
  ]);

  const existingLessonIds = new Set(existingLessons.map(l => l.id));
  const existingGlossaryIds = new Set(existingGlossary.map(g => g.id));
  const existingRefIds = new Set(existingRefs.map(r => r.id));

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

  // --- Reference tracks (starter seeds) ---
  const refRows: ReferenceTrack[] = REFERENCE_TRACKS
    .filter(t => !existingRefIds.has(t.id))
    .map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      sonicNotes: t.sonicNotes,
      tags: [...t.tags],
      isStarter: true,
      archived: false,
      addedAt: now,
      updatedAt: now,
    }));

  await db.transaction(
    'rw',
    [db.productionLessons, db.glossaryTermStates, db.referenceTracks],
    async () => {
      if (lessonRows.length > 0) await db.productionLessons.bulkAdd(lessonRows);
      if (glossaryRows.length > 0) await db.glossaryTermStates.bulkAdd(glossaryRows);
      if (refRows.length > 0) await db.referenceTracks.bulkAdd(refRows);
    },
  );
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
  input: Omit<ReferenceTrack, 'id' | 'isStarter' | 'archived' | 'addedAt' | 'updatedAt'>,
): Promise<ReferenceTrack> {
  const now = Date.now();
  const row: ReferenceTrack = {
    id: uid('ref'),
    ...input,
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

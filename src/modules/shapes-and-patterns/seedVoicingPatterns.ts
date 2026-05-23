// System voicing-pattern catalog + seeder for the lead-sheet voicing
// carousel (see docs/VOICING_CAROUSEL_DESIGN.md, Step 1).
//
// The system patterns are DERIVED from the same voicing engine the
// mental-viz library uses (chordShapeOffsets / extendedDomOffsets in
// mentalVizVoicing.ts), so a carousel slide and a mental-viz reveal of the
// same quality look identical. Offsets are the canonical convention:
// absolute semitones above the chord root, with hand.
//
// System rows (isSystem: true) are seeded from code on every device and are
// NEVER synced to Supabase (the sync `enqueue` boundary skips them). The
// seeder only ever inserts/prunes system rows — user-saved patterns
// (isSystem: false) are never touched.

import { db, type VoicingEntry, type VoicingPattern } from '../../lib/db';
import { whenSyncReady } from '../../lib/sync/syncReady';
import { normalizeVoicing } from '../../lib/voicingColors';
import { CHORD_QUALITIES } from './catalog';
import {
  EXTENDED_DOM_VOICINGS,
  chordShapeOffsets,
  extendedDomOffsets,
} from './mentalVizVoicing';

// Fixed timestamp for system rows so the catalog is deterministic (stable
// across builds and devices) — system rows don't sync, so wall-clock time
// is meaningless for them. 2026-05-23, the feature's creation date.
const SYSTEM_TIMESTAMP = Date.UTC(2026, 4, 23);

const TRIAD_IDS = ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4'] as const;
const SEVENTH_IDS = ['maj7', 'min7', 'dom7', 'm7b5', 'dim7', 'mmaj7'] as const;
const INVERSION_TAG = ['root', 'inv1', 'inv2', 'inv3'];
const INVERSION_LABEL = [
  'Root position',
  '1st inversion',
  '2nd inversion',
  '3rd inversion',
];

// Extended-dominant family (from EXTENDED_DOM_VOICINGS) → the catalog
// quality id whose carousel these voicings belong under. The voicings are
// richer than the bare quality, but a player typing that quality wants
// exactly these shapes as candidates.
const EXTENDED_FAMILY_TO_QUALITY: Record<string, string> = {
  dom9_13: 'dom13',
  'dom7#9#5': 'dom7s9',
  dom7b9: 'dom7b9',
};

function toEntries(offsets: number[]): VoicingEntry[] {
  return normalizeVoicing(offsets);
}

function pattern(
  qualityId: string,
  tag: string,
  label: string,
  offsets: VoicingEntry[],
  sortOrder: number,
  source: string,
): VoicingPattern {
  return {
    id: `vp:sys:${qualityId}:${tag}`,
    qualityId,
    label,
    offsets,
    isSystem: true,
    sortOrder,
    source,
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  };
}

/**
 * The full system voicing-pattern catalog. Pure + deterministic.
 *   Triads:    6 qualities × 3 inversions          = 18
 *   Sevenths:  6 qualities × 4 inversions          = 24
 *   Ext/special root stacks: 17 qualities          = 17
 *   Extended dominants:      8 voicings            =  8
 *                                          total   = 67
 */
export function buildSystemVoicingPatterns(): VoicingPattern[] {
  const out: VoicingPattern[] = [];

  for (const id of TRIAD_IDS) {
    for (let inv = 0; inv < 3; inv++) {
      out.push(
        pattern(
          id,
          INVERSION_TAG[inv],
          INVERSION_LABEL[inv],
          toEntries(chordShapeOffsets(id, inv)),
          inv,
          'triad-inv',
        ),
      );
    }
  }

  for (const id of SEVENTH_IDS) {
    for (let inv = 0; inv < 4; inv++) {
      out.push(
        pattern(
          id,
          INVERSION_TAG[inv],
          INVERSION_LABEL[inv],
          toEntries(chordShapeOffsets(id, inv)),
          inv,
          'seventh-inv',
        ),
      );
    }
  }

  // Root-position stacks for the extension + special qualities (triads and
  // sevenths are covered above by their inversion sets).
  for (const q of CHORD_QUALITIES) {
    if (q.kind !== 'extension' && q.kind !== 'special') continue;
    out.push(
      pattern(
        q.id,
        'root',
        'Root position',
        toEntries(chordShapeOffsets(q.id, 0)),
        0,
        q.kind,
      ),
    );
  }

  // Curated extended-dominant voicings (A/B positions, dom7b9 inversions),
  // appended after any root stack for the same quality (sortOrder 100+).
  EXTENDED_DOM_VOICINGS.forEach((v, i) => {
    const qualityId = EXTENDED_FAMILY_TO_QUALITY[v.family] ?? 'dom7';
    out.push({
      id: `vp:sys:${qualityId}:${v.id}`,
      qualityId,
      label: v.label,
      offsets: extendedDomOffsets(v),
      isSystem: true,
      sortOrder: 100 + i,
      source: 'extended-dom',
      createdAt: SYSTEM_TIMESTAMP,
      updatedAt: SYSTEM_TIMESTAMP,
    });
  });

  return out;
}

let seedInFlight: Promise<void> | null = null;

/**
 * Idempotently seed the system voicing patterns into Dexie. Models
 * seedProficiencyDefinitionsIfNeeded: in-flight guard, wait for sync to be
 * ready, prune obsolete SYSTEM rows, bulkPut the current catalog. User rows
 * (isSystem: false) are never read for pruning and never overwritten.
 */
export async function seedVoicingPatternsIfNeeded(): Promise<void> {
  if (seedInFlight) return seedInFlight;
  seedInFlight = (async () => {
    try {
      await runSeed();
    } finally {
      seedInFlight = null;
    }
  })();
  return seedInFlight;
}

async function runSeed(): Promise<void> {
  await whenSyncReady();

  const desired = buildSystemVoicingPatterns();
  const desiredIds = new Set(desired.map(p => p.id));

  // isSystem is not indexed (booleans aren't IndexedDB keys), so read all
  // and filter in memory — the table is small.
  const all = await db.voicingPatterns.toArray();
  const obsoleteSystemIds = all
    .filter(p => p.isSystem && !desiredIds.has(p.id))
    .map(p => p.id);
  if (obsoleteSystemIds.length > 0) {
    await db.voicingPatterns.bulkDelete(obsoleteSystemIds);
  }

  // bulkPut is unconditional — covers first-run inserts and content updates
  // for already-seeded system rows. Cheap for a ~67-row catalog.
  await db.voicingPatterns.bulkPut(desired);
}

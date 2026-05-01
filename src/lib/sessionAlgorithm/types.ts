/**
 * Phase 3 Step 2 — Algorithm pure-logic types.
 *
 * Shared shapes used across the session-generation pipeline:
 * candidates → weighting → time allocation → sequencing → proposal.
 *
 * Reducer-style: every helper takes plain inputs and returns plain
 * outputs, no side effects. The async layer that fetches spacingState
 * rows and goal records lives one floor up; this file is the math.
 */

import type { AcquisitionStage, MemoryType } from '../db';

export type GoalKind =
  | 'coverage'
  | 'accuracy'
  | 'consistency'
  | 'song_proficiency'
  | 'production_count'
  | 'umbrella'
  | 'unsupported';

/**
 * Spec returned by candidateSpecForGoal — describes WHAT the goal
 * wants in a way the candidate pool can filter against, without
 * pre-fetching any data. Coverage / accuracy / consistency each scope
 * to a list of moduleRefs and (sometimes) a sub-area filter; umbrella
 * delegates to children; unsupported is a no-op.
 *
 * Coverage goals additionally specify excluded stages — items whose
 * spacingState already shows them as `acquired` or higher don't count
 * toward "items still to cover."
 */
export type CandidateSpec =
  | {
      kind: 'coverage';
      moduleRefs: readonly string[];
      excludeStages: ReadonlySet<AcquisitionStage>;
      itemRefFilter?: (itemRef: string) => boolean;
    }
  | {
      kind: 'accuracy';
      moduleRefs: readonly string[];
      itemRefFilter?: (itemRef: string) => boolean;
    }
  | {
      kind: 'consistency';
      moduleRefs: readonly string[];
    }
  | {
      kind: 'song_proficiency';
      // Delegates per-song stage tracking elsewhere (Phase 1.5
      // matrix). The pure pipeline doesn't enumerate songs in 2a;
      // 2h's lived-with window + the song matrix together do.
      relatedItems: readonly string[];
    }
  | {
      kind: 'production_count';
      // Counts production lessons completed; lesson refs are catalog
      // items in the production module.
      moduleRefs: readonly string[];
    }
  | { kind: 'umbrella' }
  | { kind: 'unsupported' };

/**
 * Minimal spacingState shape the resolver consumes. Mirrors the
 * database row but typed loosely so tests can construct fixtures
 * without faking Dexie. Real callers pass `db.spacingState` rows
 * directly — they conform to this shape.
 */
export interface SpacingRow {
  itemRef: string;
  moduleRef: string;
  acquisitionStage: AcquisitionStage;
  memoryType?: MemoryType;
  lastEngagedAt: number | null;
  nextDueAt: number | null;
}

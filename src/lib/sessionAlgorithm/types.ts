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
 *
 * `maintenance` is the INVERSE of coverage and the only kind that is
 * never produced by `candidateSpecForGoal` from a goal alone — it is
 * derived from a coverage spec once that scope has nothing left to
 * cover. See `maintenanceSpecFrom` in candidates.ts.
 */
export type CandidateSpec =
  | {
      kind: 'coverage';
      moduleRefs: readonly string[];
      excludeStages: ReadonlySet<AcquisitionStage>;
      itemRefFilter?: (itemRef: string) => boolean;
      /** Phase B Step 9b follow-up #2 — explicit Accept-extended scope
       *  items. When present, `resolveCandidates` accepts a row whose
       *  `itemRef` is in this set even if `row.moduleRef` falls
       *  OUTSIDE `moduleRefs`. The mechanism that makes cross-
       *  submodule ET carry-over surface as monthly-scope (rather
       *  than backlog-only). For same-module coverage specs the
       *  override is a no-op — `moduleRefs.has(row.moduleRef)`
       *  already passes — and the existing
       *  `extendWithRelatedItems(filter)` keeps doing the
       *  itemRefFilter half of the work. */
      relatedItems?: ReadonlySet<string>;
    }
  | {
      /**
       * SCOPE-LEVEL MAINTENANCE — acquired AND due, the exact inverse
       * of the coverage spec's exclude-acquired filter.
       *
       * Coverage asks "what is left to learn?" and goes silent once
       * the answer is nothing. This asks "what is already learned and
       * wants a touch?", so a fully-acquired scope can still produce
       * a block — and a block is the gate every downstream time
       * decision sits behind (`computePhaseBBlockNeeds` iterates
       * blocks, so a module with none never reaches allocation).
       *
       * DISTINCT FROM per-item `SkillPriority = 'maintenance'`
       * (db.ts:1101), which is a user-set annotation in the Skills
       * module. Same concept, different level: per-item maintenance
       * changes WHAT is practised inside a slice, scope-level
       * maintenance changes HOW BIG the slice is. They are not
       * joined, deliberately.
       *
       * Carries the same scoping fields as the coverage spec it is
       * derived from, so an Accept-extended or sub-area-filtered
       * scope keeps its exact membership when it flips to
       * maintenance.
       */
      kind: 'maintenance';
      moduleRefs: readonly string[];
      itemRefFilter?: (itemRef: string) => boolean;
      /** Same Accept-extended bypass as the coverage spec's — see
       *  the `relatedItems` note above. Preserved through the
       *  coverage→maintenance conversion so scope membership does
       *  not silently narrow when a scope saturates. */
      relatedItems?: ReadonlySet<string>;
      /**
       * Upper bound (epoch ms) on `nextDueAt` for a row to count as
       * due. Lives on the spec rather than as a resolver argument so
       * `resolveCandidates`'s signature — and its many call sites —
       * stay untouched.
       *
       * A null `nextDueAt` is NOT due, matching
       * `computeAlgoSpacingDemandSeconds`: null marks an unscheduled
       * row (a Production assertSpacingStage write, a fresh backfill,
       * or a hand-edited row), not one the SR algorithm has asked
       * for. Demand and supply have to agree on what "due" means or
       * the slice and the cards it holds will disagree.
       */
      dueBefore: number;
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

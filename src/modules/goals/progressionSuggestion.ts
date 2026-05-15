/**
 * Phase B Step 9c — progression suggestion engine.
 *
 * Given a module's ordered ProgressionStages and the current monthly
 * goal's effective scope, pick the next actionable "what comes next"
 * — or surface the half-done UX, or fall back to no suggestion when
 * coverage is too fragmented across stages to point at one obvious
 * step.
 *
 * Pure / fixture-friendly — no Dexie, no clock.
 *
 * Algorithm (the doc's "Module-by-module progression source-of-truth"
 * + the half-done case spec under Step 9c):
 *
 *   For each stage, categorize by overlap with current scope:
 *     full    — every itemRef is in scope (stage complete)
 *     partial — some but not all itemRefs in scope
 *     empty   — no itemRefs in scope
 *     skip    — stage has no itemRefs (e.g. VL stub, an empty Layer-3
 *               Chord-Shapes entry); never qualifies as the next step
 *
 *   1. If every non-skip stage is full → null (nothing more to do).
 *   2. Find the first non-skip stage that isn't full. Call it `i`.
 *      - If stage[i] is empty AND nothing earlier was partial →
 *        kind: 'next' (point at stage[i]).
 *      - If stage[i] is partial AND no LATER stage has any scope
 *        items → kind: 'half-done' (finish stage[i] OR jump to the
 *        next non-skip empty stage after i).
 *      - Otherwise the scope is spread across multiple stages (a
 *        partial AND a non-adjacent later stage both have items) →
 *        null. Ambiguous: the user has deliberate cross-stage
 *        coverage, the engine shouldn't second-guess.
 *
 * "Half-done with nothing after it" is the design-doc UX where the
 * user has e.g. "augmented triads in 5 of 12 keys" and the rest of
 * the progression is untouched.
 */

import type { ProgressionStage } from './progressionStages';

export type ProgressionSuggestion =
  | {
      kind: 'next';
      /** The stage being suggested. Every itemRef in `addItemRefs`
       *  comes from this stage. */
      stage: ProgressionStage;
      /** Items in the stage NOT yet in current scope — what the
       *  one-tap accept appends to `goal.relatedItems`. */
      addItemRefs: ReadonlyArray<string>;
      /** Convenience: `addItemRefs.length`. The UI labels this as
       *  "+N toward yearly pace." */
      addCount: number;
    }
  | {
      kind: 'half-done';
      /** Partially-covered stage. */
      currentStage: ProgressionStage;
      /** Items in `currentStage` still outside scope (the "finish
       *  this stage" branch of the half-done UX). */
      currentStageRemainingItemRefs: ReadonlyArray<string>;
      /** Count of currentStageRemainingItemRefs. */
      currentStageAddCount: number;
      /** Next non-skip empty stage after currentStage — what the
       *  "move on" branch points at. Null when nothing actionable
       *  follows (every later stage is skip or full); UI drops the
       *  second option when null. */
      nextStage: ProgressionStage | null;
      /** Items the "move on" branch would add (= entire nextStage,
       *  which is empty by construction). Empty array when
       *  nextStage is null. */
      nextStageAddItemRefs: ReadonlyArray<string>;
      /** Count of nextStageAddItemRefs. */
      nextStageAddCount: number;
    };

type StageStatus = 'full' | 'partial' | 'empty' | 'skip';

function statusFor(
  stage: ProgressionStage,
  scope: ReadonlySet<string>,
): StageStatus {
  if (stage.itemRefs.length === 0) return 'skip';
  let inScope = 0;
  for (const ref of stage.itemRefs) if (scope.has(ref)) inScope += 1;
  if (inScope === 0) return 'empty';
  if (inScope === stage.itemRefs.length) return 'full';
  return 'partial';
}

function itemsNotInScope(
  stage: ProgressionStage,
  scope: ReadonlySet<string>,
): string[] {
  return stage.itemRefs.filter(ref => !scope.has(ref));
}

/**
 * Find the next progression suggestion for a goal's current scope.
 *
 *   stages           — the module-or-sub-area progression list, in order
 *   currentScopeItemRefs — every itemRef the goal currently covers
 *                          (metric scope ∪ relatedItems — i.e., the
 *                          output of `effectiveScopeForGoal`)
 *
 * Returns null when nothing actionable applies — either every stage
 * is fully in scope, or coverage is spread ambiguously across
 * multiple stages, or the progression has no item-bearing stages at
 * all (VL stub, repertoire, practice-consistency).
 */
export function computeNextProgressionSuggestion(
  stages: ReadonlyArray<ProgressionStage>,
  currentScopeItemRefs: Iterable<string>,
): ProgressionSuggestion | null {
  const scope = currentScopeItemRefs instanceof Set
    ? (currentScopeItemRefs as ReadonlySet<string>)
    : new Set(currentScopeItemRefs);

  // Walk once, capture each stage's status. Lets us reason globally
  // (e.g., "is anything AFTER stage[i] also in scope?") without
  // re-walking.
  const statuses: StageStatus[] = stages.map(s => statusFor(s, scope));

  // 1) Every actionable stage already full → nothing to suggest.
  const allDone = statuses.every(s => s === 'full' || s === 'skip');
  if (allDone) return null;

  // 2) First stage that isn't done.
  let i = -1;
  for (let k = 0; k < statuses.length; k++) {
    if (statuses[k] === 'full' || statuses[k] === 'skip') continue;
    i = k;
    break;
  }
  if (i === -1) return null;

  // First not-done stage is empty → "next" suggestion, UNLESS some
  // later stage has scope coverage (a non-skip, non-empty status
  // anywhere after i). That signals scattered scope — return null
  // rather than urging the user backward.
  if (statuses[i] === 'empty') {
    for (let k = i + 1; k < statuses.length; k++) {
      const s = statuses[k];
      if (s === 'partial' || s === 'full') return null;
    }
    const stage = stages[i];
    const addItemRefs = stage.itemRefs.slice(); // every item is out-of-scope here
    return { kind: 'next', stage, addItemRefs, addCount: addItemRefs.length };
  }

  // statuses[i] === 'partial' — half-done case. Check the tail
  // doesn't have additional partial/full content (which would be
  // ambiguous).
  let tailHasAdditional = false;
  let nextEmptyIdx = -1;
  for (let k = i + 1; k < statuses.length; k++) {
    const s = statuses[k];
    if (s === 'partial' || s === 'full') {
      tailHasAdditional = true;
      break;
    }
    if (s === 'empty' && nextEmptyIdx === -1) {
      nextEmptyIdx = k;
    }
  }
  if (tailHasAdditional) return null;

  const currentStage = stages[i];
  const currentRemain = itemsNotInScope(currentStage, scope);
  const nextStage = nextEmptyIdx === -1 ? null : stages[nextEmptyIdx];
  const nextAdd = nextStage ? nextStage.itemRefs.slice() : [];
  return {
    kind: 'half-done',
    currentStage,
    currentStageRemainingItemRefs: currentRemain,
    currentStageAddCount: currentRemain.length,
    nextStage,
    nextStageAddItemRefs: nextAdd,
    nextStageAddCount: nextAdd.length,
  };
}

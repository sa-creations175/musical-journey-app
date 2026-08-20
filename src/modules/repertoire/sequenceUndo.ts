import { useSyncExternalStore } from 'react';
import type { SequenceView } from '../../lib/db';

/**
 * Undo for progression-strip edits.
 *
 * ---------------------------------------------------------------
 * WHY A STACK RATHER THAN A SINGLE STEP
 *
 * These edits arrive in RUNS. Adding one separator and seeing it was
 * wrong is rare; adding five while phrasing a section and then noticing
 * is the normal case. A single-level undo would have handled the first
 * and been useless for the second — which is the report that prompted
 * this.
 *
 * Twenty is chosen to comfortably exceed one working pass over a
 * section without pretending to be a document history.
 * ---------------------------------------------------------------
 *
 * IN MEMORY, NOT PERSISTED. `sequenceView` syncs, so a persisted stack
 * would have to answer what an undo recorded on the desktop means on
 * the phone — a real question with no good answer, for a feature whose
 * whole value is within the minute after a mistake. Reloading the page
 * clears it, which is honest: the affordance is visibly gone rather
 * than silently stale.
 *
 * SCOPED PER SONG and cleared when the song changes, so an undo can
 * never reach across into a song you are no longer looking at.
 *
 * THE STACK DOES NOT WRITE. It holds what the view was; the caller owns
 * the commit, because the two surfaces that edit these records already
 * have their own commit paths (one carries a legacy id remap the other
 * does not) and routing a restore around them would be a third way to
 * write the same field.
 */

export interface SequenceUndoEntry {
  songId: string;
  sectionId: string;
  /** The view as it stood BEFORE the edit. */
  before: SequenceView;
  /**
   * The sequence order at capture time.
   *
   * Carried because a restore has to be pruned against chords deleted
   * since, and `pruneDeletedPlacements` merges each orphaned note into
   * the break that follows it — which is only well-defined against the
   * order the annotations were written in. Passing today's order would
   * sort the dead anchors last and pile their notes onto the tail.
   */
  orderAtCapture: string[];
  /** Short description of the edit being undone, for the control. */
  label: string;
}

export const UNDO_LIMIT = 20;

let stack: SequenceUndoEntry[] = [];
let songId: string | null = null;

const EVENT = 'sequenceundochange';

function emit(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/**
 * Point the stack at a song, discarding anything held for a different
 * one. Idempotent — calling it with the song already set keeps the
 * stack, so a re-render cannot wipe the user's undo history.
 */
export function setUndoSong(nextSongId: string | null): void {
  if (songId === nextSongId) return;
  songId = nextSongId;
  stack = [];
  emit();
}

/** Record what a view looked like before an edit. */
export function pushUndo(entry: SequenceUndoEntry): void {
  if (entry.songId !== songId) return;
  stack = [...stack, entry].slice(-UNDO_LIMIT);
  emit();
}

/** Take the most recent entry off the stack, or null when empty. */
export function popUndo(): SequenceUndoEntry | null {
  const top = stack[stack.length - 1];
  if (!top) return null;
  stack = stack.slice(0, -1);
  emit();
  return top;
}

/** The entry that would be undone next, without consuming it. Lets the
 *  control name what it will do rather than saying only "undo". */
export function peekUndo(): SequenceUndoEntry | null {
  return stack[stack.length - 1] ?? null;
}

export function undoDepth(): number {
  return stack.length;
}

/** Test seam. */
export function __resetUndoForTests(): void {
  stack = [];
  songId = null;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Re-renders the consumer whenever the stack changes. */
export function useUndoDepth(): number {
  return useSyncExternalStore(subscribe, undoDepth, () => 0);
}

/**
 * Which placement ids in a stored view no longer exist.
 *
 * Pure, and exported for its own tests. Feeding these to
 * `pruneDeletedPlacements` is what stops an undo resurrecting an
 * annotation onto a chord deleted since the edit — a row that would
 * filter nothing, render nothing, and be unreachable from any UI, so
 * it could never be removed again.
 */
export function deadAnchors(
  view: SequenceView,
  currentOrder: ReadonlyArray<string>,
): string[] {
  const live = new Set(currentOrder);
  const referenced = [
    ...view.breaks.map(b => b.afterPlacementId),
    ...view.hidden,
  ];
  // Deduped: pruneDeletedPlacements walks the list and removing the
  // same break twice would merge its note forward a second time.
  return [...new Set(referenced.filter(id => !live.has(id)))];
}

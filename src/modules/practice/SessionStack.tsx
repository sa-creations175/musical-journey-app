/**
 * Phase 3 Step 4c — Session stack.
 *
 * Vertical stack of SessionBlock components with a hairline gap
 * between them. Block heights are proportional to plannedSeconds —
 * a 5-min block is half the height of a 10-min block. The container
 * honours a per-block minimum height so even the shortest blocks
 * render legibly; longer sessions stretch above that floor.
 *
 * Drag-to-reorder: when the caller supplies `onReorder`, each
 * top-level group gets a drag handle and the user can shuffle the
 * order. Adjacent warm-up + practice pairs (chord-quiz before a
 * Repertoire block) drag as a single unit so the quiz can't be
 * stranded from its practice. The flat block order produced by the
 * reorder is passed back via `onReorder`; SessionStack stays
 * stateless.
 */
import { useMemo, type CSSProperties } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SessionBlock from './SessionBlock';
import type { ProposalBlock } from './proposalTypes';

/** Per-block height floor. Each group / inner block can't shrink
 *  below this even when its proportional share would. Trade-off:
 *  on sessions with a very large block alongside very small ones
 *  the proportions read slightly compressed (the small block holds
 *  at 80 px instead of, say, 18 px), but content NEVER gets
 *  clipped — a 3-min chord-quiz still shows its name + duration
 *  legibly. Picked over the prior container-level floor (which
 *  starved short blocks via flex-grow distribution). */
const MIN_BLOCK_PX = 80;

interface Props {
  blocks: ReadonlyArray<ProposalBlock>;
  /** Drag-to-reorder hook. When supplied, the stack becomes
   *  sortable and emits the reordered list on drop. Each
   *  warm-up + practice pair (chord-quiz immediately followed by
   *  its repertoire practice block) moves as one — the user can't
   *  separate the quiz from the practice it sets up. */
  onReorder?: (next: ProposalBlock[]) => void;
}

/** A drag unit. Single-block groups contain one item; paired
 *  groups contain a warm-up followed by its practice block. */
interface BlockGroup {
  /** Stable id for SortableContext — uses the first item's id. */
  id: string;
  items: ProposalBlock[];
}

/** Group adjacent (isWarmup → next-block) into draggable pairs.
 *  Order-stable across reorders: a regrouped list returns the same
 *  shape because chord-quiz keeps its practice partner immediately
 *  after it on every move. */
function groupBlocks(blocks: ReadonlyArray<ProposalBlock>): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.isWarmup && i + 1 < blocks.length) {
      groups.push({ id: b.id, items: [b, blocks[i + 1]] });
      i += 2;
    } else {
      groups.push({ id: b.id, items: [b] });
      i += 1;
    }
  }
  return groups;
}

function sumSeconds(items: ReadonlyArray<ProposalBlock>): number {
  return items.reduce((s, b) => s + Math.max(1, b.plannedSeconds), 0);
}

export default function SessionStack({ blocks, onReorder }: Props) {
  const groups = useMemo(() => groupBlocks(blocks), [blocks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-4 text-center text-xs text-neutral-500">
        No blocks in this proposal.
      </div>
    );
  }

  // Outer container minHeight covers the sum of per-block floors —
  // matches what the per-block min-heights will impose anyway, but
  // surfacing it on the container avoids an extra-tall outline
  // during the brief moment before all rows resolve their flex
  // layout.
  const minTotalPx = blocks.length * MIN_BLOCK_PX;

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = groups.findIndex(g => g.id === active.id);
    const newIdx = groups.findIndex(g => g.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const nextGroups = arrayMove(groups, oldIdx, newIdx);
    onReorder(nextGroups.flatMap(g => g.items));
  };

  const stackInner = (
    <div
      className="w-full min-w-0 overflow-hidden flex flex-col gap-0.5 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
      style={{ minHeight: `${minTotalPx}px` }}
    >
      {groups.map(group => (
        onReorder
          ? <SortableGroupRow key={group.id} group={group} />
          : <StaticGroupRow key={group.id} group={group} />
      ))}
    </div>
  );

  if (!onReorder) return stackInner;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={groups.map(g => g.id)}
        strategy={verticalListSortingStrategy}
      >
        {stackInner}
      </SortableContext>
    </DndContext>
  );
}

/** Non-sortable group — same proportional layout, no drag handle.
 *  Used when the caller didn't opt into reordering. */
function StaticGroupRow({ group }: { group: BlockGroup }) {
  const seconds = sumSeconds(group.items);
  // minHeight = (#items × MIN_BLOCK_PX) — paired groups stack two
  // blocks vertically, so the floor stretches accordingly.
  const style: CSSProperties = {
    flexGrow: seconds,
    flexShrink: seconds,
    flexBasis: 0,
    minHeight: `${group.items.length * MIN_BLOCK_PX}px`,
  };
  return (
    <div style={style} className="flex flex-col gap-0.5">
      <GroupBlocks group={group} />
    </div>
  );
}

/** Sortable group — drag handle on the left, blocks on the right.
 *  Height is proportional to the sum of contained block seconds,
 *  bounded below by (#items × MIN_BLOCK_PX). */
function SortableGroupRow({ group }: { group: BlockGroup }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });
  const seconds = sumSeconds(group.items);
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    flexGrow: seconds,
    flexShrink: seconds,
    flexBasis: 0,
    minHeight: `${group.items.length * MIN_BLOCK_PX}px`,
    opacity: isDragging ? 0.5 : 1,
    // While dragging, lift above sibling rows so the moving group
    // visually leads the reflow.
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? 'relative' : undefined,
  };
  const ariaLabel = group.items.length > 1
    ? `drag to reorder warm-up + ${group.items[1].moduleLabel} pair`
    : `drag to reorder ${group.items[0].moduleLabel} block`;
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1.5">
      <button
        type="button"
        aria-label={ariaLabel}
        {...attributes}
        {...listeners}
        className="shrink-0 w-5 flex items-center justify-center rounded-md text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-grab active:cursor-grabbing touch-none select-none"
      >
        <span aria-hidden className="font-mono text-xs leading-none">⋮⋮</span>
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <GroupBlocks group={group} />
      </div>
    </div>
  );
}

/** Inner block list for a group. A single-block group renders just
 *  the one SessionBlock filling the row (which already has the
 *  group-level min-height from the parent). A paired group renders
 *  both blocks stacked, each row sized by its own plannedSeconds
 *  so the within-group proportions match a session-wide single
 *  block of the same total duration. */
function GroupBlocks({ group }: { group: BlockGroup }) {
  if (group.items.length === 1) {
    return <SessionBlock block={group.items[0]} />;
  }
  return (
    <>
      {group.items.map(b => {
        const sec = Math.max(1, b.plannedSeconds);
        return (
          <div
            key={b.id}
            // Each block in a paired group enforces the same per-
            // block floor as a standalone group so a 3-min chord-
            // quiz doesn't shrink so far inside a 45-min spotlight
            // pair that its label clips.
            style={{
              flexGrow: sec,
              flexShrink: sec,
              flexBasis: 0,
              minHeight: `${MIN_BLOCK_PX}px`,
            }}
            className="flex flex-col"
          >
            <SessionBlock block={b} />
          </div>
        );
      })}
    </>
  );
}

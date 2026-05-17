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
 * order. Repertoire warm-ups (chord-quiz, scale-prep) chain forward
 * to the next song-practice anchor and drag as one locked unit so
 * the warm-ups can't be stranded from the song they prep. S&P
 * warm-ups (scales) are independent units. The flat block order
 * produced by the reorder is passed back via `onReorder`;
 * SessionStack stays stateless.
 */
import { Fragment, useMemo, type CSSProperties } from 'react';
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
 *  the proportions read compressed (the small block holds at this
 *  floor instead of, say, 18 px), but content NEVER gets clipped
 *  — a 3-min chord-quiz still shows its name + duration legibly
 *  even with the longer 2-line activity descriptions that S&P
 *  drill labels can produce. Picked over the prior container-level
 *  floor (which starved short blocks via flex-grow distribution).
 *  Tuned alongside SessionBlock's compact padding/font sizes — at
 *  88 px a 2-line description still fits with breathing room. */
const MIN_BLOCK_PX = 88;

/** Inline prompt slot — used by ProposalCard's block-delete flow to
 *  surface a redistribution picker in place of the just-deleted block.
 *  The stack renders the prompt as a stand-alone row between groups,
 *  outside the proportional-flex sizing math, so its presence doesn't
 *  resize the surviving blocks. */
export interface InlinePrompt {
  /** Stable id for React key. */
  id: string;
  /** Id of the group (= first block's id) the prompt should appear
   *  ABOVE. `null` → render after the last group. If the matching
   *  group is no longer in the list (e.g. it got deleted later), the
   *  prompt falls back to end-of-list rendering. */
  anchorGroupId: string | null;
  /** Rendered into a non-flex row. The caller supplies the full inner
   *  markup; the stack only owns the row container. */
  render: () => React.ReactNode;
}

interface Props {
  blocks: ReadonlyArray<ProposalBlock>;
  /** Drag-to-reorder hook. When supplied, the stack becomes
   *  sortable and emits the reordered list on drop. Repertoire
   *  warm-ups chain to their song anchor and move as one — the
   *  user can't separate a chord-quiz or scale-prep from the
   *  song they set up. */
  onReorder?: (next: ProposalBlock[]) => void;
  /** When supplied, non-warm-up blocks render a × delete button.
   *  Invoked with the block's id; the caller owns the list mutation
   *  and the redistribution prompt that replaces the row. */
  onDelete?: (blockId: string) => void;
  /** When supplied, non-warm-up blocks render a ⇄ swap button next
   *  to ×. Invoked with the block's id; the caller opens the swap
   *  picker as an inlinePrompt anchored to this block. */
  onSwap?: (blockId: string) => void;
  /** Inline prompts to render between groups. See InlinePrompt. */
  inlinePrompts?: ReadonlyArray<InlinePrompt>;
}

/** A drag unit. Single-block groups contain one item; paired
 *  groups contain a warm-up followed by its practice block. */
export interface BlockGroup {
  /** Stable id for SortableContext — uses the first item's id. */
  id: string;
  items: ProposalBlock[];
}

/** Group blocks into draggable units. Rules:
 *
 *   · S&P warm-up (scales) → own independent unit. The scales
 *     segment is itself a self-contained warm-up, not paired with
 *     the chord-shape or VL block that happens to follow it.
 *
 *   · Repertoire warm-up (chord-quiz, scale-prep) → chain forward
 *     to the next song-practice anchor. The full chain (one or
 *     more warm-ups + the song block) drags as a single locked
 *     unit so the warm-ups can't be stranded from the song they
 *     prep. Falls back to pairing with the immediately next block
 *     when no song anchor follows.
 *
 *   · All other blocks → own independent unit. */
export function groupBlocks(blocks: ReadonlyArray<ProposalBlock>): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const isRepWarmup = b.moduleRef === 'repertoire' && !!b.isWarmup;

    if (isRepWarmup) {
      // Chain forward until the next isSongPractice anchor.
      let anchorIdx = -1;
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[j].isSongPractice) {
          anchorIdx = j;
          break;
        }
      }
      if (anchorIdx >= 0) {
        groups.push({
          id: b.id,
          items: blocks.slice(i, anchorIdx + 1) as ProposalBlock[],
        });
        i = anchorIdx + 1;
      } else if (i + 1 < blocks.length) {
        // No song anchor in the rest of the list — pair with the
        // immediately next block so the warm-up isn't orphaned.
        groups.push({ id: b.id, items: [b, blocks[i + 1]] });
        i += 2;
      } else {
        // End of list with no follow-up — emit alone.
        groups.push({ id: b.id, items: [b] });
        i += 1;
      }
    } else {
      // S&P warm-up, song practice, or any non-warm-up block: own unit.
      groups.push({ id: b.id, items: [b] });
      i += 1;
    }
  }
  return groups;
}

function sumSeconds(items: ReadonlyArray<ProposalBlock>): number {
  return items.reduce((s, b) => s + Math.max(1, b.plannedSeconds), 0);
}

export default function SessionStack({ blocks, onReorder, onDelete, onSwap, inlinePrompts }: Props) {
  const groups = useMemo(() => groupBlocks(blocks), [blocks]);
  // Group prompts by their anchor for O(1) lookup during render.
  // End-of-list (anchor null OR anchor no longer in groups) bucket
  // renders after the final group so stranded prompts don't vanish.
  const groupIdSet = useMemo(() => new Set(groups.map(g => g.id)), [groups]);
  const promptsByAnchor = useMemo(() => {
    const map = new Map<string, InlinePrompt[]>();
    const tail: InlinePrompt[] = [];
    for (const p of inlinePrompts ?? []) {
      if (p.anchorGroupId !== null && groupIdSet.has(p.anchorGroupId)) {
        const list = map.get(p.anchorGroupId) ?? [];
        list.push(p);
        map.set(p.anchorGroupId, list);
      } else {
        tail.push(p);
      }
    }
    return { byAnchor: map, tail };
  }, [inlinePrompts, groupIdSet]);

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

  const renderPromptRow = (p: InlinePrompt) => (
    <div
      key={`prompt-${p.id}`}
      className="w-full min-w-0"
      // Non-flex row: takes its own intrinsic height, doesn't
      // participate in the proportional sizing math that drives the
      // surviving blocks.
      style={{ flex: '0 0 auto' }}
    >
      {p.render()}
    </div>
  );

  const stackInner = (
    <div
      className="w-full min-w-0 overflow-hidden flex flex-col gap-1.5 p-2 sm:p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
      style={{ minHeight: `${minTotalPx}px` }}
    >
      {groups.map(group => {
        const promptsHere = promptsByAnchor.byAnchor.get(group.id) ?? [];
        return (
          <Fragment key={group.id}>
            {promptsHere.map(renderPromptRow)}
            {onReorder
              ? <SortableGroupRow group={group} onDelete={onDelete} onSwap={onSwap} />
              : <StaticGroupRow group={group} onDelete={onDelete} onSwap={onSwap} />}
          </Fragment>
        );
      })}
      {promptsByAnchor.tail.map(renderPromptRow)}
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
function StaticGroupRow({
  group,
  onDelete,
  onSwap,
}: {
  group: BlockGroup;
  onDelete?: (blockId: string) => void;
  onSwap?: (blockId: string) => void;
}) {
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
    <div style={style} className="flex flex-col gap-1.5">
      <GroupBlocks group={group} onDelete={onDelete} onSwap={onSwap} />
    </div>
  );
}

/** Sortable group — drag handle on the left, blocks on the right.
 *  Height is proportional to the sum of contained block seconds,
 *  bounded below by (#items × MIN_BLOCK_PX). */
function SortableGroupRow({
  group,
  onDelete,
  onSwap,
}: {
  group: BlockGroup;
  onDelete?: (blockId: string) => void;
  onSwap?: (blockId: string) => void;
}) {
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
    ? `drag to reorder ${group.items[group.items.length - 1].moduleLabel} group`
    : `drag to reorder ${group.items[0].moduleLabel} block`;
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1.5">
      <button
        type="button"
        aria-label={ariaLabel}
        {...attributes}
        {...listeners}
        className="shrink-0 w-5 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-grab active:cursor-grabbing touch-none select-none"
      >
        <span aria-hidden className="font-mono text-xs leading-none">⋮⋮</span>
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <GroupBlocks group={group} onDelete={onDelete} onSwap={onSwap} />
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
function GroupBlocks({
  group,
  onDelete,
  onSwap,
}: {
  group: BlockGroup;
  onDelete?: (blockId: string) => void;
  onSwap?: (blockId: string) => void;
}) {
  if (group.items.length === 1) {
    return <SessionBlock block={group.items[0]} onDelete={onDelete} onSwap={onSwap} />;
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
            <SessionBlock block={b} onDelete={onDelete} onSwap={onSwap} />
          </div>
        );
      })}
    </>
  );
}

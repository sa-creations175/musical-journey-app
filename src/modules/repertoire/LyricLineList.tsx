import { useState } from 'react';
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { SongLyricLine } from '../../lib/db';
import LyricListRow from './LyricListRow';

/**
 * The song's lyric lines as ONE FLAT LIST — every line in song order,
 * headers inline where they sit, placed ones dimmed rather than hidden.
 *
 * SHARED by the lyrics drawer and the per-section tray. They show the
 * same lines — the tray was never section-scoped — so two views of one
 * list had no reason to be two components, and being two is what let
 * them drift into different shapes:
 *
 *   · an `unplaced lyrics (0)` wrapper you had to expand to see
 *     anything, labelled with the count of the thing you were least
 *     interested in
 *   · placed lines nested TWO levels down behind their own sub-toggle,
 *     when they are what you actually want to look at
 *   · headers floated to the top, detached from the lines they head,
 *     because the tray grouped by placement state instead of keeping
 *     song order
 *
 * None of that was designed; it accumulated. One flat list in song
 * order has no room for it.
 *
 * IT OWNS ITS DRAG BUT NOT ITS SCROLL. The DndContext is here because
 * reordering is this list's own behaviour and nothing outside needs to
 * know about it. The scroll container and any height cap belong to the
 * caller — the drawer caps at half a viewport, a page section does
 * not — so nothing here assumes it is inside a panel.
 *
 * A CALLER THAT CANNOT REORDER gets no drag handles: `onReorder` is
 * what makes rows draggable, so a read-only mounting is a prop away.
 */
export default function LyricLineList({
  lines,
  onArmLine,
  onArmWord,
  onSetLineKind,
  onDuplicateLine,
  onLineDelete,
  onLineUnplace,
  onReorder,
  emptyLabel = 'no lyrics yet.',
  dimPlaced = true,
}: {
  lines: SongLyricLine[];
  onArmLine?: (lineId: string) => void;
  onArmWord?: (syllableId: string) => void;
  onSetLineKind?: (lineId: string, kind: 'lyric' | 'header') => void | Promise<void>;
  onDuplicateLine?: (lineId: string) => void | Promise<void>;
  onLineDelete?: (lineId: string) => void;
  onLineUnplace?: (lineId: string) => void | Promise<void>;
  /** Move one row to another row's position. Headers included; nothing
   *  is carried along with them. Absent means the list is not
   *  reorderable and no handles render. */
  onReorder?: (fromId: string, toId: string) => void | Promise<void>;
  emptyLabel?: string;
  dimPlaced?: boolean;
}) {
  const [menuLineId, setMenuLineId] = useState<string | null>(null);
  // Which row is PICKING a word. List UI state, deliberately not an
  // arming kind: pick mode does not change what a beat-cell tap does.
  const [pickLineId, setPickLineId] = useState<string | null>(null);

  // 5px activation distance so a TAP still arms the line — rows are
  // tappable and draggable at once. Keyboard sensor so space picks up,
  // arrows move, space drops.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    void onReorder(String(active.id), String(over.id));
  };

  if (lines.length === 0) {
    return (
      <p className="text-[11px] text-neutral-500 italic py-2">{emptyLabel}</p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={lines.map(l => l.id)}
        strategy={verticalListSortingStrategy}
      >
        {lines.map(line => (
          <SortableLyricRow
            key={line.id}
            line={line}
            draggable={Boolean(onReorder)}
            dimPlaced={dimPlaced}
            onArm={onArmLine}
            onSetLineKind={onSetLineKind}
            onDuplicate={onDuplicateLine}
            onArmWord={onArmWord}
            picking={pickLineId === line.id}
            onPickingChange={pick => setPickLineId(pick ? line.id : null)}
            menuOpen={menuLineId === line.id}
            onMenuOpenChange={openNow => setMenuLineId(openNow ? line.id : null)}
            onDelete={onLineDelete}
            onUnplace={onLineUnplace}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

/**
 * One row, made sortable.
 *
 * HEADERS ARE DRAGGABLE, unlike in the old per-section tray which
 * withheld the handle from them. A header typed into the paste box
 * lands at the bottom of the list, and without this there is no way to
 * move it to the section it names.
 */
function SortableLyricRow({
  line,
  draggable,
  ...rest
}: {
  line: SongLyricLine;
  draggable: boolean;
} & Omit<Parameters<typeof LyricListRow>[0], 'line' | 'drag'>) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: line.id,
  });
  return (
    <LyricListRow
      {...rest}
      line={line}
      drag={
        draggable
          ? {
              setNodeRef,
              attributes: attributes as unknown as Record<string, unknown>,
              listeners: listeners as unknown as Record<string, unknown>,
              isDragging,
              handle: (
                <span
                  className="text-neutral-500 dark:text-neutral-400 mr-1"
                  aria-hidden
                >
                  ≡
                </span>
              ),
            }
          : undefined
      }
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Beat, ChordFunction, Phrase } from '../../lib/db';
import {
  applySyllableSplit,
  breakJoinBefore,
  concatGroupText,
  insertBeatAt,
  isInstrumentalPhrase,
  normalizePhrase,
  removeBeat,
  setChordOnBeat,
  syllableGroupAt,
} from './beatsModel';
import {
  chordToDisplay,
  isEmpty as chordIsEmpty,
  parseChordFunction,
  renderRoman,
  type NotationMode,
} from './chordFunction';
import { useToast } from '../../components/Toaster';
import { useIsMobile } from '../../lib/useIsMobile';
import SyllableSplitModal from './SyllableSplitModal';
import ChordEditBottomSheet from './ChordEditBottomSheet';
import ChordGlyph from './chordGlyph';

interface Props {
  phrase: Phrase;
  activeArrangementId: string;
  /** Additional arrangements whose chord rows should render above the
   *  beats in read-only compare mode. */
  compareArrangementIds?: string[];
  /** arrangementId → display name, for the compare rows. */
  arrangementName: (id: string) => string;
  /** App-wide notation mode (numbers / roman / stacked / concrete). */
  notationMode: NotationMode;
  /** Section's current key. Needed for concrete-chord display and for
   *  parsing user-entered concrete chord names. */
  sectionKey?: string;
  /** Called whenever the phrase's beats or chord placements change.
   *  Caller commits to DB. */
  onChange: (next: Phrase) => Promise<void>;
  /** Flash animation when this phrase is just created / just moved. */
  highlighted?: boolean;
  /** When `highlighted` is true, which beat to auto-focus (by id). */
  autofocusBeatId?: string;
  /** Optional: switch the whole phrase line into the parent's
   *  "edit as text" mode. Surfaced by the mobile bottom sheet as
   *  the "Edit line" action so a user mid-chord-entry can pivot to
   *  rewriting the lyrics without leaving the line. */
  onEditAsText?: () => void;
}

/**
 * Beat-based phrase editor. Renders three conceptual rows:
 *   1. (Optional) comparison chord rows — one per extra arrangement.
 *   2. Active chord row — editable chord slots above each beat.
 *   3. Beat row — word text for word beats, a small · for blank beats,
 *      with tiny "+" affordances between beats to insert blank beats.
 *
 * Chord slots use a pattern that avoids the cursor-at-position-0 bug:
 * local draft state is only re-synced when the beat id or arrangement
 * id changes (i.e. a different slot is being rendered), NEVER on
 * value changes while the user is typing. Click placement, Tab
 * navigation, and normal text editing all behave as users expect.
 */
export default function PhraseLineEditor({
  phrase,
  activeArrangementId,
  compareArrangementIds = [],
  arrangementName,
  notationMode,
  sectionKey,
  onChange,
  highlighted,
  autofocusBeatId,
  onEditAsText,
}: Props) {
  const normalised = normalizePhrase(phrase);
  const beats = normalised.beats;
  const activePlacements = normalised.chordsByArrangement[activeArrangementId] ?? {};
  const { toast } = useToast();
  const isMobile = useIsMobile();
  // Beat id whose syllable group is being edited in the split modal.
  const [splitTargetBeatId, setSplitTargetBeatId] = useState<string | null>(null);
  // Beat id currently open in the mobile chord-edit bottom sheet.
  // Mobile replaces the inline editing UX with tap → sheet; this
  // state stays null on desktop.
  const [mobileEditBeatId, setMobileEditBeatId] = useState<string | null>(null);

  // --- Mutation helpers ------------------------------------------

  const insertBlankAt = async (index: number): Promise<Beat> => {
    const { beats: afterInsert, inserted } = insertBeatAt(beats, index, 'blank');
    // If the insert lands in the middle of a syllable group, break the
    // `joinToNext` chain at that point so the blank doesn't render
    // mid-word (e.g. "A-[blank]-maz-ing").
    const finalBeats = breakJoinBefore(afterInsert, index);
    await onChange({ ...normalised, beats: finalBeats });
    return inserted;
  };

  const applySplit = async (
    groupStartIndex: number,
    groupLength: number,
    text: string,
    splitIndices: number[],
  ) => {
    const oldGroupBeats = beats.slice(groupStartIndex, groupStartIndex + groupLength);
    const { beats: nextBeats, inserted } = applySyllableSplit(
      beats,
      groupStartIndex,
      groupLength,
      text,
      splitIndices,
    );
    // The new syllable beats have fresh ids, so every chord placement
    // on the old group beats would be orphaned. Carry the first old
    // beat's chord onto the first new syllable (downbeat preserves its
    // chord); drop the rest rather than guess.
    const firstOldId = oldGroupBeats[0]?.id;
    const firstNewId = inserted[0]?.id;
    const nextChords: Record<string, Record<string, ChordFunction>> = {};
    for (const [arrId, placements] of Object.entries(normalised.chordsByArrangement)) {
      const copy: Record<string, ChordFunction> = { ...placements };
      for (const b of oldGroupBeats) delete copy[b.id];
      if (firstOldId && firstNewId && placements[firstOldId]) {
        copy[firstNewId] = placements[firstOldId];
      }
      nextChords[arrId] = copy;
    }
    await onChange({ ...normalised, beats: nextBeats, chordsByArrangement: nextChords });
  };

  const deleteBeat = async (beatId: string) => {
    const beat = beats.find(b => b.id === beatId);
    if (!beat) return;
    const snapshotBeats = beats;
    const snapshotChords = normalised.chordsByArrangement;
    const { beats: nextBeats, chordsByArrangement: nextChords } = removeBeat(
      beats,
      normalised.chordsByArrangement,
      beatId,
    );
    await onChange({ ...normalised, beats: nextBeats, chordsByArrangement: nextChords });
    toast({
      message: beat.type === 'word' && beat.text
        ? `Beat deleted: "${beat.text}"`
        : 'Beat deleted.',
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => {
          await onChange({
            ...normalised,
            beats: snapshotBeats,
            chordsByArrangement: snapshotChords,
          });
        },
      },
    });
  };

  const commitChord = async (beatId: string, rawInput: string) => {
    // Empty input clears the slot. Anything else parses into a
    // ChordFunction; unparseable inputs are preserved with
    // `unparsed: true` so the user doesn't lose their typing.
    const trimmed = rawInput.trim();
    if (trimmed === '') {
      const cleared = setChordOnBeat(
        normalised.chordsByArrangement,
        activeArrangementId,
        beatId,
        null,
      );
      await onChange({ ...normalised, chordsByArrangement: cleared });
      return;
    }
    const parsed = parseChordFunction(trimmed, sectionKey);
    if (parsed) {
      const next = setChordOnBeat(
        normalised.chordsByArrangement,
        activeArrangementId,
        beatId,
        parsed,
      );
      await onChange({ ...normalised, chordsByArrangement: next });
    }
  };

  const updateWordText = async (beatId: string, text: string) => {
    const nextBeats = beats.map(b => b.id === beatId ? { ...b, text } : b);
    await onChange({ ...normalised, beats: nextBeats });
  };

  // Move a chord placement from one beat to another within the
  // active arrangement. Target overwrites — if the user drops onto a
  // beat that already holds a chord, the dropped chord replaces it.
  // Compare arrangements aren't touched; drag-to-move only operates
  // on the editable row.
  const moveChord = async (sourceBeatId: string, targetBeatId: string) => {
    if (sourceBeatId === targetBeatId) return;
    const placements = normalised.chordsByArrangement[activeArrangementId] ?? {};
    const chord = placements[sourceBeatId];
    if (!chord) return;
    const next = { ...placements };
    delete next[sourceBeatId];
    next[targetBeatId] = chord;
    await onChange({
      ...normalised,
      chordsByArrangement: {
        ...normalised.chordsByArrangement,
        [activeArrangementId]: next,
      },
    });
  };

  // --- Render -----------------------------------------------------

  const instrumental = isInstrumentalPhrase(normalised);
  const showInstrumentalLabel = instrumental && beats.length > 0;

  return (
    <div
      id={`phrase-${phrase.id}`}
      className={`rounded-md px-1 py-1 -mx-1 ${highlighted ? 'repertoire-flash' : ''}`}
    >
      {/* Compare arrangements: stacked chord rows above the active
          one. Read-only; label on the left identifies each. */}
      {compareArrangementIds.map(arrId => {
        const placements = normalised.chordsByArrangement[arrId] ?? {};
        return (
          <ChordRow
            key={arrId}
            label={arrangementName(arrId)}
            beats={beats}
            placements={placements}
            notationMode={notationMode}
            sectionKey={sectionKey}
          />
        );
      })}

      {/* Active chord row + beat row, fused into one flex-wrap
          container of column-pairs. Each beat owns a single
          `inline-flex flex-col` cell that stacks its chord slot
          above its word cell — when the line is long enough to
          wrap, chord + word always wrap together, so the chord
          slot for every word stays directly above its word
          regardless of line length.

          On phone-class viewports the inline-editing UX is
          replaced with a read-only-but-tappable row plus a
          bottom-sheet editor (mounted below). The screen is too
          narrow to host typing inside every slot at once. */}
      {isMobile ? (
        <MobileBeatRow
          beats={beats}
          placements={activePlacements}
          notationMode={notationMode}
          sectionKey={sectionKey}
          activeBeatId={mobileEditBeatId}
          label={compareArrangementIds.length > 0 ? arrangementName(activeArrangementId) : undefined}
          onTapBeat={beatId => setMobileEditBeatId(beatId)}
          onInsertBlank={insertBlankAt}
        />
      ) : (
        <ActiveBeatRow
          beats={beats}
          placements={activePlacements}
          notationMode={notationMode}
          sectionKey={sectionKey}
          autofocusBeatId={autofocusBeatId}
          label={compareArrangementIds.length > 0 ? arrangementName(activeArrangementId) : undefined}
          onCommitChord={commitChord}
          onInsertBlank={insertBlankAt}
          onDeleteBeat={deleteBeat}
          onUpdateText={updateWordText}
          onSplitBeat={beatId => setSplitTargetBeatId(beatId)}
          onMoveChord={moveChord}
        />
      )}

      {isMobile && mobileEditBeatId && (
        <ChordEditBottomSheet
          open={true}
          beats={beats}
          placements={activePlacements}
          activeBeatId={mobileEditBeatId}
          notationMode={notationMode}
          sectionKey={sectionKey}
          onActiveBeatChange={setMobileEditBeatId}
          onCommit={commitChord}
          onDeleteBeat={deleteBeat}
          onEditAsText={onEditAsText}
          onClose={() => setMobileEditBeatId(null)}
        />
      )}

      {splitTargetBeatId && (() => {
        const group = syllableGroupAt(beats, splitTargetBeatId);
        if (!group) return null;
        const text = concatGroupText(group.beats);
        // initialSplits: cumulative char positions where each beat
        // after the first begins within the concatenated text.
        const initial: number[] = [];
        let runningPos = 0;
        for (let i = 0; i < group.beats.length - 1; i++) {
          runningPos += (group.beats[i].text ?? '').length;
          initial.push(runningPos);
        }
        return (
          <SyllableSplitModal
            word={text}
            initialSplits={initial}
            onCancel={() => setSplitTargetBeatId(null)}
            onApply={async splits => {
              await applySplit(group.startIndex, group.beats.length, text, splits);
              setSplitTargetBeatId(null);
            }}
          />
        );
      })()}

      {showInstrumentalLabel && (
        <div className="text-[11px] italic text-neutral-400 ml-2 mt-0.5">
          [Instrumental]
        </div>
      )}
      {beats.length === 0 && (
        <div className="flex items-center gap-2 pl-1 py-1">
          <InsertPoint
            onClick={async () => {
              const inserted = await insertBlankAt(0);
              // Flash the newly-inserted beat by re-rendering with
              // autofocusBeatId — caller passes this in via state.
              void inserted;
            }}
            label="add a beat"
          />
          <span className="text-xs text-neutral-400 italic">empty line — click "+" to add a beat</span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------

interface ChordRowProps {
  /** Label shown to the left (only used in compare mode). */
  label?: string;
  beats: Beat[];
  placements: Record<string, ChordFunction>;
  active?: boolean;
  notationMode: NotationMode;
  sectionKey?: string;
  autofocusBeatId?: string;
  onCommit?: (beatId: string, raw: string) => Promise<void>;
}

function ChordRow({
  label,
  beats,
  placements,
  active,
  notationMode,
  sectionKey,
  autofocusBeatId,
  onCommit,
}: ChordRowProps) {
  return (
    <div className="flex items-end flex-wrap">
      {label !== undefined && (
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium mr-2 min-w-[7rem] text-right shrink-0">
          {label}:
        </span>
      )}
      <div className="flex flex-wrap">
        <InsertSpacer />
        {beats.map(beat => (
          <span key={beat.id} className="inline-flex items-end">
            {active && onCommit ? (
              <ChordSlot
                beatId={beat.id}
                chord={placements[beat.id]}
                notationMode={notationMode}
                sectionKey={sectionKey}
                autofocus={autofocusBeatId === beat.id}
                onCommit={raw => onCommit(beat.id, raw)}
              />
            ) : (
              <ReadOnlyChordSlot
                chord={placements[beat.id]}
                notationMode={notationMode}
                sectionKey={sectionKey}
              />
            )}
            <InsertSpacer />
          </span>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

interface ActiveBeatRowProps {
  beats: Beat[];
  placements: Record<string, ChordFunction>;
  notationMode: NotationMode;
  sectionKey?: string;
  autofocusBeatId?: string;
  /** Arrangement label rendered to the left of the row in compare
   *  mode. Undefined when no compare rows exist (then no label is
   *  shown — same condition as the legacy ChordRow). */
  label?: string;
  onCommitChord: (beatId: string, raw: string) => Promise<void>;
  onInsertBlank: (index: number) => Promise<Beat>;
  onDeleteBeat: (beatId: string) => Promise<void>;
  onUpdateText: (beatId: string, text: string) => Promise<void>;
  onSplitBeat: (beatId: string) => void;
  /** Move a chord placement from one beat to another within the
   *  active arrangement. Wired into the chord-drag UX — the
   *  draggable handle on each filled chord slot fires this when the
   *  user drops onto another beat's column. */
  onMoveChord: (sourceBeatId: string, targetBeatId: string) => Promise<void>;
}

const DRAG_ID_CHORD_PREFIX = 'chord-';
const DRAG_ID_BEAT_PREFIX = 'beat-';

/**
 * Active chord row + beat row, combined into a single flex-wrap
 * row whose children are paired column-cells (chord slot stacked
 * above word cell). Replaces the prior pattern of two independent
 * flex-wrap rows that wrapped at different points and could put a
 * word on a wrapped second visual line without its chord slot.
 *
 * Insert affordances + syllable hyphens between beats are also
 * column-cells (with an empty top half) so wrapping happens to
 * whole columns — chord/beat alignment is preserved by construction.
 *
 * The row also hosts a DndContext that lets the user drag a chord
 * slot from one beat column to another. Drag handles only appear
 * on filled chord slots (no chord, nothing to move); pointer-sensor
 * has an 8px activation distance so accidental clicks don't fire.
 */
function ActiveBeatRow({
  beats,
  placements,
  notationMode,
  sectionKey,
  autofocusBeatId,
  label,
  onCommitChord,
  onInsertBlank,
  onDeleteBeat,
  onUpdateText,
  onSplitBeat,
  onMoveChord,
}: ActiveBeatRowProps) {
  // Pointer activation distance: 8px so accidental clicks on the
  // drag handle don't trigger a drag. Keyboard sensor intentionally
  // skipped — the chord-slot drag is a precision interaction; users
  // who can't drag can still re-type the chord into the target slot.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!active || !over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!activeId.startsWith(DRAG_ID_CHORD_PREFIX)) return;
    if (!overId.startsWith(DRAG_ID_BEAT_PREFIX)) return;
    const sourceBeatId = activeId.slice(DRAG_ID_CHORD_PREFIX.length);
    const targetBeatId = overId.slice(DRAG_ID_BEAT_PREFIX.length);
    void onMoveChord(sourceBeatId, targetBeatId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-end flex-wrap">
        {label !== undefined && (
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium mr-2 min-w-[7rem] text-right shrink-0 self-end mb-1">
            {label}:
          </span>
        )}
        <PairedInsertColumn onClick={() => onInsertBlank(0)} />
        {beats.map((beat, idx) => (
          <span key={beat.id} className="inline-flex items-end">
            <DroppableBeatColumn beatId={beat.id}>
              <DraggableChordSlot
                beatId={beat.id}
                hasChord={!!placements[beat.id] && !chordIsEmpty(placements[beat.id])}
              >
                <ChordSlot
                  beatId={beat.id}
                  chord={placements[beat.id]}
                  notationMode={notationMode}
                  sectionKey={sectionKey}
                  autofocus={autofocusBeatId === beat.id}
                  onCommit={raw => onCommitChord(beat.id, raw)}
                />
              </DraggableChordSlot>
              <BeatCell
                beat={beat}
                joinToNext={beat.joinToNext === true}
                onDelete={() => onDeleteBeat(beat.id)}
                onUpdateText={text => onUpdateText(beat.id, text)}
                onSplit={beat.type === 'word' ? () => onSplitBeat(beat.id) : undefined}
              />
            </DroppableBeatColumn>
            {beat.joinToNext ? (
              <PairedHyphenColumn />
            ) : (
              <PairedInsertColumn onClick={() => onInsertBlank(idx + 1)} />
            )}
          </span>
        ))}
      </div>
    </DndContext>
  );
}

// -------------------------------------------------------------------

interface MobileBeatRowProps {
  beats: Beat[];
  placements: Record<string, ChordFunction>;
  notationMode: NotationMode;
  sectionKey?: string;
  /** Beat currently open in the bottom sheet — gets a fluent ring so
   *  the user can see which one their next keystroke will land on. */
  activeBeatId: string | null;
  label?: string;
  onTapBeat: (beatId: string) => void;
  onInsertBlank: (index: number) => Promise<Beat>;
}

/**
 * Phone-class beat row. Renders the same paired-column structure as
 * `ActiveBeatRow` (chord glyph on top, word below, wrapping happens
 * to whole columns) but the columns are read-only buttons that open
 * `ChordEditBottomSheet`. No inline inputs, no drag-to-move chord
 * handle — both surfaces are too small to operate reliably on a
 * thumb.
 *
 * Insert "+" affordances between beats stay reachable (single-tap
 * targets) so the user can still add blank beats without entering
 * the bottom sheet.
 */
function MobileBeatRow({
  beats,
  placements,
  notationMode,
  sectionKey,
  activeBeatId,
  label,
  onTapBeat,
  onInsertBlank,
}: MobileBeatRowProps) {
  return (
    <div className="flex items-end flex-wrap gap-y-1">
      {label !== undefined && (
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium mr-2 min-w-[7rem] text-right shrink-0 self-end mb-1">
          {label}:
        </span>
      )}
      <PairedInsertColumn onClick={() => onInsertBlank(0)} />
      {beats.map((beat, idx) => (
        <span key={beat.id} className="inline-flex items-end">
          <MobileBeatColumn
            beat={beat}
            chord={placements[beat.id]}
            notationMode={notationMode}
            sectionKey={sectionKey}
            isActive={activeBeatId === beat.id}
            onTap={() => onTapBeat(beat.id)}
          />
          {beat.joinToNext ? (
            <PairedHyphenColumn />
          ) : (
            <PairedInsertColumn onClick={() => onInsertBlank(idx + 1)} />
          )}
        </span>
      ))}
    </div>
  );
}

function MobileBeatColumn({
  beat,
  chord,
  notationMode,
  sectionKey,
  isActive,
  onTap,
}: {
  beat: Beat;
  chord: ChordFunction | undefined;
  notationMode: NotationMode;
  sectionKey?: string;
  isActive: boolean;
  onTap: () => void;
}) {
  const display = chordToDisplay(chord, notationMode, sectionKey);
  const filled = display !== '';
  const wordText = beat.type === 'blank' ? '·' : (beat.text || '·');
  return (
    <button
      type="button"
      onClick={onTap}
      className={`inline-flex flex-col items-start rounded px-1 py-0.5 transition-colors active:bg-fluent/15 ${
        isActive ? 'bg-fluent/10 ring-1 ring-fluent/40' : 'hover:bg-fluent/5'
      }`}
      title="tap to edit chord"
    >
      <span
        className={`block text-sm font-mono leading-tight tracking-tight ${
          filled ? 'text-fluent' : 'text-neutral-300 dark:text-neutral-700'
        }`}
        style={{ minWidth: '1.5rem', textAlign: 'left' }}
      >
        {filled ? <ChordGlyph text={display} /> : '·'}
      </span>
      <span
        className={`block text-sm font-mono leading-tight tracking-tight ${
          beat.type === 'blank' || (beat.text ?? '').trim() === ''
            ? 'text-neutral-300 dark:text-neutral-700'
            : 'text-neutral-800 dark:text-neutral-100'
        }`}
      >
        {wordText}
      </span>
    </button>
  );
}

// -------------------------------------------------------------------

/** Beat column that accepts a chord drop. The whole chord+beat
 *  stack is a single droppable so the user can drop on any part of
 *  the column. Active highlight is subtle — a soft ring — so it
 *  doesn't compete with the live editing affordances. */
function DroppableBeatColumn({
  beatId,
  children,
}: {
  beatId: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${DRAG_ID_BEAT_PREFIX}${beatId}`,
  });
  return (
    <span
      ref={setNodeRef}
      className={`inline-flex flex-col items-start rounded transition-colors ${
        isOver ? 'bg-fluent/15 ring-1 ring-fluent/40' : ''
      }`}
    >
      {children}
    </span>
  );
}

/** Wraps the chord slot with a small drag handle (visible only when
 *  there's a chord to move). Typing in the chord input still works
 *  normally — drag listeners attach to the handle, not the input. */
function DraggableChordSlot({
  beatId,
  hasChord,
  children,
}: {
  beatId: string;
  hasChord: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${DRAG_ID_CHORD_PREFIX}${beatId}`,
    disabled: !hasChord,
  });
  return (
    <span className={`relative inline-flex flex-col items-center ${isDragging ? 'opacity-40' : ''}`}>
      {children}
      {hasChord && (
        <span
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          title="drag to move chord to another beat"
          aria-label="drag chord"
          className="absolute -top-2 right-0 text-[9px] text-neutral-300 hover:text-fluent cursor-grab active:cursor-grabbing select-none leading-none px-0.5"
        >
          ↔
        </span>
      )}
    </span>
  );
}

/** Inter-beat column: empty top half (aligned with the chord row)
 *  + a clickable `+` on the bottom half (aligned with the beat row).
 *  Wrapping happens to the whole column. */
function PairedInsertColumn({ onClick }: { onClick: () => void }) {
  return (
    <span className="inline-flex flex-col items-center">
      <InsertSpacer />
      <InsertPoint onClick={onClick} />
    </span>
  );
}

/** Inter-beat column for joined syllables: empty top half + a hyphen
 *  on the bottom half. Same width as PairedInsertColumn so columns
 *  align horizontally across the wrap container. */
function PairedHyphenColumn() {
  return (
    <span className="inline-flex flex-col items-center">
      <InsertSpacer />
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-3 h-5 text-sm text-neutral-400 select-none"
      >
        -
      </span>
    </span>
  );
}

function BeatCell({
  beat,
  joinToNext,
  onDelete,
  onUpdateText,
  onSplit,
}: {
  beat: Beat;
  joinToNext: boolean;
  onDelete: () => void;
  onUpdateText: (t: string) => void;
  onSplit?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(beat.text ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft only when the beat identity changes — NOT on external
  // text updates during the user's own typing session.
  useEffect(() => {
    setDraft(beat.text ?? '');
  }, [beat.id]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (beat.type === 'blank') {
    return (
      <span className="inline-flex items-center group relative min-h-[1.5rem] px-0.5">
        <span aria-hidden className="text-neutral-300 dark:text-neutral-700 text-sm select-none">·</span>
        <button
          onClick={onDelete}
          title="remove blank beat"
          className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 text-[9px] text-neutral-400 hover:text-needswork bg-white dark:bg-neutral-900 rounded-full w-3 h-3 flex items-center justify-center"
        >
          ×
        </button>
      </span>
    );
  }

  // Word beat
  const hasText = (beat.text ?? '').trim() !== '';
  return (
    <span className="inline-flex items-center group relative">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim();
            if (next !== (beat.text ?? '')) onUpdateText(next);
            setEditing(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setDraft(beat.text ?? ''); setEditing(false); }
          }}
          className="bg-transparent border-0 border-b border-dashed border-fluent/50 focus:outline-none px-0.5 py-0 text-sm font-mono tracking-tight text-neutral-800 dark:text-neutral-100"
          style={{ width: `${Math.max(2, draft.length + 1)}ch` }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-mono tracking-tight text-neutral-800 dark:text-neutral-100 hover:bg-fluent/5 rounded px-0.5 cursor-text"
          title="click to edit word"
        >
          {beat.text || '·'}
        </button>
      )}
      {/* Split affordance — visible on hover. Hidden when the word is
          empty (nothing to split) or already editing (avoid jitter). */}
      {onSplit && hasText && !editing && (
        <button
          onClick={onSplit}
          title="split into syllables"
          aria-label="split into syllables"
          className="absolute -top-2 -right-1 opacity-0 group-hover:opacity-100 text-[9px] text-neutral-400 hover:text-fluent bg-white dark:bg-neutral-900 rounded px-1 leading-none py-0.5 border border-neutral-200 dark:border-neutral-700"
        >
          split
        </button>
      )}
      {/* Trailing breathing space — suppressed when joined to the
          next beat so the hyphen sits tight against the syllable. */}
      {!joinToNext && <span aria-hidden className="inline-block w-1" />}
    </span>
  );
}

// -------------------------------------------------------------------

interface ChordSlotProps {
  beatId: string;
  chord: ChordFunction | undefined;
  notationMode: NotationMode;
  sectionKey?: string;
  autofocus?: boolean;
  onCommit: (raw: string) => Promise<void>;
}

function ChordSlot({ beatId, chord, notationMode, sectionKey, autofocus, onCommit }: ChordSlotProps) {
  const display = chordToDisplay(chord, notationMode, sectionKey);
  const [draft, setDraft] = useState(display);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only resync the draft when the slot identity changes — i.e. a
  // different beat's chord is being shown, OR the notation mode
  // switched while this slot isn't being edited. Never on the user's
  // in-flight edit.
  useEffect(() => {
    if (!editing) setDraft(display);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatId, notationMode, sectionKey]);

  // `autofocus` arrives true when this slot's beat was just created
  // (e.g. "+ add phrase line"). Trigger editing mode so the input
  // mounts; the next effect focuses it on the same frame.
  useEffect(() => {
    if (autofocus) setEditing(true);
  }, [autofocus]);

  // When editing flips on, focus the input. Works for both the
  // autofocus path and the user-click path (clicking the display
  // button sets editing=true, then this effect surfaces the
  // keyboard caret).
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== display.trim()) {
      void onCommit(draft);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(display);
      setEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const filled = draft.trim() !== '';
  const unparsed = chord?.unparsed === true;
  const stackedRoman = notationMode === 'stacked' && chord && !chord.unparsed
    ? renderRoman(chord)
    : '';

  // `<input>` is a leaf element — it can't host mixed-style spans —
  // so slash-chord visual hierarchy only renders in the
  // not-editing state. While editing, the user sees plain text
  // matching what they typed; on blur, the styled display takes
  // over and the bass note pops as the dominant glyph.
  const colourClasses = unparsed
    ? 'text-developing border-developing/40'
    : filled
      ? 'text-fluent border-fluent/30'
      : 'text-neutral-400 border-neutral-300 dark:border-neutral-600';

  return (
    <span className="inline-flex flex-col items-center">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          placeholder="1"
          spellCheck={false}
          // `size={1}` caps iOS Safari's intrinsic-width hint so it
          // can't blow past the inline `width: Xch`. `appearance-none`
          // flattens iOS native input chrome (internal padding/border)
          // that would otherwise widen the box. `text-left` anchors
          // the chord glyph to the input's left edge — same edge as
          // the word below — so chord + word align by construction
          // instead of relying on the input's box being exactly the
          // right width.
          size={1}
          className={`bg-transparent appearance-none border-0 border-b border-dashed text-left px-0.5 py-0 text-sm font-mono tracking-tight focus:outline-none focus:border-fluent transition-colors placeholder:text-neutral-300 dark:placeholder:text-neutral-600 ${colourClasses}`}
          style={{ width: `${Math.max(2, draft.length + 1)}ch`, minWidth: '1.5rem' }}
          title={unparsed
            ? "couldn't parse — saved as raw text"
            : 'chord slot — numbers (4maj7), Roman (IVmaj7), or concrete (Fmaj7 — uses section key)'}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`bg-transparent appearance-none border-0 border-b border-dashed text-left px-0.5 py-0 text-sm font-mono tracking-tight cursor-text hover:border-fluent/60 transition-colors ${colourClasses}`}
          style={{ minWidth: '1.5rem' }}
          title={unparsed
            ? "couldn't parse — saved as raw text"
            : 'chord slot — click to edit'}
        >
          {filled
            ? <ChordGlyph text={display} />
            : <span className="text-neutral-300 dark:text-neutral-600">1</span>}
        </button>
      )}
      {stackedRoman && (
        <span
          className="text-[9px] font-mono text-neutral-400 -mt-0.5 leading-none"
          aria-hidden
        >
          {stackedRoman}
        </span>
      )}
    </span>
  );
}

interface ReadOnlyChordSlotProps {
  chord: ChordFunction | undefined;
  notationMode: NotationMode;
  sectionKey?: string;
}

function ReadOnlyChordSlot({ chord, notationMode, sectionKey }: ReadOnlyChordSlotProps) {
  const display = chordToDisplay(chord, notationMode, sectionKey);
  const empty = display === '';
  const stackedRoman = notationMode === 'stacked' && chord && !chord.unparsed
    ? renderRoman(chord)
    : '';
  return (
    <span className="inline-flex flex-col items-center">
      <span
        className={`inline-block text-left text-sm font-mono tracking-tight px-0.5 ${
          empty ? 'text-neutral-300 dark:text-neutral-700' : 'text-neutral-600 dark:text-neutral-300'
        }`}
        style={{ minWidth: '1.5rem' }}
      >
        {empty ? '·' : <ChordGlyph text={display} />}
      </span>
      {stackedRoman && (
        <span className="text-[9px] font-mono text-neutral-400 -mt-0.5 leading-none" aria-hidden>
          {stackedRoman}
        </span>
      )}
    </span>
  );
}

// -------------------------------------------------------------------

/** Tiny "+" between two beats. Subtle by default, brighter on hover. */
function InsertPoint({ onClick, label = 'insert a beat here' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center w-3 h-5 text-xs text-neutral-300 hover:text-fluent hover:bg-fluent/10 rounded transition-colors"
    >
      +
    </button>
  );
}

/** Matches the width of an InsertPoint so chord slots above align with
 *  the beats below even though the chord row doesn't have +. */
function InsertSpacer() {
  return <span aria-hidden className="inline-block w-3" />;
}

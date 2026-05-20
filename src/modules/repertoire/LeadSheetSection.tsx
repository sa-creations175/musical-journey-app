import { useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type {
  Arrangement,
  ChordFunction,
  ChordPlacement,
  LyricLine,
  Phrase,
  Song,
  SongSection,
} from '../../lib/db';
import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_BADGE_CLASS,
  STAGE_LABEL,
} from './stage';
import { parseChord } from './chordParser';
import {
  detectProgressions,
  type ProgressionMatch,
} from '../../lib/progressionDetection';
import { progressionById } from '../ear-training/chord-progressions/catalog';
import {
  setAddedFromRepertoire,
  setCustomLabel as setEtCustomLabel,
} from '../ear-training/etCuration';
import { useAddedFromRepertoireSet } from '../ear-training/useEtCurations';
import { useToast } from '../../components/Toaster';
import {
  chordSequenceForArrangement,
  normalizeArrangements,
  normalizePhrase,
  uid,
} from './beatsModel';
import { toRomanToken } from './chordFunction';
import ArrangementBar from './ArrangementBar';
import BarGridView from './BarGridView';
import LyricStagingArea from './LyricStagingArea';
import {
  addChordPlacement,
  cascadeChordPlacements,
  deriveBarGrid,
  effectiveTimeSignature,
  isLegacyPlacementId,
  materializeChordPlacements,
  moveChordPlacement,
  parseTimeSignature,
  removeChordPlacement,
  reorderBar,
  resolveLegacyPlacementId,
  swapChordPlacements,
  updateChordPlacement,
} from './barGrid';
import {
  applyEndMarkerDrag,
  applyStartMarkerDrag,
  applyWordNudge,
  distributedWordPositions,
  joinWords,
  splitWord,
} from './lyricLine';
interface Props {
  song: Song;
  section: SongSection;
  canMoveUp: boolean;
  canMoveDown: boolean;
  highlighted?: boolean;
  onChange: (patch: Partial<SongSection>) => Promise<void>;
  /** Full-record replace used by the bar-grid undo path. Required
   *  because `Table.update(key, patch)` strips `undefined` values, so
   *  restoring a snapshot with previously-undefined fields wouldn't
   *  take effect. `put` replaces the whole row. */
  onReplace?: (next: SongSection) => Promise<void>;
  onMoveUp?: () => Promise<void>;
  onMoveDown?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function LeadSheetSection({
  song,
  section,
  canMoveUp,
  canMoveDown,
  highlighted,
  onChange,
  onReplace,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Props) {
  const stage = section.stage ?? song.stage ?? DEFAULT_STAGE;
  const { toast } = useToast();

  const [showNotes, setShowNotes] = useState(Boolean(section.notes));
  const [notesDraft, setNotesDraft] = useState(section.notes ?? '');
  const [nameDraft, setNameDraft] = useState(section.name);
  const [editingName, setEditingName] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Detected-progressions → ET pipeline (Lead Sheet Redesign step 9).
  // `addedFromRepertoireSet` flags catalog progression ids the user
  // has promoted via the chip's + affordance. Confirmation popover
  // state for the in-flight add.
  const addedFromRepertoireSet = useAddedFromRepertoireSet();
  const [addingProgressionId, setAddingProgressionId] = useState<string | null>(null);
  const [addLabelDraft, setAddLabelDraft] = useState('');

  // Re-sync drafts when a different section rotates in.
  useEffect(() => {
    setNotesDraft(section.notes ?? '');
    setNameDraft(section.name);
    setEditingName(false);
    setCompareIds([]);
  }, [section.id]);

  // --- sectionRef ------------------------------------------------
  // Closures captured by handlers can outlive their render (rapid-
  // fire clicks, async resolution gaps before dexie-react-hooks
  // pushes a new section). `sectionRef.current` always points at the
  // most recent section prop the component has seen, so handlers
  // read fresh state regardless of which closure they live in.
  const sectionRef = useRef(section);
  sectionRef.current = section;

  // --- Undo / Redo stacks ----------------------------------------
  // Snapshots are FULL `SongSection` records — restore goes through
  // `onReplace` (which uses `Table.put`, not `update`), so undefined
  // fields are persisted correctly. Each stack capped at 20 entries.
  //
  // Standard semantics:
  //   · commit pushes the prior state to undo; any new commit clears
  //     redo (you can't redo into a branched future).
  //   · undo pushes the current state to redo, restores from undo.
  //   · redo pushes the current state to undo, restores from redo.
  const UNDO_STACK_MAX = 20;
  const undoStackRef = useRef<SongSection[]>([]);
  const redoStackRef = useRef<SongSection[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    // Switching sections wipes BOTH stacks — undo/redo only apply to
    // the currently-rendered section.
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, [section.id]);

  const commit = async (patch: Partial<SongSection>) => {
    // Snapshot the full section BEFORE applying the patch. Reads from
    // sectionRef.current so the captured state is always up-to-date,
    // even if the closure here was created earlier.
    const snap: SongSection = { ...sectionRef.current };
    const stack = undoStackRef.current;
    stack.push(snap);
    while (stack.length > UNDO_STACK_MAX) stack.shift();
    // Any new edit invalidates the redo stack — you can't redo into
    // a branched future.
    if (redoStackRef.current.length > 0) {
      redoStackRef.current = [];
      setCanRedo(false);
    }
    setCanUndo(true);
    // Dexie's `Table.update(key, patch)` strips `undefined` values, so
    // any commit that wants to CLEAR a field can't go through onChange.
    // Detect that case and route through `onReplace` (full-record put)
    // instead so the field actually goes back to undefined. The undo
    // restore already uses onReplace, so this keeps the round-trip
    // consistent.
    const hasUndefined = Object.values(patch).some(v => v === undefined);
    if (hasUndefined && onReplace) {
      const full: SongSection = { ...sectionRef.current, ...patch };
      await onReplace(full);
    } else {
      await onChange(patch);
    }
  };

  const handleUndo = async () => {
    const undo = undoStackRef.current;
    const snap = undo.pop();
    if (!snap) return;
    // Push the CURRENT state onto the redo stack before restoring.
    const redo = redoStackRef.current;
    redo.push({ ...sectionRef.current });
    while (redo.length > UNDO_STACK_MAX) redo.shift();
    setCanUndo(undo.length > 0);
    setCanRedo(true);
    if (onReplace) {
      await onReplace(snap);
    }
  };

  const handleRedo = async () => {
    const redo = redoStackRef.current;
    const snap = redo.pop();
    if (!snap) return;
    // Mirror of handleUndo: push current state onto undo before
    // restoring the redo snapshot.
    const undo = undoStackRef.current;
    undo.push({ ...sectionRef.current });
    while (undo.length > UNDO_STACK_MAX) undo.shift();
    setCanRedo(redo.length > 0);
    setCanUndo(true);
    if (onReplace) {
      await onReplace(snap);
    }
  };

  // --- Normalise arrangements + phrases at render time -----------
  const arrangements: Arrangement[] = useMemo(() => normalizeArrangements(section), [section]);
  const activeArrangementId = useMemo(() => {
    const storedActive = section.activeArrangementId;
    if (storedActive && arrangements.some(a => a.id === storedActive)) return storedActive;
    return arrangements[0].id;
  }, [section.activeArrangementId, arrangements]);

  const rawPhrases: Phrase[] = useMemo(() => {
    const list = section.phrases ?? [];
    // Seed: if the section has no phrases array at all but carries a
    // legacy `lyrics` blob, derive phrases per-line from that so the
    // render doesn't come up blank.
    if (list.length === 0 && (section.lyrics ?? '').trim() !== '') {
      return section.lyrics.split('\n').map(line => ({
        id: uid('phrase'),
        chords: '',
        lyrics: line,
      }));
    }
    return list;
  }, [section.phrases, section.lyrics]);

  const normalisedPhrases = useMemo(() => rawPhrases.map(normalizePhrase), [rawPhrases]);

  // --- Arrangement mutations -------------------------------------
  const saveArrangements = async (next: Arrangement[]) => {
    await commit({ arrangements: next });
  };
  const setActiveArrangementId = async (id: string) => {
    await commit({ activeArrangementId: id });
  };

  const updatePhraseInPlace = async (next: Phrase) => {
    const list = (section.phrases ?? rawPhrases).map(p =>
      p.id === next.id ? next : p,
    );
    await commit({ phrases: list });
  };

  // --- Lyric-line handlers (step 6) ------------------------------
  const lyricLines = useMemo(() => section.lyricLines ?? [], [section.lyricLines]);
  const timeSignature = effectiveTimeSignature(song, section);
  const { beatsPerBar } = parseTimeSignature(timeSignature);

  // Bar-grid chord ops (Option C). All chord interactions go through
  // bar-anchored ChordPlacement entries on section.chordPlacements.
  // For unmigrated sections (chordPlacements undefined), we materialize
  // on the first op and resolve any in-flight legacy placement id to
  // its post-migration counterpart before applying the change.
  const ensurePlacementsForOp = (
    placementId: string,
  ): { placements: ChordPlacement[]; realPlacementId: string } => {
    const sec = sectionRef.current;
    if (sec.chordPlacements !== undefined) {
      return { placements: sec.chordPlacements, realPlacementId: placementId };
    }
    const placements = materializeChordPlacements(sec, beatsPerBar);
    const real = isLegacyPlacementId(placementId)
      ? resolveLegacyPlacementId(placementId, activeArrangementId) ?? placementId
      : placementId;
    return { placements, realPlacementId: real };
  };

  // After a chord op changes which bars hold placements, the
  // `barLayout` array (when present) can fall out of sync — a bar
  // marked 'empty' might now hold a placement, or vice versa. This
  // reconciles the layout so deriveBarGridAnchored doesn't hide the
  // moved chord behind an 'empty' entry (or render a phantom 'chord'
  // entry for a bar that's now actually empty).
  //
  // Returns `undefined` when there's no layout to reconcile (in which
  // case deriveBarGridAnchored derives the bar count from the
  // placements' max barIndex + 1).
  const reconcileBarLayout = (
    layout: Array<'chord' | 'empty'> | undefined,
    placements: ChordPlacement[],
  ): Array<'chord' | 'empty'> | undefined => {
    if (!layout) return undefined;
    const occupied = new Set<number>();
    for (const p of placements) occupied.add(p.barIndex);
    let maxBar = -1;
    for (const p of placements) {
      if (p.barIndex > maxBar) maxBar = p.barIndex;
    }
    const next: Array<'chord' | 'empty'> = [];
    const total = Math.max(layout.length, maxBar + 1);
    for (let i = 0; i < total; i++) {
      const existing = layout[i];
      if (occupied.has(i)) next.push('chord');
      else if (existing === 'empty' || existing === 'chord') next.push('empty');
      else next.push('empty');
    }
    return next;
  };

  const handleChordBeatsChange = async (placementId: string, beats: number) => {
    const { placements, realPlacementId } = ensurePlacementsForOp(placementId);
    const clamped = Math.min(Math.max(1, Math.round(beats)), beatsPerBar);
    const updated = updateChordPlacement(placements, realPlacementId, { beats: clamped });
    // Expanding a chord can push following placements onto beats that
    // are now covered — deriveBarGridAnchored would mask them. Cascade
    // them forward in beat order so every chord stays visible.
    const target = updated.find(p => p.id === realPlacementId);
    const arrId = target?.arrangementId ?? activeArrangementId;
    const cascaded = cascadeChordPlacements(updated, arrId, beatsPerBar);
    const patch: Partial<SongSection> = { chordPlacements: cascaded };
    const reconciled = reconcileBarLayout(sectionRef.current.barLayout, cascaded);
    if (reconciled) patch.barLayout = reconciled;
    await commit(patch);
  };

  // Delete a chord from the bar grid (popover 'Delete chord' button).
  // Removes the placement; reconcileBarLayout flips the containing bar
  // to 'empty' if it now holds no chords. Undoable via the undo stack.
  const handleChordDelete = async (placementId: string) => {
    const { placements, realPlacementId } = ensurePlacementsForOp(placementId);
    const next = removeChordPlacement(placements, realPlacementId);
    const patch: Partial<SongSection> = { chordPlacements: next };
    const reconciled = reconcileBarLayout(sectionRef.current.barLayout, next);
    if (reconciled) patch.barLayout = reconciled;
    await commit(patch);
  };

  // Chord drag onto another chord = swap positions (Option C). The
  // two placements exchange (barIndex, beatPos); chord metadata
  // travels with each placement so nothing else changes. A swap
  // doesn't change which bars are occupied (both bars still hold
  // a chord), but we still reconcile barLayout for safety in case
  // the section's layout was already out of sync.
  const handleChordSwap = async (fromPlacementId: string, toPlacementId: string) => {
    const { placements: fromPlacements, realPlacementId: fromReal } =
      ensurePlacementsForOp(fromPlacementId);
    const toReal = isLegacyPlacementId(toPlacementId)
      ? resolveLegacyPlacementId(toPlacementId, activeArrangementId) ?? toPlacementId
      : toPlacementId;
    if (fromReal === toReal) return;
    const next = swapChordPlacements(fromPlacements, fromReal, toReal);
    const patch: Partial<SongSection> = { chordPlacements: next };
    const reconciled = reconcileBarLayout(sectionRef.current.barLayout, next);
    if (reconciled) patch.barLayout = reconciled;
    await commit(patch);
  };

  // Chord drag onto an empty beat slot = move chord to that position.
  // The source becomes truly empty; no other chords are touched.
  // barLayout needs to follow: the destination bar may have been
  // marked 'empty' (now needs to become 'chord'), and the source bar
  // may now be empty (needs 'empty').
  const handleChordMoveToEmpty = async (
    placementId: string,
    barIndex: number,
    beatPos: number,
  ) => {
    const { placements, realPlacementId } = ensurePlacementsForOp(placementId);
    const next = moveChordPlacement(placements, realPlacementId, barIndex, beatPos);
    const patch: Partial<SongSection> = { chordPlacements: next };
    const reconciled = reconcileBarLayout(sectionRef.current.barLayout, next);
    if (reconciled) patch.barLayout = reconciled;
    await commit(patch);
  };

  const commitLyricLines = async (next: LyricLine[]) => {
    await commit({ lyricLines: next });
  };

  // Paste submit: one staged text line → one LyricLine in "pending"
  // state (start == end == (0,0)). The user drags the strip onto a
  // beat slot to place it.
  const handleSubmitLyricLines = async (textLines: string[][]) => {
    const fresh: LyricLine[] = textLines.map(words => ({
      id: crypto.randomUUID(),
      words,
      startBar: 0,
      startBeat: 0,
      endBar: 0,
      endBeat: 0,
    }));
    await commitLyricLines([...lyricLines, ...fresh]);
  };

  const handleDeleteLyricLine = async (lineId: string) => {
    await commitLyricLines(lyricLines.filter(l => l.id !== lineId));
  };

  // Per-section time signature override (step 8). `null` clears the
  // override so the section falls back to the song-level default.
  // commit() routes the undefined-clear through onReplace so the
  // field actually goes back to undefined in storage.
  const handleTimeSignatureChange = async (next: string | null) => {
    const cleaned =
      next === null || next.trim() === '' ? undefined : next.trim();
    if ((sectionRef.current.timeSignature ?? undefined) === cleaned) return;
    await commit({ timeSignature: cleaned });
  };

  // Tap-to-add a chord on an empty beat slot. Materializes the
  // section to bar-anchored on the first add (so future ops route
  // through the new model end-to-end). The new placement gets a
  // fresh uuid + beats:1; the bar-layout reconcile flips the
  // containing bar from 'empty' → 'chord' if needed.
  const handleChordAdd = async (
    barIndex: number,
    beatPos: number,
    chord: ChordFunction,
  ) => {
    const sec = sectionRef.current;
    const placements =
      sec.chordPlacements !== undefined
        ? sec.chordPlacements
        : materializeChordPlacements(sec, beatsPerBar);
    const newPlacement: ChordPlacement = {
      id: crypto.randomUUID(),
      arrangementId: activeArrangementId,
      barIndex,
      beatPos,
      beats: 1,
      chord,
    };
    const next = addChordPlacement(placements, newPlacement);
    const patch: Partial<SongSection> = { chordPlacements: next };
    const reconciled = reconcileBarLayout(sec.barLayout, next);
    if (reconciled) patch.barLayout = reconciled;
    await commit(patch);
  };

  // Lead-sheet → ET pipeline (step 9). Opens the inline confirmation
  // popover; the actual add fires from `handleConfirmAddProgression`
  // below. Resets the label draft each time so successive adds don't
  // inherit stale text.
  const beginAddProgression = (m: ProgressionMatch) => {
    setAddingProgressionId(m.progressionId);
    setAddLabelDraft('');
  };

  const cancelAddProgression = () => {
    setAddingProgressionId(null);
    setAddLabelDraft('');
  };

  const handleConfirmAddProgression = async () => {
    const id = addingProgressionId;
    if (!id) return;
    const trimmed = addLabelDraft.trim();
    const progName = progressionById(id)?.name ?? id;
    await setAddedFromRepertoire(id, true);
    if (trimmed !== '') {
      await setEtCustomLabel(id, trimmed);
    }
    setAddingProgressionId(null);
    setAddLabelDraft('');
    toast({
      message: `Added "${trimmed || progName}" to ET practice`,
      variant: 'success',
      action: {
        label: 'Undo',
        onClick: async () => {
          await setAddedFromRepertoire(id, false);
          if (trimmed !== '') {
            await setEtCustomLabel(id, null);
          }
        },
      },
    });
  };

  // Syllable split / join (step 7). Both helpers are pure — the
  // handler just runs them against the matching line and persists.
  const handleWordSplit = async (
    lineId: string,
    wordIndex: number,
    splitAt: number,
  ) => {
    const target = lyricLines.find(l => l.id === lineId);
    if (!target) return;
    const updated = splitWord(target, wordIndex, splitAt, beatsPerBar);
    if (updated === target) return;
    await commitLyricLines(lyricLines.map(l => (l.id === lineId ? updated : l)));
  };

  const handleWordJoin = async (lineId: string, wordIndex: number) => {
    const target = lyricLines.find(l => l.id === lineId);
    if (!target) return;
    const updated = joinWords(target, wordIndex);
    if (updated === target) return;
    await commitLyricLines(lyricLines.map(l => (l.id === lineId ? updated : l)));
  };

  // --- Bar add / delete / reorder ---------------------------------
  // Bar layout is the source of truth once any bar operation has
  // happened: `section.barLayout: ('chord' | 'empty')[]` lists the
  // kind of each bar position. Before the first operation, layout is
  // derived from chord placements + the legacy `barCount` padding.
  const allBars = useMemo(
    () => deriveBarGrid(section, activeArrangementId, beatsPerBar),
    [section, activeArrangementId, beatsPerBar],
  );

  const materializeBarLayout = (): ('chord' | 'empty')[] => {
    const sec = sectionRef.current;
    if (sec.barLayout) return [...sec.barLayout];
    return allBars.map(b => (b.isEmpty ? 'empty' : 'chord'));
  };

  const handleAddBar = async () => {
    const layout = materializeBarLayout();
    layout.push('empty');
    await commit({ barLayout: layout });
  };

  const handleDeleteBar = async (barIndex: number) => {
    const layout = materializeBarLayout();
    if (barIndex < 0 || barIndex >= layout.length) return;
    // Only empty bars can be deleted via this affordance.
    if (layout[barIndex] !== 'empty') return;

    // Lines touching this bar: starts here, ends here, or spans across.
    const touchesBar = (l: LyricLine): boolean =>
      l.startBar === barIndex ||
      l.endBar === barIndex ||
      (l.startBar < barIndex && l.endBar > barIndex);
    const touched = lyricLines.filter(touchesBar);

    if (touched.length > 0) {
      const ok = window.confirm(
        `Bar ${barIndex + 1} has ${touched.length} placed lyric ` +
          `line${touched.length === 1 ? '' : 's'}. Delete the bar and ` +
          `remove ${touched.length === 1 ? 'it' : 'them'}?`,
      );
      if (!ok) return;
    }

    // Drop touching lines; shift lines past the deletion point down by 1.
    const nextLyrics = lyricLines
      .filter(l => !touchesBar(l))
      .map(l => ({
        ...l,
        startBar: l.startBar > barIndex ? l.startBar - 1 : l.startBar,
        endBar: l.endBar > barIndex ? l.endBar - 1 : l.endBar,
      }));

    layout.splice(barIndex, 1);
    await commit({ barLayout: layout, lyricLines: nextLyrics });
  };

  const handleBarReorder = async (fromIndex: number, toIndex: number) => {
    const result = reorderBar(
      sectionRef.current,
      activeArrangementId,
      fromIndex,
      toIndex,
      beatsPerBar,
    );
    if (!result) return;
    // reorderBar returns either `phrases` (legacy mode) or
    // `chordPlacements` (bar-anchored / Option C). Commit whichever
    // is present so we don't blow away the unused field.
    const patch: Partial<SongSection> = {
      barLayout: result.barLayout,
      lyricLines: result.lyricLines,
    };
    if (result.phrases !== undefined) patch.phrases = result.phrases;
    if (result.chordPlacements !== undefined) {
      patch.chordPlacements = result.chordPlacements;
    }
    await commit(patch);
  };

  // --- Unified DndContext drag-end dispatch (step 6) -------------
  // Single onDragEnd handles every drag in the section: chord
  // reorder, pending-line placement, marker drags, word nudges.
  // Routes by id prefix so each draggable kind owns its own logic.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Collision detection routed by active.id prefix. Necessary because
  // the bar `useDroppable` wraps the same DOM region as the chord
  // sortable cells inside it — without filtering, the larger bar
  // droppable rect always wins when a chord crosses bar boundaries,
  // leaving `over.id` as `bar:N` and the chord-reorder branch never
  // fires. Same logic protects lyric drags from picking up the bar
  // droppable when crossing bar gaps.
  const collisionDetection: CollisionDetection = args => {
    const activeId = String(args.active.id);
    let allowed: typeof args.droppableContainers = args.droppableContainers;
    if (activeId.startsWith('chord:')) {
      // Chord active accepts chord drop targets (swap) and emptybeat
      // drop targets (move to empty beat slot).
      allowed = args.droppableContainers.filter(d => {
        const id = String(d.id);
        return id.startsWith('chord:') || id.startsWith('emptybeat:');
      });
    } else if (activeId.startsWith('bar:')) {
      allowed = args.droppableContainers.filter(d =>
        String(d.id).startsWith('bar:'),
      );
    } else if (
      activeId.startsWith('staged:') ||
      activeId.startsWith('placed:') ||
      activeId.startsWith('pending:') ||
      activeId.startsWith('lineStart:') ||
      activeId.startsWith('lineEnd:') ||
      activeId.startsWith('word:')
    ) {
      allowed = args.droppableContainers.filter(d =>
        String(d.id).startsWith('beat:'),
      );
    }
    return closestCenter({ ...args, droppableContainers: allowed });
  };

  // Default range on placement: 1 bar — drop sets the start to the
  // drop target and the end to the last beat of that same bar.
  const defaultEndForPlacement = (
    startBar: number,
    _startBeat: number,
  ): { endBar: number; endBeat: number } => {
    return { endBar: startBar, endBeat: Math.max(0, beatsPerBar - 1) };
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    // Bar reorder. Both active and over are `bar:` ids.
    if (activeId.startsWith('bar:') && overId.startsWith('bar:')) {
      const fromIndex = parseInt(activeId.slice('bar:'.length), 10);
      const toIndex = parseInt(overId.slice('bar:'.length), 10);
      if (Number.isFinite(fromIndex) && Number.isFinite(toIndex)) {
        await handleBarReorder(fromIndex, toIndex);
      }
      return;
    }

    // Chord drag (Option C). Active id is `chord:placementId`.
    //   · over `chord:` → swap the two placements' (barIndex, beatPos)
    //   · over `emptybeat:bar:pos` → move chord placement to that beat
    if (activeId.startsWith('chord:')) {
      const fromPlacementId = activeId.slice('chord:'.length);
      if (overId.startsWith('chord:')) {
        const toPlacementId = overId.slice('chord:'.length);
        if (fromPlacementId === toPlacementId) return;
        await handleChordSwap(fromPlacementId, toPlacementId);
        return;
      }
      if (overId.startsWith('emptybeat:')) {
        const [, barStr, beatStr] = overId.split(':');
        const dropBar = parseInt(barStr, 10);
        const dropBeat = parseInt(beatStr, 10);
        if (!Number.isFinite(dropBar) || !Number.isFinite(dropBeat)) return;
        await handleChordMoveToEmpty(fromPlacementId, dropBar, dropBeat);
        return;
      }
      return;
    }

    // Lyric drags all target beat drop zones.
    if (!overId.startsWith('beat:')) return;
    const [, barStr, beatStr] = overId.split(':');
    const dropBar = parseInt(barStr, 10);
    const dropBeat = parseInt(beatStr, 10);
    if (!Number.isFinite(dropBar) || !Number.isFinite(dropBeat)) return;

    if (activeId.startsWith('pending:')) {
      const lineId = activeId.slice('pending:'.length);
      const target = lyricLines.find(l => l.id === lineId);
      if (!target) return;
      const { endBar, endBeat } = defaultEndForPlacement(dropBar, dropBeat);
      const next = lyricLines.map(l =>
        l.id === lineId
          ? {
              ...l,
              startBar: dropBar,
              startBeat: dropBeat,
              endBar,
              endBeat,
              wordOffsets: undefined,
            }
          : l,
      );
      await commitLyricLines(next);
      return;
    }

    if (activeId.startsWith('lineStart:')) {
      const lineId = activeId.slice('lineStart:'.length);
      const target = lyricLines.find(l => l.id === lineId);
      if (!target) return;
      const updated = applyStartMarkerDrag(target, dropBar, dropBeat, beatsPerBar);
      if (updated === target) return;
      await commitLyricLines(lyricLines.map(l => (l.id === lineId ? updated : l)));
      return;
    }

    if (activeId.startsWith('lineEnd:')) {
      const lineId = activeId.slice('lineEnd:'.length);
      const target = lyricLines.find(l => l.id === lineId);
      if (!target) return;
      const updated = applyEndMarkerDrag(target, dropBar, dropBeat, beatsPerBar);
      if (updated === target) return;
      await commitLyricLines(lyricLines.map(l => (l.id === lineId ? updated : l)));
      return;
    }

    if (activeId.startsWith('word:')) {
      const rest = activeId.slice('word:'.length);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon < 0) return;
      const lineId = rest.slice(0, lastColon);
      const wordIndex = parseInt(rest.slice(lastColon + 1), 10);
      if (!Number.isFinite(wordIndex)) return;
      const target = lyricLines.find(l => l.id === lineId);
      if (!target) return;
      // Drop target maps to an absolute beat; subtract the word's base
      // distributed position (without offsets) to derive a delta the
      // applyWordNudge helper can apply on top of the existing offset.
      const dropGlobal = dropBar * beatsPerBar + dropBeat;
      const baseGlobal = distributedWordPositions(
        { ...target, wordOffsets: undefined },
        beatsPerBar,
      )[wordIndex];
      if (baseGlobal === undefined) return;
      const currentOffset = (target.wordOffsets ?? [])[wordIndex] ?? 0;
      const desiredOffset = dropGlobal - baseGlobal;
      const delta = desiredOffset - currentOffset;
      if (delta === 0) return;
      const updated = applyWordNudge(target, wordIndex, delta, beatsPerBar);
      if (updated === target) return;
      await commitLyricLines(lyricLines.map(l => (l.id === lineId ? updated : l)));
      return;
    }
  };

  // Bar-grid harmonic-tag write-back. `tag === null` clears the
  // manual tag, letting the auto-detector take over again. Auto-
  // detected tags are display-only — only manual selections reach
  // this handler. Operates on the bar-anchored chord placement.
  const handleChordTagChange = async (placementId: string, tag: string | null) => {
    const { placements, realPlacementId } = ensurePlacementsForOp(placementId);
    const target = placements.find(p => p.id === realPlacementId);
    if (!target) return;
    const updatedChord = { ...target.chord };
    if (tag === null) delete updatedChord.harmonicTag;
    else updatedChord.harmonicTag = tag;
    const next = updateChordPlacement(placements, realPlacementId, {
      chord: updatedChord,
    });
    await commit({ chordPlacements: next });
  };

  // --- Progression detection -------------------------------------
  // Runs on the active arrangement's functional data. Each
  // ChordFunction converts to a Roman-numeral token that
  // detectProgressions already knows how to read.
  const progressionMatches = useMemo(() => {
    const tokens: string[] = [];
    for (const phrase of normalisedPhrases) {
      const seq = chordSequenceForArrangement(phrase, activeArrangementId);
      for (const cf of seq) {
        const roman = toRomanToken(cf);
        if (roman !== '') tokens.push(roman);
      }
    }
    if (tokens.length < 2) return [];
    return detectProgressions(tokens);
  }, [normalisedPhrases, activeArrangementId]);

  const setSectionStage = async (next: SongSection['stage']) => {
    await commit({ stage: next });
  };

  const comparing = compareIds.length > 0;

  return (
    <div
      id={`section-${section.id}`}
      className={`rounded-lg border p-3 space-y-3 ${
        section.hidden
          ? 'border-dashed opacity-70'
          : 'border-neutral-200 dark:border-neutral-800'
      } ${highlighted ? 'repertoire-flash' : ''} ${comparing ? 'bg-info/5' : ''}`}
    >
      {/* Header: name / stage / reorder / hide / delete */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={async () => {
                const trimmed = nameDraft.trim() || section.name;
                if (trimmed !== section.name) await commit({ name: trimmed });
                setEditingName(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setNameDraft(section.name); setEditingName(false); }
              }}
              className="font-medium text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-0.5"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="font-medium text-sm hover:text-fluent"
              title="click to rename"
            >
              {section.name}
            </button>
          )}
          <label className="text-[11px] text-neutral-500 flex items-center gap-1">
            stage:
            <select
              value={stage}
              onChange={e => setSectionStage(e.target.value as SongSection['stage'])}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-[11px]"
            >
              {STAGES.map(s => (
                <option key={s} value={s}>{STAGE_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <span
            className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${STAGE_BADGE_CLASS[stage]}`}
          >
            {STAGE_LABEL[stage]}
          </span>
          {section.lyricsNeedsVerification && (
            <span
              className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-developing/40 bg-developing/10 text-developing"
              title="seeded without verified lyrics — transcribe from the recording"
            >
              needs verification
            </span>
          )}
          {comparing && (
            <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-info/40 bg-info/10 text-info">
              comparing arrangements
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp || !onMoveUp}
            title="move section up"
            className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown || !onMoveDown}
            title="move section down"
            className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↓
          </button>
          <button
            onClick={() => commit({ hidden: !section.hidden })}
            className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent"
            title={section.hidden ? 'unhide section' : 'hide section'}
          >
            {section.hidden ? 'unhide' : 'hide'}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-needswork hover:border-needswork"
              title="delete section"
            >
              delete
            </button>
          )}
        </div>
      </div>

      {section.hidden ? (
        <p className="text-xs text-neutral-500 italic">section hidden — won't show in your practice view.</p>
      ) : (
        <>
          <ArrangementBar
            arrangements={arrangements}
            activeId={activeArrangementId}
            compareIds={compareIds}
            onChangeActive={setActiveArrangementId}
            onChangeCompare={setCompareIds}
            onArrangementsChange={saveArrangements}
            phrases={normalisedPhrases}
            onPhraseChange={updatePhraseInPlace}
          />

          {/* Lead Sheet Redesign — bar-grid view + lyric placement.
              One DndContext owns chord sortable, pending-line drag,
              start/end marker drag, and per-word nudge drag. Dispatch
              by active.id prefix lives in `handleDragEnd` above. */}
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragEnd={handleDragEnd}
          >
            <BarGridView
              song={song}
              section={section}
              activeArrangementId={activeArrangementId}
              onChordBeatsChange={handleChordBeatsChange}
              onChordTagChange={handleChordTagChange}
              onChordDelete={handleChordDelete}
              chordsAreSortable
              lyricLines={lyricLines}
              onLineDelete={handleDeleteLyricLine}
              onAddBar={handleAddBar}
              onDeleteBar={handleDeleteBar}
              onBarReorder={handleBarReorder}
              onWordSplit={handleWordSplit}
              onWordJoin={handleWordJoin}
              onUndo={handleUndo}
              canUndo={canUndo}
              onRedo={handleRedo}
              canRedo={canRedo}
              onTimeSignatureChange={handleTimeSignatureChange}
              onChordAdd={handleChordAdd}
            />

            {/* Step 6 lyric paste: each text line becomes a pending
                LyricLine in the bar grid's tray. */}
            <LyricStagingArea
              sectionId={section.id}
              onSubmitLines={handleSubmitLyricLines}
            />
          </DndContext>

          {progressionMatches.length > 0 && !comparing && (
            <div className="flex flex-col gap-1 text-[11px] text-neutral-500 pt-1 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="uppercase tracking-wide">detected:</span>
                {progressionMatches.slice(0, 3).map((m, idx) => {
                  const isAdded = addedFromRepertoireSet.has(m.progressionId);
                  return (
                    <span
                      key={`${m.progressionId}-${idx}`}
                      className="inline-flex items-center gap-1 rounded-full border border-fluent/30 bg-fluent/10 text-fluent px-2 py-0.5"
                      title={
                        isAdded
                          ? 'In your ET practice'
                          : `Tier ${m.tier} · ${m.tierName} · match type: ${m.matchType}`
                      }
                    >
                      <span aria-hidden>📍</span>
                      {m.progressionName}
                      {isAdded ? (
                        <span
                          aria-label="In your ET practice"
                          className="ml-0.5 font-semibold"
                        >
                          ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => beginAddProgression(m)}
                          title="Add to ET practice"
                          aria-label="Add to ET practice"
                          className="ml-0.5 leading-none hover:underline"
                        >
                          +
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              {addingProgressionId &&
                (() => {
                  const prog = progressionById(addingProgressionId);
                  if (!prog) return null;
                  return (
                    <div className="rounded border border-fluent/40 bg-fluent/5 p-2 space-y-2 max-w-sm">
                      <div className="text-[11px]">
                        <div className="font-semibold text-neutral-700 dark:text-neutral-200">
                          {prog.name}
                        </div>
                        <div className="font-mono text-neutral-500 mt-0.5">
                          {prog.numerals.join(' – ')}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={addLabelDraft}
                        onChange={e => setAddLabelDraft(e.target.value)}
                        placeholder="custom label (optional)"
                        className="w-full px-2 py-0.5 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200"
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void handleConfirmAddProgression()}
                          className="px-2 py-0.5 text-[11px] rounded-full border border-fluent bg-fluent/10 text-fluent hover:bg-fluent/20"
                        >
                          Add to ET practice
                        </button>
                        <button
                          type="button"
                          onClick={cancelAddProgression}
                          className="px-2 py-0.5 text-[11px] rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })()}
            </div>
          )}

          {/* Arrangement notes (per active arrangement) */}
          {arrangements.find(a => a.id === activeArrangementId)?.notes && (
            <div className="rounded-md bg-neutral-50 dark:bg-neutral-900/60 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500 mr-1.5">
                arrangement note
              </span>
              {arrangements.find(a => a.id === activeArrangementId)?.notes}
            </div>
          )}

          {/* Section notes */}
          <div className="space-y-1">
            <button
              onClick={() => setShowNotes(v => !v)}
              className="text-[11px] text-neutral-500 hover:text-fluent"
            >
              {showNotes ? '▴ hide notes' : '▸ section notes'}
            </button>
            {showNotes && (
              <textarea
                rows={2}
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                onBlur={() => notesDraft !== (section.notes ?? '') && commit({ notes: notesDraft })}
                placeholder="thoughts, voicing ideas, performance cues"
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs"
              />
            )}
          </div>

        </>
      )}
    </div>
  );
}

export { parseChord };

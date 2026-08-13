import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { getEventCoordinates } from '@dnd-kit/utilities';
import type {
  Arrangement,
  ChordFunction,
  ChordPlacement,
  LyricLine,
  LyricSyllable,
  Phrase,
  Song,
  SequenceView,
  SongLyricLine,
  SongSection,
  VoicingEntry,
} from '../../lib/db';
import {
  type BeatAxis,
  type CellOccupant,
  type OrderViolation,
  type LineMarkerPlacement,
  anchorsMatching,
  cellKey,
  checkPlacementOrder,
  findSyllable,
  joinSyllables,
  markerTargetSyllable,
  linesFromParsedRows,
  lineStatus,
  placeSyllable,
  setSyllableText,
  splitSyllable,
  unplaceAnchorsMatching,
  unplaceLine,
  unplaceSyllable,
} from './lyricSyllables';
import { parseLyricSheet } from './lyricSheetParse';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  DEFAULT_LYRIC_TRAY_COLLAPSED,
  DEFAULT_PATTERNS_COLLAPSED,
} from './leadSheetPrefs';
import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_BADGE_CLASS,
  STAGE_LABEL,
} from './stage';
import { parseChord } from './chordParser';
import {
  detectPatterns,
  type PatternMatch,
} from '../../lib/progressionDetection';
import {
  setAddedFromRepertoire,
  setCustomLabel as setEtCustomLabel,
} from '../ear-training/etCuration';
import { useAddedFromRepertoireSet } from '../ear-training/useEtCurations';
import { useToast } from '../../components/Toaster';
import { useNotationMode } from '../../lib/notationPref';
import {
  normalizeArrangements,
  normalizePhrase,
  uid,
} from './beatsModel';
import { chordToDisplay, patternNumeralToDisplay } from './chordFunction';
import { chordPalette, useIsDarkMode } from './chordColors';
import {
  EMPTY_SEQUENCE_VIEW,
  buildPhrases,
  pruneDeletedPlacements,
  removeBreak,
  setBreak,
  setPhraseNote,
  toggleHidden,
} from './sequenceView';
import { toDetectChords } from './progressionOutline';
import SequenceChoices from './SequenceChoices';
import PhraseNote from './PhraseNote';
import SectionToggle from './SectionToggle';
import ArrangementBar from './ArrangementBar';
import BarGridView, { parseSlotDropId } from './BarGridView';
import LyricStagingArea from './LyricStagingArea';
import {
  addChordPlacement,
  cascadeChordPlacements,
  deriveBarGrid,
  effectiveTimeSignature,
  isLegacyPlacementId,
  deleteBarFromPlacements,
  materializeChordPlacements,
  moveChordPlacement,
  parseTimeSignature,
  removeChordPlacement,
  reorderBar,
  resolveLegacyPlacementId,
  slotsPerBar,
  swapChordPlacements,
  updateChordPlacement,
} from './barGrid';
import { EIGHTHS_DURATION_VERSION } from './eighthsMigration';
import { sequenceViewCommitPatch } from './sequenceAnchors';
import {
  applyEndMarkerDrag,
  applyStartMarkerDrag,
  applyWordNudge,
  distributedWordPositions,
  joinWords,
  setWordText,
  splitWord,
  tokenizeLyricLines,
} from './lyricLine';
/**
 * Ride the pointer.
 *
 * dnd-kit positions a DragOverlay at the ACTIVATOR ELEMENT'S rect plus
 * the drag delta — not under the cursor. Grab a chip near its edge, or
 * the container-width tray strip anywhere at all, and the pill floats
 * that same offset away from the pointer for the whole drag, while the
 * ring follows the (correct) collision math. Three things moving
 * independently is the "inch off" feel that survived every fix to the
 * targeting layer, because targeting was never the problem.
 *
 * Applied to the DragOverlay only, never to DndContext: the context's
 * modifiers feed `modifiedTranslate` → `collisionRect`, and collision
 * is pointer-based and correct now. This moves pixels, not decisions.
 *
 * Same math as @dnd-kit/modifiers' snapCenterToCursor, inlined rather
 * than pulling in a package for one function.
 */
const snapCenterToCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const activator = getEventCoordinates(activatorEvent);
  if (!activator) return transform;
  const offsetX = activator.x - draggingNodeRect.left;
  const offsetY = activator.y - draggingNodeRect.top;
  return {
    ...transform,
    x: transform.x + offsetX - draggingNodeRect.width / 2,
    y: transform.y + offsetY - draggingNodeRect.height / 2,
  };
};

/**
 * How far outside a cell's BAND (see below) the pointer may sit and
 * still count as aiming at it. Covers the 2px inter-cell gaps and the
 * row gutters, while refusing a cursor nowhere near the grid.
 */
const POINTER_SNAP_PX = 48;

/**
 * How far ABOVE a lyric cell still belongs to it.
 *
 * Each grid row is [chord row][4px][lyric row], then a 12px gap to the
 * next row — so a lyric cell is ~30px tall inside a ~130px row, and the
 * ~76px above it is the chord row for the SAME bar plus the row gap.
 * Measured against the bare cell, the space between rows was a dead
 * zone: instrumented capture caught a cursor mid-travel with its four
 * nearest cells all 41-43px away, near-tied across two rows, so the
 * ring sat well off the cursor and flipped between rows on ties.
 *
 * Extending each cell's target band upward over its own chord row makes
 * the bands tile vertically: every point in the grid belongs to exactly
 * one bar-and-beat, and "which column am I in" becomes the only
 * question. Nothing else can be meant by hovering a bar's chord cell
 * during a LYRIC drag, and chord drags are unaffected — they filter to
 * `emptybeat:` droppables and never see these.
 */
const LYRIC_BAND_ABOVE_PX = 76;


/** Distance from a point to a cell's target band; 0 when inside it. */
function pointerDistanceToRect(
  point: { x: number; y: number },
  rect: DOMRect,
): number {
  const bandTop = rect.top - LYRIC_BAND_ABOVE_PX;
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(bandTop - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

type LyricCollisions = ReturnType<CollisionDetection>;
type DroppableContainers = Parameters<CollisionDetection>[0]['droppableContainers'];

function collisionFor(
  container: DroppableContainers[number],
  value: number,
): LyricCollisions {
  return [{ id: container.id, data: { droppableContainer: container, value } }];
}

/**
 * Nearest cell when the cursor sits in a gutter between cells. Reads
 * live rects off the nodes for the same reason `cellUnderPointer` does.
 * Only runs when the hit-test found nothing, so the cost of measuring
 * every candidate stays off the common path.
 */
function nearestCellToPointer(
  point: { x: number; y: number },
  allowed: DroppableContainers,
): LyricCollisions {
  let best: DroppableContainers[number] | null = null;
  let bestDistance = Infinity;
  for (const container of allowed) {
    const node = container.node.current;
    if (!node) continue;
    const distance = pointerDistanceToRect(point, node.getBoundingClientRect());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = container;
    }
  }
  if (!best || bestDistance > POINTER_SNAP_PX) return [];
  return collisionFor(best, bestDistance);
}

interface Props {
  song: Song;
  section: SongSection;
  /** Reorder mode (toggled from the lead-sheet header): surfaces the
   *  up/down section-move buttons. Drag-to-reorder has been removed. */
  reorderMode?: boolean;
  /** Play mode — strips editing chrome to a clean playing view; the
   *  section name shows as a small muted label and only occupied chord
   *  slots + lyrics render. See LEAD_SHEET_PLAY_MODE_DESIGN.md. */
  playMode?: boolean;
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
  /** Song-owned lyric store (rev 3). Present once the song has
   *  migrated; the three travel together and the section falls back to
   *  its legacy `section.lyricLines` when they're absent. */
  songLyricLines?: SongLyricLine[];
  /** Anchor→cell index, built once above the sections. */
  cellIndex?: Map<string, CellOccupant[]>;
  /** Global beat axis across every section — needed to compare
   *  anchors that may sit in different sections. */
  beatAxis?: BeatAxis;
  /** Line start/end markers grouped by cell. */
  markerIndex?: Map<string, LineMarkerPlacement[]>;
  onSongLyricsChange?: (next: SongLyricLine[]) => Promise<void>;
  /** Which syllable a beat-cell tap will place — song-level state
   *  (step 6b), so the syllable may well belong to another section's
   *  cell, or to no cell at all. */
  armedSyllableId?: string | null;
  /** A syllable chip was tapped: arms, disarms, or transfers arming.
   *  The reducer above decides which. */
  onArmSyllable?: (syllableId: string) => void;
  /** A tap placement landed, so arming should clear. Refusals
   *  deliberately do NOT call this — arming survives so the next cell
   *  can be tried immediately. */
  onSyllablePlaced?: () => void;
  /** A tap placement was refused on ordering grounds. Carries the
   *  viewport rect of the tapped cell so the message can float over it.
   *  Song-level, because the message is one overlay for the page. */
  onRefusalNotice?: (
    reason: 'order' | 'off-axis',
    /** Absent when the tap had no measurable cell; the message parks at
     *  the screen edge rather than being dropped. */
    cellRect?: DOMRect,
  ) => void;
  /** Progression-patterns block collapsed? A GLOBAL pref owned by
   *  SongDetailView — every section's block follows the one value, so
   *  expressing the preference costs one tap and not one per section. */
  patternsCollapsed?: boolean;
  onTogglePatterns?: () => void;
  /** Unplaced-lyrics tray collapsed? A separate global pref from
   *  `patternsCollapsed` — deliberately not chained to it. */
  lyricTrayCollapsed?: boolean;
  onToggleLyricTray?: () => void;
  /** The line placement in progress. Song-level, since the two beats
   *  may land in different sections. */
  awaitingLine?: { lineId: string; edge: 'start' | 'end' } | null;
  /** Beat one landed — the line's head is placed, now ask for its end.
   *  Carries the line's syllables as they were BEFORE the write, so
   *  cancelling undoes the gesture rather than the line. */
  onLineHeadPlaced?: (lineId: string, snapshot: LyricSyllable[]) => void;
  /** Song-level lyric actions the per-section tray now offers too, so
   *  the tray and the drawer behave identically. Pass-through only. */
  onArmLine?: (lineId: string) => void;
  onArmWord?: (syllableId: string) => void;
  onSetLineKind?: (lineId: string, kind: 'lyric' | 'header') => void | Promise<void>;
  onDuplicateLine?: (lineId: string) => void | Promise<void>;
  /** Cell the line-end prompt anchors to, and the channel the matching
   *  cell uses to report its node. Pass-through only. */
  promptAnchorCellKey?: string | null;
  onPromptAnchorNode?: (node: HTMLElement | null) => void;
}

export default function LeadSheetSection({
  song,
  section,
  reorderMode = false,
  playMode = false,
  canMoveUp,
  canMoveDown,
  highlighted,
  onChange,
  onReplace,
  onMoveUp,
  onMoveDown,
  onDelete,
  songLyricLines,
  cellIndex,
  beatAxis,
  markerIndex,
  onSongLyricsChange,
  armedSyllableId = null,
  onArmSyllable,
  onSyllablePlaced,
  onRefusalNotice,
  patternsCollapsed = DEFAULT_PATTERNS_COLLAPSED,
  onTogglePatterns,
  lyricTrayCollapsed = DEFAULT_LYRIC_TRAY_COLLAPSED,
  onToggleLyricTray,
  awaitingLine = null,
  onLineHeadPlaced,
  onArmLine,
  onArmWord,
  onSetLineKind,
  onDuplicateLine,
  promptAnchorCellKey = null,
  onPromptAnchorNode,
}: Props) {
  // Migrated when the song-level store is present. Every lyric read and
  // write below routes on this; the legacy section-owned path stays
  // intact underneath for songs that haven't folded yet.
  const songLyricsActive = Boolean(cellIndex && onSongLyricsChange);
  const eighths = song.eighths === true;
  const stage = section.stage ?? song.stage ?? DEFAULT_STAGE;
  const { toast } = useToast();
  // Same source the grid cells read, so the sequence strip and the
  // cells can never disagree about notation.
  const [notationMode] = useNotationMode();
  const isDark = useIsDarkMode();

  const [showNotes, setShowNotes] = useState(Boolean(section.notes));
  const [notesDraft, setNotesDraft] = useState(section.notes ?? '');
  const [nameDraft, setNameDraft] = useState(section.name);
  const [editingName, setEditingName] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Session-lifetime chord clipboard. Set by the chord-edit popover's
  // 'Copy chord'; read by the chord-add popover's 'Paste'. Not synced
  // to Dexie — clears on unmount.
  const [copiedChord, setCopiedChord] = useState<ChordFunction | null>(null);

  // Detected-pattern → ET pipeline (Lead Sheet Redesign step 9).
  // `addedFromRepertoireSet` flags ET catalog progression ids the user
  // has promoted via a detected pattern's + affordance. Confirmation
  // popover state holds the in-flight pattern (its ET id + display
  // numerals) plus an optional custom label.
  const addedFromRepertoireSet = useAddedFromRepertoireSet();
  const [addingPattern, setAddingPattern] = useState<
    { etCatalogId: string; numerals: string[] } | null
  >(null);
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

  const commit = async (rawPatch: Partial<SongSection>) => {
    // Any write of `chordPlacements` on a song with eighths on is in
    // SLOT units, and says so in the same write. Enforced here, at the
    // one boundary every chord op funnels through, rather than at each
    // materialisation site — a new call site added later inherits it
    // instead of having to remember it.
    //
    // Without this, a section materialised under eighths would be
    // correct but unstamped, and the repair pass would read "unstamped"
    // as "still in beats" and double it a second time.
    const patch: Partial<SongSection> =
      eighths && rawPatch.chordPlacements !== undefined
        ? { ...rawPatch, eighthsDurationVersion: EIGHTHS_DURATION_VERSION }
        : rawPatch;
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
  /** Chord DURATIONS are counted in the positions a bar offers, not in
   *  beats — which is what keeps a migrated chord's rendered width
   *  (`beats / barSlots`) identical either side of the eighths move. */
  const barSlots = slotsPerBar(beatsPerBar, eighths);

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
    const placements = materializeChordPlacements(sec, beatsPerBar, eighths);
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
    const clamped = Math.min(Math.max(1, Math.round(beats)), barSlots);
    const updated = updateChordPlacement(placements, realPlacementId, { beats: clamped });
    // Expanding a chord can push following placements onto beats that
    // are now covered — deriveBarGridAnchored would mask them. Cascade
    // them forward in beat order so every chord stays visible.
    const target = updated.find(p => p.id === realPlacementId);
    const arrId = target?.arrangementId ?? activeArrangementId;
    const cascaded = cascadeChordPlacements(updated, arrId, beatsPerBar, eighths);
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
    // The strip's annotations follow the chord out. BOTH ids are
    // pruned: on a legacy section the rendered strip — and therefore
    // any annotation made against it — uses the synthetic
    // `legacy:phrase:beat` id, while `realPlacementId` is its
    // post-materialisation counterpart. Which one is anchored depends
    // on when the annotation was written, so neither can be assumed.
    const prunedView = pruneDeletedPlacements(
      sequenceView,
      [realPlacementId, placementId],
      sequenceOrder,
    );
    if (prunedView !== sequenceView) patch.sequenceView = prunedView;
    await commit(patch);
  };

  // Copy a chord's function data into the session clipboard. Only the
  // harmonic content travels (function/quality/bass/harmonicTag) — not
  // beats or placement identity — so a paste lands as a fresh beats:1
  // chord at the target slot.
  const handleCopyChord = (chord: ChordFunction) => {
    setCopiedChord({
      function: chord.function,
      quality: chord.quality,
      bass: chord.bass,
      harmonicTag: chord.harmonicTag,
    });
  };

  // Save a piano voicing onto a chord placement. Stores octave-aware
  // offset/hand entries from the chord root (key-agnostic). Mirrors
  // handleChordBeatsChange; no barLayout reconcile needed since a
  // voicing doesn't change bar occupancy. Undoable via the stack.
  const handleChordVoicingChange = async (
    placementId: string,
    voicing: VoicingEntry[],
    voicingPatternId?: string,
  ) => {
    const { placements, realPlacementId } = ensurePlacementsForOp(placementId);
    // Always write voicingPatternId (undefined for a hand-edit) so the whole
    // chordPlacements array — replaced wholesale by commit — carries the
    // current provenance, clearing any stale pattern id.
    const next = updateChordPlacement(placements, realPlacementId, {
      voicing,
      voicingPatternId,
    });
    await commit({ chordPlacements: next });
  };

  const handleChordVoicingPinsChange = async (
    placementId: string,
    pinnedVoicingIds: string[],
  ) => {
    const { placements, realPlacementId } = ensurePlacementsForOp(placementId);
    const next = updateChordPlacement(placements, realPlacementId, {
      pinnedVoicingIds,
    });
    await commit({ chordPlacements: next });
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
    offbeat?: boolean,
  ) => {
    const { placements, realPlacementId } = ensurePlacementsForOp(placementId);
    const moved = moveChordPlacement(placements, realPlacementId, barIndex, beatPos);
    // `offbeat` is set explicitly rather than left alone, so dragging a
    // chord from an "and" back onto a beat clears the flag.
    const next = moved.map(p =>
      p.id === realPlacementId
        ? { ...p, ...(offbeat ? { offbeat: true } : { offbeat: undefined }) }
        : p,
    );
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
  const handleSubmitLyricLines = async (text: string) => {
    // Migrated songs append to the song-level store. Raw text in,
    // parsed once — the drawer's paste box does exactly the same, so
    // there is one parsing path rather than two.
    if (songLyricsActive && songLyricLines && onSongLyricsChange) {
      const rows = parseLyricSheet(text);
      if (rows.length === 0) return;
      await onSongLyricsChange([
        ...songLyricLines,
        ...linesFromParsedRows(rows),
      ]);
      return;
    }
    // Pre-migration fallback, for a song whose fold hasn't run yet.
    const fresh: LyricLine[] = tokenizeLyricLines(text).map(words => ({
      id: crypto.randomUUID(),
      words,
      startBar: 0,
      startBeat: 0,
      endBar: 0,
      endBeat: 0,
    }));
    await commitLyricLines([...lyricLines, ...fresh]);
  };

  // Syllable edit actions (rev 3). Each is a one-line application of a
  // pure helper — the helpers own the invariants, these just persist.
  const withSongLyrics = (
    fn: (lines: SongLyricLine[]) => SongLyricLine[],
  ): (() => Promise<void>) | undefined => {
    if (!songLyricsActive || !songLyricLines || !onSongLyricsChange) {
      return undefined;
    }
    return async () => {
      const next = fn(songLyricLines);
      if (next === songLyricLines) return;
      await onSongLyricsChange(next);
    };
  };

  const handleSyllableSplit = songLyricsActive
    ? async (syllableId: string, splitAt: number) => {
        await withSongLyrics(lines => splitSyllable(lines, syllableId, splitAt))?.();
      }
    : undefined;

  const handleSyllableJoin = songLyricsActive
    ? async (syllableId: string) => {
        await withSongLyrics(lines => joinSyllables(lines, syllableId))?.();
      }
    : undefined;

  const handleSyllableChange = songLyricsActive
    ? async (syllableId: string, nextText: string) => {
        await withSongLyrics(lines =>
          setSyllableText(lines, syllableId, nextText),
        )?.();
      }
    : undefined;

  const handleSyllableUnplace = songLyricsActive
    ? async (syllableId: string) => {
        await withSongLyrics(lines => unplaceSyllable(lines, syllableId))?.();
      }
    : undefined;

  /** Return a whole line to the tray, keeping its text. The
   *  non-destructive alternative to deleting it. */
  const handleUnplaceLine = songLyricsActive
    ? async (lineId: string) => {
        if (!songLyricLines || !onSongLyricsChange) return;
        const before = songLyricLines;
        const next = unplaceLine(before, lineId);
        if (next === before) return;
        await onSongLyricsChange(next);
        toast({
          message: 'Line un-placed — back in the tray.',
          variant: 'success',
          action: {
            label: 'Undo',
            onClick: async () => {
              await onSongLyricsChange(before);
            },
          },
        });
      }
    : undefined;

  const handleDeleteLyricLine = async (lineId: string) => {
    if (songLyricsActive && songLyricLines && onSongLyricsChange) {
      const target = songLyricLines.find(l => l.id === lineId);
      const placed = target ? lineStatus(target).placed : 0;
      // Deleting a line that carries placed work is destructive and,
      // until lyric writes join the undo stack, irreversible through
      // the toolbar. Confirm before it, and hand back an Undo after —
      // the × sits next to the tray row a user reaches for when they
      // meant "un-place", which is exactly how this went wrong.
      if (placed > 0) {
        const ok = window.confirm(
          `This line has ${placed} placed syllable${placed === 1 ? '' : 's'} — ` +
            `delete anyway? "Un-place all" returns it to the tray instead.`,
        );
        if (!ok) return;
      }
      const before = songLyricLines;
      await onSongLyricsChange(before.filter(l => l.id !== lineId));
      toast({
        message: 'Lyric line deleted.',
        variant: 'success',
        action: {
          label: 'Undo',
          onClick: async () => {
            await onSongLyricsChange(before);
          },
        },
      });
      return;
    }
    await commitLyricLines(lyricLines.filter(l => l.id !== lineId));
  };

  // Per-section time signature override (step 8). `null` clears the
  // override so the section falls back to the song-level default.
  // commit() routes the undefined-clear through onReplace so the
  // field actually goes back to undefined in storage.
  /** Words on beats that a new signature would delete. */
  const wordsOffNewSignature = (nextSignature: string | undefined) => {
    if (!songLyricsActive || !songLyricLines) return [];
    const nextBeats = parseTimeSignature(
      nextSignature ?? song.timeSignature ?? '4/4',
    ).beatsPerBar;
    return anchorsMatching(
      songLyricLines,
      a => a.sectionId === section.id && a.beatPos >= nextBeats,
    );
  };

  const [confirmSignature, setConfirmSignature] = useState<{
    value: string | undefined;
  } | null>(null);

  const handleTimeSignatureChange = async (next: string | null) => {
    const cleaned =
      next === null || next.trim() === '' ? undefined : next.trim();
    if ((sectionRef.current.timeSignature ?? undefined) === cleaned) return;
    if (wordsOffNewSignature(cleaned).length > 0) {
      setConfirmSignature({ value: cleaned });
      return;
    }
    await performSignatureChange(cleaned);
  };

  const performSignatureChange = async (cleaned: string | undefined) => {
    if (songLyricsActive && songLyricLines && onSongLyricsChange) {
      // Only beats that stop existing are un-placed. A word on beat 2
      // of a bar going 4/4 → 3/4 stays exactly where it is; a word on
      // beat 4 has nowhere to be.
      const nextBeats = parseTimeSignature(
        cleaned ?? song.timeSignature ?? '4/4',
      ).beatsPerBar;
      const cleared = unplaceAnchorsMatching(
        songLyricLines,
        a => a.sectionId === section.id && a.beatPos >= nextBeats,
      );
      if (cleared !== songLyricLines) await onSongLyricsChange(cleared);
    }
    await commit({ timeSignature: cleaned });
  };

  // Tap-to-add a chord on an empty beat slot. Materializes the
  // section to bar-anchored on the first add (so future ops route
  // through the new model end-to-end). The new placement gets a
  // fresh uuid + a one-BEAT duration; the bar-layout reconcile flips
  // the containing bar from 'empty' → 'chord' if needed.
  //
  // One beat is 2 slots with eighths on. A new chord should land the
  // width it has always landed at — the eighths move added positions,
  // it did not make the default chord half as long.
  const handleChordAdd = async (
    barIndex: number,
    beatPos: number,
    chord: ChordFunction,
    offbeat?: boolean,
  ) => {
    const sec = sectionRef.current;
    const placements =
      sec.chordPlacements !== undefined
        ? sec.chordPlacements
        : materializeChordPlacements(sec, beatsPerBar, eighths);
    const newPlacement: ChordPlacement = {
      id: crypto.randomUUID(),
      arrangementId: activeArrangementId,
      barIndex,
      beatPos,
      beats: eighths ? 2 : 1,
      chord,
      // The chord lands on the slot that was TAPPED. Without this an
      // "and" slot could be tapped and the chord would arrive on the
      // beat beside it.
      ...(offbeat ? { offbeat: true as const } : {}),
    };
    const next = addChordPlacement(placements, newPlacement);
    const patch: Partial<SongSection> = { chordPlacements: next };
    const reconciled = reconcileBarLayout(sec.barLayout, next);
    if (reconciled) patch.barLayout = reconciled;
    await commit(patch);
  };

  // Lead-sheet → ET pipeline (step 9). Opens the inline confirmation
  // popover; the actual add fires from `handleConfirmAddProgression`
  // below. Only patterns with an ET catalog mapping are addable.
  // Resets the label draft each time so successive adds don't inherit
  // stale text.
  const beginAddProgression = (m: PatternMatch) => {
    if (!m.etCatalogId) return;
    setAddingPattern({ etCatalogId: m.etCatalogId, numerals: m.numerals });
    setAddLabelDraft('');
  };

  const cancelAddProgression = () => {
    setAddingPattern(null);
    setAddLabelDraft('');
  };

  const handleConfirmAddProgression = async () => {
    const pending = addingPattern;
    if (!pending) return;
    const id = pending.etCatalogId;
    const trimmed = addLabelDraft.trim();
    // Display-only, like the two renders above: this reaches a toast
    // message and nothing else. The ET catalog's identity is
    // `etCatalogId`, and the only string persisted is the user's own
    // typed label, so notating this cannot leak a notation-specific
    // string into stored data.
    const patternLabel = pending.numerals
      .map(n => patternNumeralToDisplay(n, notationMode, song.key))
      .join(' → ');
    await setAddedFromRepertoire(id, true);
    if (trimmed !== '') {
      await setEtCustomLabel(id, trimmed);
    }
    setAddingPattern(null);
    setAddLabelDraft('');
    toast({
      message: `Added "${trimmed || patternLabel}" to ET practice`,
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

  const handleWordChange = async (
    lineId: string,
    wordIndex: number,
    nextText: string,
  ) => {
    const target = lyricLines.find(l => l.id === lineId);
    if (!target) return;
    const updated = setWordText(target, wordIndex, nextText);
    if (updated === target) return;
    await commitLyricLines(lyricLines.map(l => (l.id === lineId ? updated : l)));
  };

  // --- Bar add / delete / reorder ---------------------------------
  // Bar layout is the source of truth once any bar operation has
  // happened: `section.barLayout: ('chord' | 'empty')[]` lists the
  // kind of each bar position. Before the first operation, layout is
  // derived from chord placements + the legacy `barCount` padding.
  const allBars = useMemo(
    () => deriveBarGrid(section, activeArrangementId, beatsPerBar, eighths),
    // `eighths` decides how many positions a bar has, so leaving it out
    // meant toggling it mid-session kept rendering the grid derived
    // under the old setting until something else happened to change.
    [section, activeArrangementId, beatsPerBar, eighths],
  );

  /**
   * How many bars the grid will actually render once this bar is
   * deleted — DERIVED, not `barLayout.length`.
   *
   * The two differ, and assuming otherwise un-places words that still
   * have a home. `deriveBarGridAnchored` sizes the section as
   * `max(highest placement's bar + 1, barCount, barLayout.length)`, so
   * chord placements PIN the bar count: splice an empty bar out of the
   * middle and the layout shrinks while the rendered grid does not.
   *
   * Deriving from the post-delete section is also what keeps this
   * agreeing with the beat axis, which sizes sections the same way.
   */
  const barCountNow = (): number => allBars.length;

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

  /**
   * Words a bar delete would leave homeless. Read from the SONG store —
   * the old count came from `section.lyricLines`, the legacy field, so
   * a migrated song was warned about nothing while its real syllables
   * were silently orphaned.
   *
   * TWO groups, not one, and the second is easy to miss. Deleting a bar
   * removes that bar — and it also shrinks the section, so an anchor on
   * the old LAST bar index now addresses nothing. Because anchors
   * deliberately do not shift, that anchor does not follow anything
   * down; it simply stops resolving.
   *
   * Everything between keeps its index and stays exactly where the user
   * put it, which does mean it may now sit under a different chord.
   * That is the intended trade: visible and fixable beats silently
   * relocated.
   */
  /** Chords this delete will remove, across every arrangement. */
  const chordsInBar = (barIndex: number) => {
    const sec = sectionRef.current;
    const placements =
      sec.chordPlacements ?? materializeChordPlacements(sec, beatsPerBar, eighths);
    return placements.filter(p => p.barIndex === barIndex);
  };

  /** Words in the deleted bar. BLANKET — every word placed here goes
   *  back to the drawer, with no analysis of what merely shifted.
   *  Words in other bars keep their bar number and do not un-place,
   *  even though the chords under them close up: seeing the
   *  misalignment and fixing it by hand beats the app clearing work. */
  const homelessAfterBarDelete = (barIndex: number) => {
    if (!songLyricsActive || !songLyricLines) return [];
    return anchorsMatching(
      songLyricLines,
      a => a.sectionId === section.id && a.barIndex === barIndex,
    );
  };

  const [confirmDeleteBar, setConfirmDeleteBar] = useState<number | null>(null);

  const handleDeleteBar = async (barIndex: number) => {
    // ANY bar is deletable, not just chord-free ones. The case that
    // most needs it is a section transcribed as five bars that is
    // actually four — and the spare bar has chords in it.
    if (barIndex < 0 || barIndex >= barCountNow()) return;
    if (chordsInBar(barIndex).length + homelessAfterBarDelete(barIndex).length > 0) {
      setConfirmDeleteBar(barIndex);
      return;
    }
    await performDeleteBar(barIndex);
  };

  const performDeleteBar = async (barIndex: number) => {
    const sec = sectionRef.current;
    if (barIndex < 0 || barIndex >= barCountNow()) return;

    const layout = materializeBarLayout();
    if (barIndex < layout.length) layout.splice(barIndex, 1);

    // Chords close up; the bar genuinely disappears. Without this the
    // placements pin the bar count and the delete is a silent no-op.
    const before =
      sec.chordPlacements ?? materializeChordPlacements(sec, beatsPerBar, eighths);
    const placements = deleteBarFromPlacements(before, barIndex);
    // A bar delete removes SEVERAL chords, across every arrangement —
    // `deleteBarFromPlacements` spans them all because a bar is
    // structural. So every one of their annotations goes with them.
    const deletedIds = before
      .filter(p => p.barIndex === barIndex)
      .map(p => p.id);
    const prunedView = pruneDeletedPlacements(
      sequenceView,
      deletedIds,
      sequenceOrder,
    );
    const viewPatch: Partial<SongSection> =
      prunedView === sequenceView ? {} : { sequenceView: prunedView };

    if (songLyricsActive && songLyricLines && onSongLyricsChange) {
      // Only the deleted bar's words. Everything after keeps its bar
      // number and stays placed — often now against a different chord,
      // which is intended and visible.
      const cleared = unplaceAnchorsMatching(
        songLyricLines,
        a => a.sectionId === section.id && a.barIndex === barIndex,
      );
      if (cleared !== songLyricLines) await onSongLyricsChange(cleared);
      await commit({
        barLayout: layout,
        chordPlacements: placements,
        ...viewPatch,
      });
      return;
    }

    // Pre-migration path: legacy lines are range-based, so lines that
    // touch the bar are dropped and later ranges re-indexed.
    const touchesBar = (l: LyricLine): boolean =>
      l.startBar === barIndex ||
      l.endBar === barIndex ||
      (l.startBar < barIndex && l.endBar > barIndex);
    const nextLyrics = lyricLines
      .filter(l => !touchesBar(l))
      .map(l => ({
        ...l,
        startBar: l.startBar > barIndex ? l.startBar - 1 : l.startBar,
        endBar: l.endBar > barIndex ? l.endBar - 1 : l.endBar,
      }));
    await commit({
      barLayout: layout,
      chordPlacements: placements,
      lyricLines: nextLyrics,
      ...viewPatch,
    });
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

  // Every draggable that targets a `beat:` drop zone.
  const isLyricDragId = (id: string): boolean =>
    id.startsWith('staged:') ||
    id.startsWith('placed:') ||
    id.startsWith('pending:') ||
    id.startsWith('lineStart:') ||
    id.startsWith('lineEnd:') ||
    id.startsWith('word:') ||
    id.startsWith('syl:');

  // What's being dragged, for the DragOverlay preview and for telling
  // the beat cells to show their drop-target treatment.
  const [activeLyricDrag, setActiveLyricDrag] = useState<{
    kind: 'syllable' | 'line';
    text: string;
  } | null>(null);

  // Live cursor position, captured straight off the native event.
  // dnd-kit derives its own pointer coordinates as
  // `activationCoordinates + translate`, which is a bookkeeping chain
  // that has to stay in sync with scroll; this is the ground truth.
  const livePointerRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!activeLyricDrag) return;
    const onMove = (e: PointerEvent) => {
      livePointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onMove, { passive: true, capture: true });
    return () => {
      window.removeEventListener('pointermove', onMove, { capture: true });
      livePointerRef.current = null;
    };
  }, [activeLyricDrag]);

  // Recompute the drop target whenever the grid moves under the cursor.
  //
  // dnd-kit computes collisions inline in DndContext's render body, so
  // they refresh on any re-render — but during scroll the pointer is
  // stationary, nothing re-renders, and the target freezes at whatever
  // it last resolved to, then rides the page away from the cursor.
  //
  // This watches the SECTION'S OWN position each frame rather than
  // listening for scroll events. Scroll listeners have to guess which
  // element scrolls; a window listener misses inner containers, a
  // capture listener still misses layout shifts, and neither sees
  // dnd-kit's auto-scroll if it moves an ancestor we didn't subscribe
  // to. Watching the rendered geometry directly catches every cause,
  // because the thing that actually invalidates a drop target is the
  // grid moving relative to the viewport — whatever caused it.
  //
  // Costs one getBoundingClientRect per frame, and only while a lyric
  // drag is in flight.
  const [, setDragTick] = useState(0);
  useEffect(() => {
    if (!activeLyricDrag) return;
    let raf = 0;
    let lastTop: number | null = null;
    const check = () => {
      const node = document.getElementById(`section-${section.id}`);
      const top = node ? Math.round(node.getBoundingClientRect().top) : null;
      if (top !== lastTop) {
        lastTop = top;
        setDragTick(t => t + 1);
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [activeLyricDrag, section.id]);

  // --- tap-to-place arming (step 6a; LIFTED in 6b) -----------------
  // The armed syllable now lives in SongDetailView, ABOVE the
  // per-section DndContexts, so a tap can arm in this section and place
  // in another. Three things moved with it: the reducer, the
  // armed-syllable-vanished cleanup, and the tap-outside listener —
  // one armed state deserves exactly one of each, where per-section
  // copies would fire N times over the same state.
  //
  // What deliberately did NOT move is everything keyed to a CELL rather
  // than to the armed syllable: tryPlaceSyllable, refusePlacement and
  // the rejected-cell shake below. A beat-cell tap always fires on the
  // section that OWNS the cell — BeatDropSlot calls this section's
  // onBeatCellTap, which stamps section.id — so refusal feedback is
  // already delivered to the right grid by construction.
  // Cross-section-ness lives entirely in WHICH SYLLABLE IS ARMED, never
  // in which section receives the tap. tryPlaceSyllable additionally
  // has three drag callers that all stamp section.id, and drag stays
  // intra-section, so lifting it would strand them.
  const handleSyllableTap = onArmSyllable;

  /** Tapping a beat cell places the armed syllable there, through the
   *  same guarded path drag uses. No legality is computed before the
   *  tap — every cell is offered, and checkPlacementOrder is the only
   *  thing that decides. */
  const handleBeatCellTap = songLyricsActive
    ? async (
        barIndex: number,
        beatPos: number,
        cellRect?: DOMRect,
        offbeat?: boolean,
      ) => {
        // A line placement outranks syllable arming — the reducer
        // guarantees they are mutually exclusive, so this branch is a
        // dispatch, not a precedence rule.
        if (awaitingLine) {
          await handleLineEdgeTap(
            awaitingLine,
            barIndex,
            beatPos,
            cellRect,
            offbeat,
          );
          return;
        }
        if (!armedSyllableId) return;
        const result = await tryPlaceSyllable(armedSyllableId, {
          sectionId: section.id,
          barIndex,
          beatPos,
          ...(offbeat ? { offbeat: true } : {}),
        });
        if (result === null) {
          onSyllablePlaced?.();
          return;
        }
        // A SHAKE ALWAYS COMES WITH A MESSAGE. Two silent paths used to
        // exist here and both were indistinguishable, to the user, from
        // the message being broken:
        //
        //  · `off-axis` showed nothing, on the grounds that it is a
        //    data problem rather than an ordering mistake. True, but
        //    silence doesn't communicate that — it communicates
        //    "nothing happened". It gets its own honest wording now.
        //  · a missing `cellRect` dropped the message entirely. A
        //    measurement being unavailable is no reason to withhold
        //    feedback; the overlay parks at the screen edge when it
        //    has nothing to anchor to.
        //
        // `unavailable` cannot reach here — tryPlaceSyllable returns it
        // before it ever calls refusePlacement, so it produces no shake
        // either.
        onRefusalNotice?.(
          result === 'off-axis' ? 'off-axis' : 'order',
          cellRect,
        );
      }
    : undefined;

  /** One beat of a line placement: the tapped cell becomes the line's
   *  START (beat one, armed from the drawer) or its END (beat two).
   *
   *  Reuses the marker mechanic untouched — `markerTargetSyllable`
   *  takes the same `edge` the arming state carries and is the same
   *  lookup the marker drags perform, and the write goes through the
   *  same guarded path. Only the way it is REACHED is new, so both
   *  markers keep working as shortcuts for anyone who knows they are
   *  there.
   *
   *  Same cell for both edges is legal and stacks the whole line there
   *  — the guard treats equal global positions as one cell, so no
   *  special case is needed here. */
  const handleLineEdgeTap = async (
    pending: { lineId: string; edge: 'start' | 'end' },
    barIndex: number,
    beatPos: number,
    cellRect?: DOMRect,
    offbeat?: boolean,
  ) => {
    if (!songLyricLines) return;
    const { lineId, edge } = pending;
    const targetId = markerTargetSyllable(songLyricLines, lineId, edge);
    // A one-word line has no distinct end; beat one already finished it.
    if (!targetId) {
      onSyllablePlaced?.();
      return;
    }
    // Snapshot BEFORE beat one's write — the only moment the line's
    // prior anchors still exist. Beat two's snapshot was already taken
    // when beat one landed, so it must not be overwritten here.
    const snapshot =
      edge === 'start'
        ? (songLyricLines.find(l => l.id === lineId)?.syllables ?? []).map(s => ({
            ...s,
          }))
        : null;
    const result = await tryPlaceSyllable(targetId, {
      sectionId: section.id,
      barIndex,
      beatPos,
      ...(offbeat ? { offbeat: true } : {}),
    });
    if (result === null) {
      // Beat one advances to beat two; beat two completes the gesture.
      if (edge === 'start' && snapshot) onLineHeadPlaced?.(lineId, snapshot);
      else onSyllablePlaced?.();
      return;
    }
    // A refused end keeps the wait alive so the next cell can be tried
    // straight away — the same contract syllable arming has, and it
    // gets the same always-a-message treatment.
    if (result !== 'unavailable') {
      onRefusalNotice?.(
        result === 'off-axis' ? 'off-axis' : 'order',
        cellRect,
      );
    }
  };

  // A cell that just refused a drop. Cleared on a timer so the shake
  // plays once; re-keyed per rejection so repeated refusals re-fire.
  const [rejectedCell, setRejectedCell] = useState<string | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (rejectTimer.current) clearTimeout(rejectTimer.current);
    },
    [],
  );
  const refusePlacement = (cell: {
    sectionId: string;
    barIndex: number;
    beatPos: number;
    offbeat?: boolean;
  }) => {
    if (rejectTimer.current) clearTimeout(rejectTimer.current);
    setRejectedCell(null);
    // One frame at null so the animation restarts on a repeat refusal.
    requestAnimationFrame(() => setRejectedCell(cellKey(cell)));
    rejectTimer.current = setTimeout(() => setRejectedCell(null), 400);
  };

  // The refusal MESSAGE lives at song level (SongDetailView), unlike
  // the shake above. The shake is a class on one cell and is correctly
  // per-section; the message is a single floating overlay, and two
  // sections each owning one would put two copies on screen when
  // refusals land in different sections inside the dismiss window —
  // easy to hit now that arming survives a refusal and spans sections.
  //
  // Drag refusals deliberately stay shake-only, exactly as before: a
  // drag has no tapped node to measure, and it never showed a message.

  /** Attempt a placement, refusing anything that would put the line's
   *  syllables out of text order.
   *
   *  Returns `null` when it landed, otherwise the violation — tap
   *  placement needs the reason so it can distinguish a user ordering
   *  error from `off-axis`, which is a data problem and should not be
   *  reported as one. Drag ignores the return value, so its behaviour
   *  is unchanged. */
  const tryPlaceSyllable = async (
    syllableId: string,
    cell: {
      sectionId: string;
      barIndex: number;
      beatPos: number;
      offbeat?: boolean;
    },
  ): Promise<OrderViolation | 'unavailable' | null> => {
    if (!songLyricLines || !onSongLyricsChange || !beatAxis) return 'unavailable';
    const violation = checkPlacementOrder(songLyricLines, syllableId, cell, beatAxis);
    if (violation) {
      refusePlacement(cell);
      return violation;
    }
    await onSongLyricsChange(
      placeSyllable(songLyricLines, syllableId, cell, beatAxis),
    );
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!isLyricDragId(id)) {
      setActiveLyricDrag(null);
      return;
    }
    if (id.startsWith('syl:') && songLyricLines) {
      const found = findSyllable(songLyricLines, id.slice('syl:'.length));
      setActiveLyricDrag(
        found ? { kind: 'syllable', text: found.syllable.text } : null,
      );
      return;
    }
    if (id.startsWith('pending:')) {
      const lineId = id.slice('pending:'.length);
      const songLine = songLyricLines?.find(l => l.id === lineId);
      if (songLine) {
        setActiveLyricDrag({ kind: 'line', text: songLine.text });
        return;
      }
      const legacyLine = lyricLines.find(l => l.id === lineId);
      setActiveLyricDrag(
        legacyLine ? { kind: 'line', text: legacyLine.words.join(' ') } : null,
      );
      return;
    }
    if (
      songLyricLines &&
      (id.startsWith('lineStart:') || id.startsWith('lineEnd:'))
    ) {
      const edge = id.startsWith('lineStart:') ? 'start' : 'end';
      const lineId = id.slice((edge === 'start' ? 'lineStart:' : 'lineEnd:').length);
      const syllableId = markerTargetSyllable(songLyricLines, lineId, edge);
      const found = syllableId ? findSyllable(songLyricLines, syllableId) : null;
      setActiveLyricDrag(
        found ? { kind: 'syllable', text: found.syllable.text } : null,
      );
      return;
    }
    setActiveLyricDrag({ kind: 'syllable', text: '' });
  };

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
    } else if (isLyricDragId(activeId)) {
      allowed = args.droppableContainers.filter(d =>
        String(d.id).startsWith('beat:'),
      );
      // POINTER-BASED, deliberately. `closestCenter` compares the
      // DRAGGED ELEMENT'S rect centre against each cell's centre and
      // never looks at the cursor (verified in @dnd-kit/core's source:
      // it destructures `collisionRect`, not `pointerCoordinates`).
      // With lyric chips that reads as a one-cell lag at every boundary
      // — you have to push past a cell before it registers — and with
      // the full-width pending strip, whose rect centre sits at the
      // middle of the whole grid, the target lands bars away from the
      // cursor. Both were measured in the browser before this change.

      // A KeyboardSensor drag supplies no pointer at all, so
      // nearest-centre is the only thing available.
      const point = livePointerRef.current ?? args.pointerCoordinates;
      if (!point) {
        return closestCenter({ ...args, droppableContainers: allowed });
      }

      // ONE path: the cell nearest the cursor, by live geometry.
      //
      // A `document.elementsFromPoint` hit-test used to run in front of
      // this, described as authoritative. Instrumentation showed it
      // never once succeeded across ~1600 collision calls in a real
      // drag — during a lyric drag the cursor is reliably NEAR a beat
      // cell rather than inside one, so every ring ever seen came from
      // this fallback. Dead code claiming to be the source of truth is
      // worse than none, and two paths answering one question is how
      // this drifted repeatedly.
      //
      // A pointer inside a cell scores distance 0, so this subsumes the
      // hit-test rather than approximating it. Beyond POINTER_SNAP_PX
      // there is no target: the drop is a no-op and no ring lights,
      // which reads correctly as "not over a cell".
      return nearestCellToPointer(point, allowed);
    }
    return closestCenter({ ...args, droppableContainers: allowed });
  };

  // Default range on placement: 1 bar — drop sets the start to the
  // drop target and the end to the last beat of that same bar.
  //
  // LEGACY PATH ONLY. The song-owned model dropped this guess (see the
  // `pending:` branch in handleDragEnd) but the legacy model can't:
  // a LyricLine has no way to express "placed at the start, end not
  // chosen yet" — start == end == (0,0) is its sentinel for "still in
  // the tray" — so a legacy placement has to invent some end.
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
        const slot = parseSlotDropId(overId);
        if (!slot) return;
        await handleChordMoveToEmpty(
          fromPlacementId,
          slot.barIndex,
          slot.beatPos,
          slot.offbeat,
        );
        return;
      }
      return;
    }

    // Lyric drags all target beat drop zones.
    //
    // THE OFFBEAT COMES FROM THE SHARED PARSER. Open-coding
    // `parseInt(beatStr, 10)` here read "2+" as 2 and dropped the
    // offbeat SILENTLY — not a refusal, a word landing on the cell next
    // door. The chord branch above had a correct copy of the same
    // parse; this one had a wrong one, which is the argument for there
    // being exactly one.
    if (!overId.startsWith('beat:')) return;
    const slot = parseSlotDropId(overId);
    if (!slot) return;
    const dropBar = slot.barIndex;
    const dropBeat = slot.beatPos;
    const at = slot.offbeat ? { offbeat: true as const } : {};

    // --- song-owned syllables (rev 3) ---------------------------------
    // A drop writes exactly one syllable's anchor. `placeSyllable`
    // appends to the target cell, so nothing already there is displaced
    // — the no-ripple rule holds by construction, not by convention.
    if (activeId.startsWith('syl:')) {
      if (!songLyricsActive) return;
      await tryPlaceSyllable(activeId.slice('syl:'.length), {
        sectionId: section.id,
        barIndex: dropBar,
        beatPos: dropBeat,
        ...at,
      });
      return;
    }

    // Dropping a line from the tray places its FIRST unit and nothing
    // else. The remaining units stay unplaced, so the line stays in the
    // tray carrying an n/total badge until the user places more.
    //
    // It used to also anchor the last unit at the end of the drop bar,
    // inheriting the legacy "default range = one bar" behaviour. That
    // is the app guessing phrase length, and it guesses wrong for
    // anything longer than a bar — silently inventing a placement the
    // user then has to notice and undo. Where the line ends is the
    // user's call: via the end marker (step 5) or tap-to-place (6a).
    //
    // Ghosts stay absent until a second unit is placed, because the
    // provisional spread needs two endpoints to interpolate between —
    // it never extrapolates. A single-unit line is simply fully placed.
    if (activeId.startsWith('pending:') && songLyricsActive) {
      if (!songLyricLines || !onSongLyricsChange) return;
      const lineId = activeId.slice('pending:'.length);
      const target = songLyricLines.find(l => l.id === lineId);
      const first = target?.syllables?.[0];
      if (!first) return;
      // Snapshot BEFORE the write — this is the only moment the line's
      // prior anchors still exist, and cancelling beat two restores
      // exactly this. A resumed partial line may carry real work here.
      const snapshot = (target?.syllables ?? []).map(s => ({ ...s }));
      const result = await tryPlaceSyllable(first.id, {
        sectionId: section.id,
        barIndex: dropBar,
        beatPos: dropBeat,
        ...at,
      });
      // BEAT TWO. A tray drop is half a gesture: it places the head and
      // nothing else, and until now left the user hunting for a dimmed
      // marker to finish it — with no second path, since re-dragging
      // just re-places the head. The app now asks for the end itself.
      // Armed unconditionally on a tray drop, which is also what makes
      // re-dragging an already-partial line the RECOVERY path rather
      // than the dead end it is today.
      if (result === null) onLineHeadPlaced?.(lineId, snapshot);
      return;
    }

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

    // §A1: a marker places exactly ONE unit — the line's first for ▸,
    // its last for ◂ — and moves nothing else. The legacy markers below
    // moved a line's range anchors and cleared wordOffsets, re-spreading
    // every word between them; that is the behaviour this replaces.
    if (
      songLyricsActive &&
      (activeId.startsWith('lineStart:') || activeId.startsWith('lineEnd:'))
    ) {
      if (!songLyricLines) return;
      const edge = activeId.startsWith('lineStart:') ? 'start' : 'end';
      const lineId = activeId.slice(
        (edge === 'start' ? 'lineStart:' : 'lineEnd:').length,
      );
      const syllableId = markerTargetSyllable(songLyricLines, lineId, edge);
      if (!syllableId) return;
      await tryPlaceSyllable(syllableId, {
        sectionId: section.id,
        barIndex: dropBar,
        beatPos: dropBeat,
        ...at,
      });
      return;
    }

    // The LEGACY marker/word paths below deliberately ignore `at`. They
    // drive the pre-rev-3 `lyricLines` model, which has no offbeat
    // concept at all, so there is nothing to carry — and they are only
    // reachable when `songLyricsActive` is false, i.e. on data that
    // predates both this model and eighths.
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
  // Reads the bar grid (bar-anchored chords are the source of truth
  // post-redesign), in left-to-right order, keeping each chord's bar
  // index for position display.
  const detectionSequence = useMemo(() => {
    const seq: {
      chord: ChordFunction;
      barIndex: number;
      placementId: string;
    }[] = [];
    for (const bar of allBars) {
      for (const cell of bar.cells) {
        // Tied continuations are skipped, so one token is exactly one
        // placement — which is what lets the strip's annotations anchor
        // to `placementId` unambiguously.
        if (cell.tiedFromPrev) continue;
        seq.push({
          chord: cell.chord,
          barIndex: bar.index,
          placementId: cell.placementId,
        });
      }
    }
    return seq;
  }, [allBars]);

  // The sequence, rendered through `chordToDisplay` — the SAME call
  // every chord cell in the grid body makes, with the same notation
  // mode and the same key. One vocabulary across the screen.
  //
  // It used to call `toRomanToken`, which is a detector-interop helper:
  // plain-ASCII Roman with quality encoded in case, unconditional and
  // blind to the notation pref. So the strip read "ii · V · I" directly
  // above a grid reading "2min7 · 5maj · 1maj" — one screen, one set of
  // chords, two notations.
  //
  // Nothing about detection changes: `patternMatches` below builds
  // `DetectChord`s straight from `chord.function` / `chord.quality` and
  // never sees rendered text. This is display only.
  //
  // Coloured by the SAME `chordPalette` call the grid cells make, so a
  // 1maj token here is the same green as a 1maj cell. Uses the
  // palette's `text` — the colour the grid paints a chord LABEL with —
  // since a strip has no fill to carry the family. One call covers
  // every case the grid handles: unparsed falls to the neutral palette,
  // slash chords resolve to the bass family, and flat degrees pick up
  // their darkened twin, all inside `chordPalette`.
  const sequenceTokens = useMemo(() => {
    const map = new Map<string, { text: string; color: string }>();
    for (const s of detectionSequence) {
      map.set(s.placementId, {
        text: chordToDisplay(s.chord, notationMode, song.key),
        color: chordPalette(s.chord, isDark).text,
      });
    }
    return map;
  }, [detectionSequence, notationMode, song.key, isDark]);

  /** Live token order — the anchor set the view's annotations resolve
   *  against. Deliberately UNFILTERED: hiding is applied when phrases
   *  are built for rendering, never here, because `patternMatches`
   *  reads this list and detection must keep seeing the true grid. */
  const sequenceOrder = useMemo(
    () => detectionSequence.map(s => s.placementId),
    [detectionSequence],
  );

  const sequenceView = section.sequenceView ?? EMPTY_SEQUENCE_VIEW;

  const [sequenceEditing, setSequenceEditing] = useState(false);
  // An invisible editor is a trap, so collapsing the block leaves edit
  // mode. The annotations themselves are section data and are entirely
  // unaffected by a per-device collapse pref.
  useEffect(() => {
    if (patternsCollapsed) {
      setSequenceEditing(false);
      setSeqTarget(null);
    }
  }, [patternsCollapsed]);
  /** Which gap or token has its choices open. */
  const [seqTarget, setSeqTarget] = useState<
    { kind: 'gap' | 'token'; placementId: string } | null
  >(null);

  const commitSequenceView = async (next: SequenceView) => {
    // Legacy phrase-anchored sections carry SYNTHETIC placement ids
    // (`legacy:phraseId:beatId`) that materialisation replaces. Writing
    // the annotation and materialising in one commit — which is what
    // this used to do — orphaned the annotation in the same
    // transaction that saved it. `sequenceViewCommitPatch` carries it
    // across the id change; see sequenceAnchors.ts for why the remap
    // is positional rather than derived from the id.
    await commit(
      sequenceViewCommitPatch({
        section: sectionRef.current,
        beatsPerBar,
        eighths,
        activeArrangementId,
        legacyOrder: sequenceOrder,
        next,
      }),
    );
  };

  const handleSetBreak = async (
    afterPlacementId: string,
    kind: 'separator' | 'row',
  ) => {
    setSeqTarget(null);
    await commitSequenceView(
      setBreak(sequenceView, afterPlacementId, kind, sequenceOrder),
    );
  };

  const handleRemoveBreak = async (afterPlacementId: string) => {
    setSeqTarget(null);
    await commitSequenceView(
      removeBreak(sequenceView, afterPlacementId, sequenceOrder),
    );
  };

  /** `undefined` targets the final phrase, which has no break to hang
   *  its note on. */
  const handleSetPhraseNote = async (
    afterPlacementId: string | undefined,
    note: string,
  ) => {
    await commitSequenceView(
      setPhraseNote(sequenceView, afterPlacementId, note),
    );
  };

  const handleToggleHidden = async (placementId: string) => {
    setSeqTarget(null);
    await commitSequenceView(toggleHidden(sequenceView, placementId));
  };

  const phrases = useMemo(
    () => buildPhrases(sequenceOrder, sequenceView),
    [sequenceOrder, sequenceView],
  );

  // Pattern matches via flexible root-motion detection. The effective
  // harmonic tag (manual over auto) decides whether a chord is acting
  // as a secondary dominant and so can't fill a tonic/subdominant slot.
  // Shared with the Progressions drawer via `toDetectChords`, so the
  // two surfaces cannot report different patterns for the same chords.
  const patternMatches = useMemo(
    () => detectPatterns(toDetectChords(detectionSequence)),
    [detectionSequence],
  );

  const setSectionStage = async (next: SongSection['stage']) => {
    await commit({ stage: next });
  };

  const comparing = compareIds.length > 0;

  return (
    <div
      id={`section-${section.id}`}
      className={`rounded-lg ${
        playMode
          ? 'py-1 space-y-1'
          : `border p-3 space-y-3 ${
              section.hidden
                ? 'border-dashed opacity-70'
                : 'border-neutral-200 dark:border-neutral-800'
            }`
      } ${highlighted ? 'repertoire-flash' : ''} ${comparing ? 'bg-info/5' : ''}`}
    >
      {/* Header: name / stage / reorder / hide / delete. In play mode
          this collapses to a small muted section-name label above the
          grid; all editing controls are hidden. */}
      {playMode && (
        <div className="text-[12px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          {section.name}
        </div>
      )}
      {!playMode && (
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
          {reorderMode && (
            <>
              <button
                onClick={onMoveUp}
                disabled={!canMoveUp || !onMoveUp}
                title="move section up"
                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-base rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↑
              </button>
              <button
                onClick={onMoveDown}
                disabled={!canMoveDown || !onMoveDown}
                title="move section down"
                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-base rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↓
              </button>
            </>
          )}
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
      )}

      {section.hidden ? (
        <p className="text-xs text-neutral-500 italic">section hidden — won't show in your practice view.</p>
      ) : (
        <>
          {!playMode && (
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
          )}

          {/* Lead Sheet Redesign — bar-grid view + lyric placement.
              One DndContext owns chord sortable, pending-line drag,
              start/end marker drag, and per-word nudge drag. Dispatch
              by active.id prefix lives in `handleDragEnd` above. */}
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            // Beat-cell heights change DURING a lyric drag — pulling a
            // chip out of a stacked cell shrinks it and reflows the
            // whole row. The default `WhileDragging` strategy measures
            // droppables once at drag start, so those rects go stale in
            // exactly the drags that matter. `Always` re-measures.
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={handleDragStart}
            onDragEnd={async event => {
              setActiveLyricDrag(null);
              await handleDragEnd(event);
            }}
            onDragCancel={() => setActiveLyricDrag(null)}
          >
            <BarGridView
              song={song}
              section={section}
              activeArrangementId={activeArrangementId}
              onChordBeatsChange={handleChordBeatsChange}
              onChordTagChange={handleChordTagChange}
              onChordDelete={handleChordDelete}
              onChordVoicingChange={handleChordVoicingChange}
              onChordVoicingPinsChange={handleChordVoicingPinsChange}
              onCopyChord={handleCopyChord}
              copiedChord={copiedChord}
              chordsAreSortable
              lyricLines={lyricLines}
              cellIndex={cellIndex}
              lyricDragActive={activeLyricDrag !== null}
              rejectedCell={rejectedCell}
              markerIndex={markerIndex}
              lyricTrayCollapsed={lyricTrayCollapsed}
              onToggleLyricTray={onToggleLyricTray}
              armedSyllableId={armedSyllableId}
              awaitingLine={awaitingLine}
              promptAnchorCellKey={promptAnchorCellKey}
              onPromptAnchorNode={onPromptAnchorNode}
              onSyllableTap={songLyricsActive ? handleSyllableTap : undefined}
              onBeatCellTap={handleBeatCellTap}
              songLyricLines={songLyricLines}
              onSyllableSplit={handleSyllableSplit}
              onSyllableJoin={handleSyllableJoin}
              onSyllableChange={handleSyllableChange}
              onSyllableUnplace={handleSyllableUnplace}
              // EVERY line now. The tray shows unfinished ones by
              // default and puts finished ones behind a grouped reveal,
              // which it can only offer if it has them — and it needs
              // them because the tray can pick words now, so moving one
              // word of a finished line must not require the drawer.
              unplacedLines={songLyricsActive ? (songLyricLines ?? []) : undefined}
              onArmLine={onArmLine}
              onArmWord={onArmWord}
              onSetLineKind={onSetLineKind}
              onDuplicateLine={onDuplicateLine}
              onLineDelete={handleDeleteLyricLine}
              onLineUnplace={handleUnplaceLine}
              onAddBar={handleAddBar}
              onDeleteBar={handleDeleteBar}
              onBarReorder={handleBarReorder}
              onWordSplit={handleWordSplit}
              onWordJoin={handleWordJoin}
              onWordChange={handleWordChange}
              onUndo={handleUndo}
              canUndo={canUndo}
              onRedo={handleRedo}
              canRedo={canRedo}
              onTimeSignatureChange={handleTimeSignatureChange}
              onChordAdd={handleChordAdd}
              playMode={playMode}
            />

            {/* Step 6 lyric paste: each text line becomes a pending
                LyricLine in the bar grid's tray. Hidden in play mode. */}
            {!playMode && (
              <LyricStagingArea onSubmitText={handleSubmitLyricLines} />
            )}

            {/* The dragged item follows the pointer exactly instead of
                the source node translating in place. Two reasons: the
                pending strip is full-container-width, so translating it
                across the page is both ugly and misleading about what
                it will hit; and pulling a chip out of a stacked cell
                reflows the row it came from mid-drag. */}
            <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
              {activeLyricDrag ? (
                <span
                  className={
                    activeLyricDrag.kind === 'syllable'
                      ? 'pointer-events-none inline-block text-[10px] leading-tight italic px-1 rounded bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 ring-2 ring-fluent shadow-md'
                      : 'pointer-events-none inline-block max-w-[14rem] truncate text-[11px] px-2 py-1 rounded border border-fluent bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 shadow-md'
                  }
                >
                  {activeLyricDrag.text}
                </span>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Both warnings say what will actually happen, and both
              counts come from the SONG store. The old bar-delete
              confirm counted `section.lyricLines` — the legacy field —
              so a migrated song was warned about nothing while its
              real syllables were orphaned.
              A ConfirmDialog rather than the anchored-popup pattern
              deliberately: the anchored pattern's defining behaviour is
              dismiss-on-outside-tap, which is exactly what a
              destructive confirm must not do. */}
          <ConfirmDialog
            open={confirmDeleteBar !== null}
            title={`Delete bar ${(confirmDeleteBar ?? 0) + 1}?`}
            message={(() => {
              const bar = confirmDeleteBar ?? -1;
              const chords = chordsInBar(bar).length;
              const words = homelessAfterBarDelete(bar).length;
              const list = [
                chords > 0 && `${chords} chord${chords === 1 ? '' : 's'}`,
                words > 0 && `${words} placed word${words === 1 ? '' : 's'}`,
              ].filter(Boolean) as string[];
              return (
                <div className="space-y-2">
                  <p>This bar has {list.join(' and ')}.</p>
                  <p>
                    {chords > 0 && 'The chords are deleted. '}
                    {words > 0 &&
                      `The word${words === 1 ? '' : 's'} return to the lyrics drawer as unplaced text. `}
                    Chords in later bars close up; lyrics keep their bar
                    numbers and stay where you put them, so some may end
                    up against a different chord.
                  </p>
                  {/* Not guessable from a × on one bar. */}
                  <p className="text-neutral-500">
                    Bars are structural, so this removes the bar from
                    every arrangement of this section.
                  </p>
                </div>
              );
            })()}
            confirmLabel="Delete bar"
            onCancel={() => setConfirmDeleteBar(null)}
            onConfirm={async () => {
              const bar = confirmDeleteBar;
              setConfirmDeleteBar(null);
              if (bar !== null) await performDeleteBar(bar);
            }}
          />

          <ConfirmDialog
            open={confirmSignature !== null}
            title="Change the time signature?"
            message={
              <p>
                {wordsOffNewSignature(confirmSignature?.value).length} placed{' '}
                {wordsOffNewSignature(confirmSignature?.value).length === 1
                  ? 'word sits'
                  : 'words sit'}{' '}
                on beats this signature does not have. They return to the
                lyrics drawer as unplaced text; everything on the
                remaining beats stays where it is.
              </p>
            }
            confirmLabel="Change signature"
            variant="default"
            onCancel={() => setConfirmSignature(null)}
            onConfirm={async () => {
              const pending = confirmSignature;
              setConfirmSignature(null);
              if (pending) await performSignatureChange(pending.value);
            }}
          />


          {!playMode && sequenceOrder.length > 0 && !comparing && (
            <div className="flex flex-col gap-2 text-[11px] text-neutral-500 pt-1 border-t border-neutral-200 dark:border-neutral-800">
              {/* "Progression Patterns", not "Numerals" — the old label
                  described the notation the strip happened to use,
                  which stopped being true when the strip moved to the
                  grid's own vocabulary, and never described what the
                  block is FOR.
                  The whole block collapses as one unit: the strip and
                  the patterns list are a single bordered thing, and the
                  patterns list is the taller half, so collapsing only
                  the strip would save little of the space this is
                  meant to reclaim. */}
              {/* The edit control sits BESIDE the toggle, not inside
                  it: the header is one big tappable button, so a
                  control nested in it would toggle the section on the
                  way through. Same collision solved on syllable chips,
                  avoided here by not creating it. */}
              <div className="flex items-center gap-3">
                <SectionToggle
                  label="progression patterns"
                  expanded={!patternsCollapsed}
                  onToggle={onTogglePatterns}
                />
                {!patternsCollapsed && (
                  <button
                    type="button"
                    onClick={() => {
                      setSequenceEditing(v => !v);
                      setSeqTarget(null);
                    }}
                    aria-pressed={sequenceEditing}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      sequenceEditing
                        ? 'border-fluent bg-fluent/10 text-fluent'
                        : 'border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                    }`}
                  >
                    {sequenceEditing ? 'done' : 'edit'}
                  </button>
                )}
              </div>

              {!patternsCollapsed && (
                <>
              {/* The chord sequence, rendered through the SAME call the
                  grid cells use, so one vocabulary runs across the whole
                  screen. It used to render Roman numerals via
                  `toRomanToken` while the grid body showed 1maj / 5maj /
                  6min7 — the same information in two notations, a
                  handspan apart.
                  Renders through the notation MODE rather than hard-
                  coding numbers: pinning it to numbers would recreate
                  the same split in reverse for anyone reading in Roman
                  or concrete. */}
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="uppercase tracking-wide">sequence:</span>
                {/* Phrases, not one continuous run. A break renders as
                    a divider on the same line or as a wrap to the next;
                    hidden tokens are dropped HERE and nowhere else, so
                    the grid and pattern detection are untouched. */}
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono min-w-0">
                  {phrases.map((phrase, pi) => (
                    <Fragment key={phrase.endsAfterPlacementId ?? `tail-${pi}`}>
                      <span className="text-neutral-700 dark:text-neutral-200">
                        {phrase.placementIds.map((id, i) => {
                          const token = sequenceTokens.get(id);
                          return (
                            <span key={id}>
                              {i > 0 &&
                                (sequenceEditing ? null : (
                                  <span className="text-neutral-400"> · </span>
                                ))}
                              {/* The GAP before this token. Modelled on
                                  the syllable split popover's "tap
                                  between two letters" — a dashed target
                                  in the space itself — so the gesture
                                  is one the user already knows. */}
                              {sequenceEditing && i > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSeqTarget({
                                      kind: 'gap',
                                      placementId: phrase.placementIds[i - 1],
                                    })
                                  }
                                  aria-label={`break after ${
                                    sequenceTokens.get(phrase.placementIds[i - 1])
                                      ?.text ?? 'chord'
                                  }`}
                                  className="inline-block min-w-[10px] min-h-[20px] mx-0.5 align-middle rounded-sm border border-dashed border-neutral-300 dark:border-neutral-700 hover:bg-fluent/10 hover:border-fluent"
                                />
                              )}
                              <button
                                type="button"
                                disabled={!sequenceEditing}
                                onClick={() =>
                                  setSeqTarget({ kind: 'token', placementId: id })
                                }
                                style={{ color: token?.color }}
                                className={
                                  sequenceEditing
                                    ? 'rounded px-0.5 hover:bg-fluent/10'
                                    : 'cursor-default'
                                }
                              >
                                {token?.text || '—'}
                              </button>
                            </span>
                          );
                        })}
                      </span>
                      {phrase.endKind === 'separator' &&
                        (sequenceEditing ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSeqTarget({
                                kind: 'gap',
                                placementId: phrase.endsAfterPlacementId!,
                              })
                            }
                            aria-label="edit this break"
                            className="text-fluent px-1 rounded hover:bg-fluent/10"
                          >
                            |
                          </button>
                        ) : (
                          <span className="text-neutral-400" aria-hidden>
                            |
                          </span>
                        ))}
                      {(phrase.note || sequenceEditing) &&
                        phrase.placementIds.length > 0 && (
                          <PhraseNote
                            note={phrase.note}
                            editing={sequenceEditing}
                            /* RETURNED, not voided — see PhraseNote. */
                            onChange={next =>
                              handleSetPhraseNote(
                                phrase.endsAfterPlacementId,
                                next,
                              )
                            }
                          />
                        )}
                      {phrase.endKind === 'row' && sequenceEditing && (
                        <button
                          type="button"
                          onClick={() =>
                            setSeqTarget({
                              kind: 'gap',
                              placementId: phrase.endsAfterPlacementId!,
                            })
                          }
                          aria-label="edit this break"
                          className="text-fluent px-1 rounded hover:bg-fluent/10"
                        >
                          ⏎
                        </button>
                      )}
                      {phrase.endKind === 'row' && (
                        <span className="basis-full h-0" aria-hidden />
                      )}
                    </Fragment>
                  ))}
                </div>
                {seqTarget && (
                  <SequenceChoices
                    target={seqTarget}
                    label={sequenceTokens.get(seqTarget.placementId)?.text ?? ''}
                    hasBreak={sequenceView.breaks.some(
                      b => b.afterPlacementId === seqTarget.placementId,
                    )}
                    hidden={sequenceView.hidden.includes(seqTarget.placementId)}
                    onSetBreak={handleSetBreak}
                    onRemoveBreak={handleRemoveBreak}
                    onToggleHidden={handleToggleHidden}
                    onClose={() => setSeqTarget(null)}
                  />
                )}
              </div>

              {/* Pattern highlights — structural matches with bar
                  positions and quality-deviation notes. No nicknames. */}
              {patternMatches.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="uppercase tracking-wide">patterns:</span>
                  {patternMatches.map((m, idx) => {
                    const isAdded = m.etCatalogId
                      ? addedFromRepertoireSet.has(m.etCatalogId)
                      : false;
                    const barLabel =
                      m.startBar === m.endBar
                        ? `bar ${m.startBar + 1}`
                        : `bars ${m.startBar + 1}–${m.endBar + 1}`;
                    return (
                      <div
                        key={`${m.patternId}-${m.matchIndex}-${idx}`}
                        className="flex items-center gap-2 flex-wrap"
                      >
                        <span className="font-mono text-neutral-700 dark:text-neutral-200">
                          {m.numerals
                            .map(n => patternNumeralToDisplay(n, notationMode, song.key))
                            .join(' → ')}
                        </span>
                        <span className="text-neutral-400">{barLabel}</span>
                        {m.deviations.length > 0 && (
                          <span className="text-neutral-400 italic">
                            ({m.deviations.join(', ')})
                          </span>
                        )}
                        {m.etCatalogId &&
                          (isAdded ? (
                            <span
                              aria-label="In your ET practice"
                              title="In your ET practice"
                              className="text-fluent font-semibold"
                            >
                              ✓
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => beginAddProgression(m)}
                              title="Add to ET practice"
                              aria-label="Add to ET practice"
                              className="text-fluent hover:underline leading-none"
                            >
                              +
                            </button>
                          ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add-to-ET confirmation popover. */}
              {addingPattern && (
                <div className="rounded border border-fluent/40 bg-fluent/5 p-2 space-y-2 max-w-sm">
                  <div className="font-mono text-neutral-700 dark:text-neutral-200">
                    {addingPattern.numerals
                      .map(n => patternNumeralToDisplay(n, notationMode, song.key))
                      .join(' → ')}
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
              )}
                </>
              )}
            </div>
          )}

          {/* Arrangement notes (per active arrangement) — hidden in play mode */}
          {!playMode && arrangements.find(a => a.id === activeArrangementId)?.notes && (
            <div className="rounded-md bg-neutral-50 dark:bg-neutral-900/60 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500 mr-1.5">
                arrangement note
              </span>
              {arrangements.find(a => a.id === activeArrangementId)?.notes}
            </div>
          )}

          {/* Section notes — hidden in play mode */}
          {!playMode && (
          <div className="space-y-1">
            <SectionToggle
              label="section notes"
              expanded={showNotes}
              onToggle={() => setShowNotes(v => !v)}
            />
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
          )}

        </>
      )}
    </div>
  );
}

export { parseChord };


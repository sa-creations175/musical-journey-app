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
import { detectProgressions } from '../../lib/progressionDetection';
import { useToast } from '../../components/Toaster';
import {
  chordSequenceForArrangement,
  clonePhraseWithFreshIds,
  normalizeArrangements,
  normalizePhrase,
  phraseFromLyricsPreserveChords,
  phrasesFromLyrics,
  uid,
} from './beatsModel';
import { toRomanToken } from './chordFunction';
import { useNotationMode } from '../../lib/notationPref';
import { useIsMobile } from '../../lib/useIsMobile';
import PhraseLineEditor from './PhraseLineEditor';
import ArrangementBar from './ArrangementBar';
import BarGridView from './BarGridView';
import LyricStagingArea from './LyricStagingArea';
import {
  deriveBarGrid,
  effectiveTimeSignature,
  isLegacyPlacementId,
  materializeChordPlacements,
  moveChordPlacement,
  parseTimeSignature,
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
import BottomSheet from '../../components/BottomSheet';
import LongPressWrapper from '../../components/LongPressWrapper';
import { usePhraseClipboard } from './phraseClipboard';

// On phone-class viewports (<640px) the lead sheet editor caps phrase
// lines at this many words so they don't wrap badly. Word boundaries
// only — `phrasesFromLyrics` never splits inside a token.
const MOBILE_MAX_WORDS_PER_LINE = 6;

interface Props {
  song: Song;
  section: SongSection;
  canMoveUp: boolean;
  canMoveDown: boolean;
  highlighted?: boolean;
  highlightedPhraseId?: string | null;
  onChange: (patch: Partial<SongSection>) => Promise<void>;
  onMoveUp?: () => Promise<void>;
  onMoveDown?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onPhraseAdded?: (phraseId: string) => void;
}

export default function LeadSheetSection({
  song,
  section,
  canMoveUp,
  canMoveDown,
  highlighted,
  highlightedPhraseId,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  onPhraseAdded,
}: Props) {
  const stage = section.stage ?? song.stage ?? DEFAULT_STAGE;
  const { toast } = useToast();
  const [notationMode] = useNotationMode();
  const isMobile = useIsMobile();

  const [showNotes, setShowNotes] = useState(Boolean(section.notes));
  const [notesDraft, setNotesDraft] = useState(section.notes ?? '');
  const [nameDraft, setNameDraft] = useState(section.name);
  const [editingName, setEditingName] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Re-sync drafts when a different section rotates in.
  useEffect(() => {
    setNotesDraft(section.notes ?? '');
    setNameDraft(section.name);
    setEditingName(false);
    setCompareIds([]);
  }, [section.id]);

  // --- Undo stack ------------------------------------------------
  // Captures the prior values of any commit-tracked fields before
  // each `commit` so the bar-grid undo button can step back through
  // recent edits. Capped at 20 entries to avoid unbounded memory.
  // Stack lives in a ref (no re-render on push/pop); `canUndo` state
  // mirrors `stack.length > 0` so the button enables/disables.
  type UndoSnapshot = Partial<
    Pick<
      SongSection,
      'chordPlacements' | 'barLayout' | 'barCount' | 'lyricLines' | 'phrases'
    >
  >;
  const UNDO_STACK_MAX = 20;
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    // Switching sections wipes the stack — undo only applies to the
    // currently-rendered section.
    undoStackRef.current = [];
    setCanUndo(false);
  }, [section.id]);

  const commit = async (patch: Partial<SongSection>) => {
    // Snapshot the previous values of every tracked field this patch
    // touches. Object.keys includes keys whose value is `undefined`,
    // so "was undefined" round-trips correctly.
    const tracked: Array<keyof UndoSnapshot> = [
      'chordPlacements',
      'barLayout',
      'barCount',
      'lyricLines',
      'phrases',
    ];
    const snap: UndoSnapshot = {};
    let captured = 0;
    for (const key of Object.keys(patch) as Array<keyof UndoSnapshot>) {
      if (!tracked.includes(key)) continue;
      (snap as Record<string, unknown>)[key] = (section as unknown as Record<string, unknown>)[key];
      captured += 1;
    }
    if (captured > 0) {
      const stack = undoStackRef.current;
      stack.push(snap);
      while (stack.length > UNDO_STACK_MAX) stack.shift();
      setCanUndo(true);
    }
    await onChange(patch);
  };

  const handleUndo = async () => {
    const stack = undoStackRef.current;
    const snap = stack.pop();
    if (!snap) return;
    setCanUndo(stack.length > 0);
    // Bypass `commit` so the undo restore itself doesn't get pushed
    // back onto the stack.
    await onChange(snap);
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
    if (section.chordPlacements !== undefined) {
      return { placements: section.chordPlacements, realPlacementId: placementId };
    }
    const placements = materializeChordPlacements(section, beatsPerBar);
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
    const next = updateChordPlacement(placements, realPlacementId, { beats: clamped });
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
    const reconciled = reconcileBarLayout(section.barLayout, next);
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
    const reconciled = reconcileBarLayout(section.barLayout, next);
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
    if (section.barLayout) return [...section.barLayout];
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
      section,
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

  // --- Phrase list CRUD ------------------------------------------
  // `+ add phrase line` opens an inline lyric input rather than
  // committing immediately — gives the user a clear surface to type or
  // paste a line of lyrics. Empty input still produces a phrase (single
  // blank beat) so instrumental lines stay reachable.
  const [drafting, setDrafting] = useState(false);
  const [draftLyrics, setDraftLyrics] = useState('');

  const beginDraft = () => {
    setDraftLyrics('');
    setDrafting(true);
  };

  const cancelDraft = () => {
    setDrafting(false);
    setDraftLyrics('');
  };

  const commitDraft = async () => {
    // On mobile, long pastes are auto-broken into multiple phrase
    // lines (cap of MOBILE_MAX_WORDS_PER_LINE words). On desktop
    // the helper returns exactly one phrase, preserving prior UX.
    const fresh = phrasesFromLyrics(
      draftLyrics,
      isMobile ? MOBILE_MAX_WORDS_PER_LINE : undefined,
    );
    const list = [...normalisedPhrases, ...fresh];
    await commit({ phrases: list });
    setDrafting(false);
    setDraftLyrics('');
    // Highlight the first newly-added line so the user's eye lands
    // on it; subsequent split lines slot below in order.
    onPhraseAdded?.(fresh[0].id);
  };

  // --- Edit-as-text on an existing phrase line --------------------
  // Only one phrase per section can be in text-edit mode at a time;
  // identified by phraseId. The draft text starts populated with the
  // existing word beats joined by spaces.
  const [textEditPhraseId, setTextEditPhraseId] = useState<string | null>(null);
  const [textEditDraft, setTextEditDraft] = useState('');

  const beginTextEdit = (phrase: Phrase) => {
    const text = (phrase.beats ?? [])
      .filter(b => b.type === 'word')
      .map(b => b.text ?? '')
      .join(' ');
    setTextEditDraft(text);
    setTextEditPhraseId(phrase.id);
  };

  const cancelTextEdit = () => {
    setTextEditPhraseId(null);
    setTextEditDraft('');
  };

  const commitTextEdit = async () => {
    if (!textEditPhraseId) return;
    const target = normalisedPhrases.find(p => p.id === textEditPhraseId);
    if (!target) {
      cancelTextEdit();
      return;
    }
    const next = phraseFromLyricsPreserveChords(textEditDraft, target);
    const list = normalisedPhrases.map(p => (p.id === target.id ? next : p));
    await commit({ phrases: list });
    cancelTextEdit();
  };

  // --- Duplicate one phrase line ----------------------------------
  // Inserts a clone (fresh ids on phrase + beats + chord-placement
  // keys) directly below the source. Preserves beat structure and
  // chords so the user can immediately re-edit the words via the
  // edit-as-text affordance.
  const duplicatePhrase = async (phraseId: string) => {
    const idx = normalisedPhrases.findIndex(p => p.id === phraseId);
    if (idx < 0) return;
    const original = normalisedPhrases[idx];
    const copy = clonePhraseWithFreshIds(original);
    const list = [...normalisedPhrases];
    list.splice(idx + 1, 0, copy);
    await commit({ phrases: list });
    onPhraseAdded?.(copy.id);
  };

  // --- Mobile per-row context menu --------------------------------
  // On phone-class viewports the ↑↓✕✎⧉ button column is hidden to
  // free up horizontal space. Long-pressing a phrase row opens this
  // bottom-sheet menu with the same actions.
  const [menuPhraseId, setMenuPhraseId] = useState<string | null>(null);
  const closeRowMenu = () => setMenuPhraseId(null);
  const menuPhraseIndex = menuPhraseId
    ? normalisedPhrases.findIndex(p => p.id === menuPhraseId)
    : -1;

  // --- Multi-line select + cross-section clipboard ----------------
  // Select mode is per-section. The clipboard (shared via the
  // PhraseClipboardProvider mounted in SongDetailView) lets the
  // user copy a batch from one section and paste it into another.
  const clipboard = usePhraseClipboard();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhraseIds, setSelectedPhraseIds] = useState<Set<string>>(new Set());

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    setSelectedPhraseIds(new Set());
  };

  const toggleSelection = (phraseId: string) => {
    setSelectedPhraseIds(prev => {
      const next = new Set(prev);
      if (next.has(phraseId)) next.delete(phraseId);
      else next.add(phraseId);
      return next;
    });
  };

  const copySelected = () => {
    if (selectedPhraseIds.size === 0) return;
    // Preserve user-visible order — iterate normalisedPhrases, not
    // the selection set (which is unordered).
    const selectedInOrder = normalisedPhrases.filter(p => selectedPhraseIds.has(p.id));
    clipboard.setClipboard({
      phrases: selectedInOrder,
      sourceSectionId: section.id,
    });
    toast({
      message: `${selectedInOrder.length} line${selectedInOrder.length === 1 ? '' : 's'} copied. Open another section to paste.`,
      variant: 'success',
    });
    setSelectMode(false);
    setSelectedPhraseIds(new Set());
  };

  const pasteFromClipboard = async () => {
    if (clipboard.state.phrases.length === 0) return;
    // Always re-clone on paste so the same clipboard can be pasted
    // multiple times without sharing ids.
    const copies = clipboard.state.phrases.map(p => clonePhraseWithFreshIds(p));
    const list = [...normalisedPhrases, ...copies];
    await commit({ phrases: list });
    toast({
      message: `Pasted ${copies.length} line${copies.length === 1 ? '' : 's'}.`,
      variant: 'success',
    });
  };

  // Paste shows on every section once the clipboard is non-empty
  // — including the source. The source-section paste case is
  // basically a multi-duplicate convenience; users asked for the
  // symmetry. `sourceSectionId` is still recorded on the clipboard
  // for any future heuristics but no longer gates rendering.
  const canPaste = clipboard.state.phrases.length > 0;

  const deletePhrase = async (phraseId: string) => {
    const current = [...normalisedPhrases];
    const idx = current.findIndex(p => p.id === phraseId);
    if (idx < 0) return;
    const removed = current[idx];
    const next = current.filter(p => p.id !== phraseId);
    await commit({ phrases: next });
    toast({
      message: 'Phrase line deleted.',
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => {
          const restored = [...next];
          restored.splice(idx, 0, removed);
          await commit({ phrases: restored });
        },
      },
    });
  };

  const movePhrase = async (phraseId: string, dir: -1 | 1) => {
    const list = [...normalisedPhrases];
    const idx = list.findIndex(p => p.id === phraseId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(target, 0, moved);
    await commit({ phrases: list });
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
            onClick={toggleSelectMode}
            disabled={normalisedPhrases.length === 0}
            className={`px-1.5 py-0.5 rounded border text-[11px] disabled:opacity-30 disabled:cursor-not-allowed ${
              selectMode
                ? 'border-fluent bg-fluent/10 text-fluent'
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent'
            }`}
            title={selectMode ? 'leave select mode' : 'select phrase lines to copy across sections'}
          >
            {selectMode ? '☑ selecting' : '☐ select'}
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
            />

            {/* Step 6 lyric paste: each text line becomes a pending
                LyricLine in the bar grid's tray. */}
            <LyricStagingArea
              sectionId={section.id}
              onSubmitLines={handleSubmitLyricLines}
            />
          </DndContext>

          {normalisedPhrases.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">
              Tap &quot;+ add phrase line&quot; to start entering lyrics and chords.
            </p>
          ) : (
            <div className="space-y-2">
              {/* One-time orientation cue above the first phrase — the
                  chord row sits above the beat row but neither carries
                  a header on its own, so this label tells a first-time
                  user which row is which. */}
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 pl-7">
                chords ↑&nbsp;&nbsp;lyrics ↓
              </div>
              {normalisedPhrases.map((p, idx) => {
                const otherCompareIds = compareIds.filter(id => id !== activeArrangementId);
                const isTextEditing = textEditPhraseId === p.id;
                const isSelected = selectedPhraseIds.has(p.id);
                return (
                  <LongPressWrapper
                    key={p.id}
                    enabled={isMobile && !isTextEditing}
                    onLongPress={() => setMenuPhraseId(p.id)}
                    className="group flex items-start gap-2"
                  >
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(p.id)}
                        title="select this phrase line to copy"
                        aria-label="select phrase line"
                        className="mt-2 h-4 w-4 rounded border-neutral-300 text-fluent focus:ring-fluent"
                      />
                    )}
                    {/* Per-phrase reorder + delete + edit-text +
                        duplicate affordances (fade in on hover to
                        keep the editor calm). Hidden on mobile —
                        long-press the row to open the same actions
                        in a bottom sheet. */}
                    {!isMobile && (
                      <div className="flex flex-col items-center gap-0.5 pt-2 opacity-30 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => movePhrase(p.id, -1)}
                          disabled={idx === 0}
                          title="move line up"
                          className="text-[10px] text-neutral-500 hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => movePhrase(p.id, 1)}
                          disabled={idx === normalisedPhrases.length - 1}
                          title="move line down"
                          className="text-[10px] text-neutral-500 hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => deletePhrase(p.id)}
                          title="delete line"
                          className="text-[10px] text-neutral-500 hover:text-needswork px-0.5"
                        >
                          ✕
                        </button>
                        <button
                          onClick={() => beginTextEdit(p)}
                          title="edit as text — re-type or re-paste this line"
                          aria-label="edit as text"
                          className="text-[10px] text-neutral-500 hover:text-fluent px-0.5"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => void duplicatePhrase(p.id)}
                          title="duplicate this line below"
                          aria-label="duplicate line"
                          className="text-[10px] text-neutral-500 hover:text-fluent px-0.5"
                        >
                          ⧉
                        </button>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {isTextEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={textEditDraft}
                            onChange={e => setTextEditDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void commitTextEdit();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelTextEdit();
                              }
                            }}
                            placeholder="Type or paste lyrics for this line..."
                            className="flex-1 min-w-0 rounded-md border border-fluent/60 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fluent/30 focus:border-fluent"
                          />
                          <button
                            onClick={() => void commitTextEdit()}
                            title="apply"
                            aria-label="apply"
                            className="px-2 py-1 rounded-md bg-fluent text-white text-xs hover:opacity-90"
                          >
                            ✓
                          </button>
                          <button
                            onClick={cancelTextEdit}
                            title="cancel"
                            aria-label="cancel"
                            className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 hover:text-needswork"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <PhraseLineEditor
                          phrase={p}
                          activeArrangementId={activeArrangementId}
                          compareArrangementIds={otherCompareIds}
                          arrangementName={id => arrangements.find(a => a.id === id)?.name ?? id}
                          notationMode={notationMode}
                          sectionKey={song.key}
                          onChange={updatePhraseInPlace}
                          highlighted={highlightedPhraseId === p.id}
                          onEditAsText={() => beginTextEdit(p)}
                        />
                      )}
                    </div>
                  </LongPressWrapper>
                );
              })}
            </div>
          )}

          {/* Select-mode + paste action bar. "Copy selected" appears
              while the user is multi-selecting; "Paste phrase lines"
              appears on every section EXCEPT the source whenever the
              clipboard is non-empty. */}
          {(selectMode && selectedPhraseIds.size > 0) || canPaste ? (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {selectMode && selectedPhraseIds.size > 0 && (
                <button
                  onClick={copySelected}
                  className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
                >
                  Copy {selectedPhraseIds.size} line{selectedPhraseIds.size === 1 ? '' : 's'}
                </button>
              )}
              {canPaste && (
                <>
                  <button
                    onClick={() => void pasteFromClipboard()}
                    className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-xs font-medium hover:bg-fluent/10"
                  >
                    Paste {clipboard.state.phrases.length} phrase line{clipboard.state.phrases.length === 1 ? '' : 's'}
                  </button>
                  <button
                    onClick={() => clipboard.clear()}
                    title="clear the phrase clipboard"
                    className="px-2 py-1.5 rounded-md text-neutral-500 hover:text-needswork text-xs"
                  >
                    ✕ Clear
                  </button>
                </>
              )}
            </div>
          ) : null}

          {drafting ? (
            <div className="flex items-center gap-2 pt-1">
              <input
                autoFocus
                value={draftLyrics}
                onChange={e => setDraftLyrics(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void commitDraft();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelDraft();
                  }
                }}
                placeholder="Type or paste lyrics for this line..."
                className="flex-1 min-w-0 rounded-md border border-fluent/60 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fluent/30 focus:border-fluent"
              />
              <button
                onClick={() => void commitDraft()}
                title="add line"
                aria-label="add line"
                className="px-2 py-1 rounded-md bg-fluent text-white text-xs hover:opacity-90"
              >
                ✓
              </button>
              <button
                onClick={cancelDraft}
                title="cancel"
                aria-label="cancel"
                className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 hover:text-needswork"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={beginDraft}
              className="text-xs text-neutral-500 hover:text-fluent"
            >
              + add phrase line
            </button>
          )}

          {progressionMatches.length > 0 && !comparing && (
            <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500 pt-1 border-t border-neutral-200 dark:border-neutral-800">
              <span className="uppercase tracking-wide">detected:</span>
              {progressionMatches.slice(0, 3).map((m, idx) => (
                <span
                  key={`${m.progressionId}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-full border border-fluent/30 bg-fluent/10 text-fluent px-2 py-0.5"
                  title={`Tier ${m.tier} · ${m.tierName} · match type: ${m.matchType}`}
                >
                  <span aria-hidden>📍</span>
                  {m.progressionName}
                </span>
              ))}
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

          {/* Mobile long-press menu. The same row-level actions
              (reorder / delete / edit / duplicate) that surface as
              hover buttons on desktop. Disabled-states match the
              desktop buttons: top row can't move up, bottom row
              can't move down. */}
          {menuPhraseId && menuPhraseIndex >= 0 && (
            <BottomSheet open={true} onClose={closeRowMenu} title="Line actions">
              <div className="flex flex-col">
                <RowMenuButton
                  onClick={async () => {
                    await movePhrase(menuPhraseId, -1);
                    closeRowMenu();
                  }}
                  disabled={menuPhraseIndex === 0}
                  icon="↑"
                  label="Move up"
                />
                <RowMenuButton
                  onClick={async () => {
                    await movePhrase(menuPhraseId, 1);
                    closeRowMenu();
                  }}
                  disabled={menuPhraseIndex === normalisedPhrases.length - 1}
                  icon="↓"
                  label="Move down"
                />
                <RowMenuButton
                  onClick={async () => {
                    await duplicatePhrase(menuPhraseId);
                    closeRowMenu();
                  }}
                  icon="⧉"
                  label="Duplicate line"
                />
                <RowMenuButton
                  onClick={() => {
                    const target = normalisedPhrases[menuPhraseIndex];
                    if (target) beginTextEdit(target);
                    closeRowMenu();
                  }}
                  icon="✎"
                  label="Edit as text"
                />
                <RowMenuButton
                  onClick={async () => {
                    await deletePhrase(menuPhraseId);
                    closeRowMenu();
                  }}
                  icon="✕"
                  label="Delete line"
                  variant="danger"
                />
              </div>
            </BottomSheet>
          )}
        </>
      )}
    </div>
  );
}

function RowMenuButton({
  onClick,
  disabled,
  icon,
  label,
  variant,
}: {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  icon: string;
  label: string;
  variant?: 'danger';
}) {
  const colour = variant === 'danger'
    ? 'text-needswork hover:bg-needswork/5'
    : 'text-neutral-700 dark:text-neutral-100 hover:bg-fluent/5';
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className={`flex items-center gap-3 px-2 py-3 text-left text-sm rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${colour}`}
    >
      <span aria-hidden className="text-base w-5 inline-flex justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export { parseChord };

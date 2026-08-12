import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
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
import {
  db,
  type HarmonicDiaryEntry,
  type ReferenceVideo,
  type Song,
  type SongCrossKeyProgress,
  type SongPracticeLog,
  type LyricSyllable,
  type SongLyricLine,
  type SongSection,
  type RepertoireStage,
} from '../../lib/db';
import { upsertDiaryEntry } from '../harmonic-diary/data';
import { canonicalSkillId } from '../skills/registry';
import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_BADGE_CLASS,
  STAGE_GUIDANCE,
  STAGE_LABEL,
  STAGE_TAGLINE,
  evaluateAdvancement,
  nextStage,
} from './stage';
import LeadSheetSection from './LeadSheetSection';
import { effectiveTimeSignature, parseTimeSignature, songBeatAxis } from './barGrid';
import {
  LYRIC_FOLD_VERSION,
  buildCellIndex,
  buildMarkerIndex,
  anchorsMatching,
  cellKey,
  findSyllable,
  linesFromParsedRows,
  duplicateLine,
  setLineKind,
  unplaceAnchorsMatching,
  unplaceLine,
  foldSectionLyrics,
  restoreLineSyllables,
} from './lyricSyllables';
import {
  armedSyllableId as selectArmedSyllableId,
  armingReducer,
  pendingLine,
  pendingLineEnd,
} from './syllableArming';
import {
  OVERLAY_EDGE_PAD,
  OVERLAY_GAP,
  OVERLAY_H,
  OVERLAY_MAX_W,
  anchoredOverlayPosition,
  measureSafeArea,
  toAnchorRect,
  type OverlayPosition,
} from './leadSheetOverlay';
import {
  loadLyricTrayCollapsed,
  loadPatternsCollapsed,
  saveLyricTrayCollapsed,
  savePatternsCollapsed,
} from './leadSheetPrefs';
import { planSectionMove } from './sectionReorder';
import CrossKeyGrid from './CrossKeyGrid';
import PracticeHistory from './PracticeHistory';
import SongHeatmap from './SongHeatmap';
import PracticeLogModal from './PracticeLogModal';
import FullLyricsSection from './FullLyricsSection';
import SectionToggle from './SectionToggle';
import CellAnchoredMessage from './CellAnchoredMessage';
import LyricDrawer from './LyricDrawer';
import { useDismissOnOutside } from './useDismissOnOutside';
import { parseLyricSheet } from './lyricSheetParse';
import {
  buildSectionProgression,
  buildSongProgression,
  clearOrphanedHides,
} from './progressionOutline';
import ProgressionDrawer from './ProgressionDrawer';
import type { SequenceView } from '../../lib/db';
import {
  EMPTY_SEQUENCE_VIEW,
  removeBreak,
  setBreak,
  setPhraseNote,
  toggleHidden,
} from './sequenceView';
import {
  describeHalveBlockers,
  planDurationHalving,
  planDurationRepair,
  repairSectionDurations,
  type HalveBlocker,
} from './eighthsMigration';
import { useToast } from '../../components/Toaster';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useScrollHighlight } from './useScrollHighlight';
import { NOTATION_LABEL, useNotationMode, type NotationMode } from '../../lib/notationPref';
import SongMatrixView from './matrix/SongMatrixView';
import { reassignOriginalKey } from './matrix/reassignOriginalKey';
import { ensureSongHasOriginalKey } from './matrixMigration';

/**
 * Canonical section keys on the song detail page. Order in this
 * tuple is the DEFAULT — used when Song.sectionOrder is unset, and
 * as a fallback for legacy / unknown keys when reading a stored
 * order. The meta header always renders first (not in this list);
 * cross-key, practice history, and danger zone always render at
 * the bottom (also not in this list). Only the five named sections
 * here participate in drag-to-reorder.
 */
const SECTION_KEYS = [
  'leadSheet',
  'matrix',
  'learningStatus',
  'whyAndLinks',
  'associations',
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
const SECTION_KEY_SET: ReadonlySet<string> = new Set(SECTION_KEYS);

const SECTION_TITLES: Record<SectionKey, string> = {
  leadSheet:      'lead sheet',
  matrix:         'matrix',
  learningStatus: 'learning status',
  whyAndLinks:    'why this song',
  associations:   'my associations',
};

/** Time-signature dropdown options. "Other" routes the user to a
 *  free-text input so uncommon meters (9/8, 11/8, etc.) still
 *  round-trip. Empty string means "no signature set". */
const TIME_SIGNATURE_PRESETS = ['4/4', '3/4', '6/8', '5/4', '7/8', '12/8'];

// Overlay box size and spacing live in leadSheetOverlay.ts — one set of
// numbers for both the refusal message and the line-end prompt.

/** Long enough to read a short sentence, short enough that the message
 *  is gone before a scroll could strand it away from its cell. */
const REFUSAL_MS = 2200;
const REFUSAL_TEXT: Record<'order' | 'off-axis', string> = {
  order: "Can't place here — syllables must stay in order.",
  // Its own wording rather than silence. This is a data problem, not a
  // user mistake, but a shake with no message reads as broken feedback
  // — which is exactly how the old silent branch was experienced.
  'off-axis': "Can't place here — this section isn't on the beat grid.",
};


/** Generate a stable id for a reference-video entry. Prefer
 *  `crypto.randomUUID()` (browser standard, present in all modern
 *  Safari / Chromium); falls back to a date+random combo in any
 *  exotic environment that lacks it (tests, older webviews). */
function newReferenceVideoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Pull the human-readable hostname out of a URL — used as the
 *  default link label when the user didn't supply one. Falls back
 *  to the raw input if URL parsing fails (e.g. partial paste). */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Build the initial draft array when the user opens the metadata
 *  editor. Uses `song.referenceVideos` if present; otherwise
 *  synthesises a single entry from the legacy `youtubeLink` so the
 *  user can edit / re-label / extend it. Empty when neither field
 *  carries content. */
function seedReferenceVideosDraft(song: Song): ReferenceVideo[] {
  if (song.referenceVideos && song.referenceVideos.length > 0) {
    return song.referenceVideos.map(v => ({ ...v }));
  }
  if (song.youtubeLink && song.youtubeLink.trim() !== '') {
    return [{ id: newReferenceVideoId(), url: song.youtubeLink, label: undefined }];
  }
  return [];
}

/**
 * Resolve a Song's effective section order. Drops unknown keys
 * (defensive against schema drift) and appends any missing keys at
 * the tail in DEFAULT order so a new section we add later still
 * shows up for existing songs.
 */
function resolveSectionOrder(stored: string[] | undefined): SectionKey[] {
  const result: SectionKey[] = [];
  const seen = new Set<SectionKey>();
  for (const key of stored ?? []) {
    if (SECTION_KEY_SET.has(key) && !seen.has(key as SectionKey)) {
      result.push(key as SectionKey);
      seen.add(key as SectionKey);
    }
  }
  for (const key of SECTION_KEYS) {
    if (!seen.has(key)) result.push(key);
  }
  return result;
}

interface Props {
  songId: string | null;
  songs: Song[];
  onSelectSong: (songId: string) => void;
  onBackToActive: () => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export default function SongDetailView({
  songId,
  songs,
  onSelectSong,
  onBackToActive,
}: Props) {
  if (!songId || songs.find(s => s.id === songId) === undefined) {
    return (
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">song detail</h2>
        <p className="text-sm text-neutral-500">
          pick a song from your active repertoire to open its detail view.
        </p>
        {songs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {songs.map(s => (
              <button
                key={s.id}
                onClick={() => onSelectSong(s.id)}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent"
              >
                {s.title}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onBackToActive}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ← back to active repertoire
        </button>
      </section>
    );
  }

  return (
    <SongDetailInner
      songId={songId}
      songs={songs}
      onSelectSong={onSelectSong}
      onBackToActive={onBackToActive}
    />
  );
}

interface InnerProps {
  songId: string;
  songs: Song[];
  onSelectSong: (songId: string) => void;
  onBackToActive: () => void;
}

function SongDetailInner({ songId, songs, onSelectSong, onBackToActive }: InnerProps) {
  const song = useLiveQuery<Song | undefined>(() => db.songs.get(songId), [songId]);
  const sections = useLiveQuery<SongSection[]>(
    () => db.songSections
      .where('songId').equals(songId)
      .sortBy('order'),
    [songId],
  ) ?? [];
  const logs = useLiveQuery<SongPracticeLog[]>(
    () => db.songPracticeLog
      .where('songId').equals(songId)
      .toArray()
      .then(arr => arr.sort((a, b) => b.timestamp - a.timestamp)),
    [songId],
  ) ?? [];
  const crossKey = useLiveQuery<SongCrossKeyProgress[]>(
    () => db.songCrossKeyProgress.where('songId').equals(songId).toArray(),
    [songId],
  ) ?? [];

  const { toast } = useToast();
  const { flash, isHighlighted } = useScrollHighlight();
  const [notationMode, setNotationMode] = useNotationMode();

  // Which section to flash on next render — set by the action
  // handlers below.
  const [flashSectionId, setFlashSectionId] = useState<string | null>(null);

  // Confirm-dialog state. Separate state per dialog so the component
  // can open only one at a time (song delete vs. section delete).
  const [confirmDeleteSong, setConfirmDeleteSong] = useState(false);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<SongSection | null>(null);

  // Metadata edit state (full edit mode) and the standalone
  // "why this song" note edit mode.
  const [editingMeta, setEditingMeta] = useState(false);
  const [whyEditing, setWhyEditing] = useState(false);
  const [whyDraft, setWhyDraft] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  // Full lyrics collapsible inside the lead sheet section. Closed by
  // default; the user opens it explicitly via the "full lyrics" toggle.
  const [showFullLyrics, setShowFullLyrics] = useState(false);

  // Section-order drag state. The sortable list reads from
  // song.sectionOrder (falling back to DEFAULT_SECTION_ORDER); the
  // drag-end handler writes the new order back to db.songs. dnd-kit
  // wiring mirrors ActiveRepertoireView's SortableSongRow setup —
  // 5px pointer activation distance so taps don't accidentally
  // trigger a drag, keyboard sensor for accessibility.
  const sectionOrder = useMemo(
    () => resolveSectionOrder(song?.sectionOrder),
    [song?.sectionOrder],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleSectionDragEnd = async (event: DragEndEvent) => {
    if (!song) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sectionOrder.indexOf(active.id as SectionKey);
    const newIndex = sectionOrder.indexOf(over.id as SectionKey);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(sectionOrder, oldIndex, newIndex);
    // Read-then-put per the saveMeta precedent — db.songs.update can
    // silently no-op when its lookup-and-merge fails. Single put
    // also stays in lockstep with the rest of the song row.
    const fresh = await db.songs.get(song.id);
    if (!fresh) return;
    await db.songs.put({ ...fresh, sectionOrder: next, updatedAt: Date.now() });
  };

  // Lead-sheet sections are reordered via an explicit reorder mode
  // (up/down arrows), not drag-and-drop — drag caused accidental
  // reorders when tapping chords on mobile. The outer page-section
  // card reorder (SortableSection) is unaffected. See
  // LEAD_SHEET_PLAY_MODE_DESIGN.md.
  const [reorderMode, setReorderMode] = useState(false);
  // Play mode — a stripped, read-for-playing view of the lead sheet
  // (editing chrome hidden). Mutually exclusive with reorder mode and
  // not persisted (resets on reopen). See LEAD_SHEET_PLAY_MODE_DESIGN.md.
  const [playMode, setPlayMode] = useState(false);

  const [titleDraft, setTitleDraft] = useState('');
  const [artistDraft, setArtistDraft] = useState('');
  const [genreDraft, setGenreDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [tempoDraft, setTempoDraft] = useState('');
  // Time signature is edited as a dropdown of common meters plus an
  // "Other" → free-text path so uncommon picks (9/8 etc.) still
  // round-trip. Two pieces of state: which preset is selected, and
  // (when "Other") the custom string.
  const [timeSigPreset, setTimeSigPreset] = useState<string>('');
  const [timeSigCustom, setTimeSigCustom] = useState('');
  const [spotifyDraft, setSpotifyDraft] = useState('');
  // Reference-videos editor draft. Seeded in `openEdit` from
  // `song.referenceVideos`, or from a legacy `song.youtubeLink` if
  // that's the only thing present (one-way migration on first save).
  const [referenceVideosDraft, setReferenceVideosDraft] = useState<ReferenceVideo[]>([]);

  const openEdit = () => {
    if (!song) return;
    setTitleDraft(song.title);
    setArtistDraft(song.artist);
    setGenreDraft(song.genre ?? '');
    setKeyDraft(song.key ?? '');
    setTempoDraft(song.tempoLabel ?? (song.tempo ? String(song.tempo) : ''));
    // Seed time-signature draft state: if the stored value matches
    // one of the presets, pick that; otherwise route through "Other".
    const stored = song.timeSignature?.trim() ?? '';
    if (stored === '' || TIME_SIGNATURE_PRESETS.includes(stored)) {
      setTimeSigPreset(stored);
      setTimeSigCustom('');
    } else {
      setTimeSigPreset('Other');
      setTimeSigCustom(stored);
    }
    setSpotifyDraft(song.spotifyLink ?? '');
    setReferenceVideosDraft(seedReferenceVideosDraft(song));
    setEditingMeta(true);
  };

  const addReferenceVideoDraft = () => {
    setReferenceVideosDraft(prev => [
      ...prev,
      { id: newReferenceVideoId(), url: '', label: undefined },
    ]);
  };
  const updateReferenceVideoDraft = (
    id: string,
    patch: Partial<Pick<ReferenceVideo, 'url' | 'label'>>,
  ) => {
    setReferenceVideosDraft(prev =>
      prev.map(v => (v.id === id ? { ...v, ...patch } : v)),
    );
  };
  const removeReferenceVideoDraft = (id: string) => {
    setReferenceVideosDraft(prev => prev.filter(v => v.id !== id));
  };

  const saveMeta = async () => {
    if (!song) return;
    const newKey = keyDraft.trim() || undefined;
    const keyChanged = newKey !== undefined && newKey !== song.key;
    // Time signature: empty preset → unset; "Other" → custom field;
    // any other preset → use it verbatim.
    const newTimeSignature =
      timeSigPreset === ''
        ? undefined
        : timeSigPreset === 'Other'
          ? timeSigCustom.trim() || undefined
          : timeSigPreset;
    // Reference videos: trim, drop empties, normalise optional label.
    // Saving with at least one entry consumes the migration — the
    // legacy `youtubeLink` field is cleared so the display has a
    // single source of truth from here on.
    const cleanedVideos = referenceVideosDraft
      .map(v => ({
        id: v.id,
        url: v.url.trim(),
        label: v.label?.trim() ? v.label.trim() : undefined,
      }))
      .filter(v => v.url !== '');
    // Keep the numeric `tempo` in lockstep with the human `tempoLabel`.
    // The label is free text ("80 BPM", "70–85"); `tempo` is the single
    // BPM the matrix / playback read. Extract the first integer in the
    // draft (low end of a range) — matches CellInteractionModal's
    // numeric tempo write so both surfaces stay consistent. No number in
    // the draft → clear `tempo`.
    const tempoMatch = tempoDraft.match(/\d+/);
    const parsedTempo = tempoMatch ? parseInt(tempoMatch[0], 10) : NaN;
    const newTempo = Number.isFinite(parsedTempo) && parsedTempo > 0 ? parsedTempo : undefined;
    const patch: Partial<Song> = {
      title: titleDraft.trim() || song.title,
      artist: artistDraft.trim() || song.artist,
      genre: genreDraft.trim() || undefined,
      key: newKey,
      keyNeedsVerification: keyDraft.trim() === song.key ? song.keyNeedsVerification : false,
      tempo: newTempo,
      tempoLabel: tempoDraft.trim() || undefined,
      timeSignature: newTimeSignature,
      spotifyLink: spotifyDraft.trim() || undefined,
      referenceVideos: cleanedVideos.length > 0 ? cleanedVideos : undefined,
      youtubeLink: undefined,
      updatedAt: Date.now(),
    };
    // Single transaction over both tables so the matrix's
    // isOriginalKey row stays in lockstep with Song.key. Without the
    // reassignment, the matrix would keep advertising the old key as
    // original while the song header shows the new value.
    //
    // Read-then-put rather than db.songs.update — per the
    // VacationManager / CellInteractionModal precedent, .update can
    // silently no-op when its internal lookup-and-merge fails (returns
    // 0, no throw, no signal). .put with the full record is
    // unambiguous upsert by primary key.
    await db.transaction('rw', [db.songs, db.songKeys], async () => {
      const fresh = await db.songs.get(song.id);
      if (!fresh) {
        console.warn('[song] saveMeta — song record vanished mid-edit', song.id);
        return;
      }
      await db.songs.put({ ...fresh, ...patch });
      if (keyChanged) {
        await reassignOriginalKey(song.id, newKey);
      }
    });
    // Seed the matrix's original-key row if it's never been
    // initialized. Catches songs edited before matrixMigration ran
    // (e.g. via the meta editor on a fresh song) so Song.key and
    // the matrix's original column can't drift apart. No-op when
    // rows already exist — including the row just written by
    // reassignOriginalKey above.
    await ensureSongHasOriginalKey(song.id);
    setEditingMeta(false);
    toast({ message: 'Song details saved.', variant: 'success' });
  };

  const openWhyEditor = () => {
    if (!song) return;
    setWhyDraft(song.description ?? '');
    setWhyEditing(true);
  };
  const saveWhy = async () => {
    if (!song) return;
    const next = whyDraft.trim();
    await db.songs.update(song.id, { description: next || undefined, updatedAt: Date.now() });
    setWhyEditing(false);
    toast({ message: next ? 'Note saved.' : 'Note cleared.', variant: 'success' });
  };

  const saveFullLyrics = async (fullLyrics: string) => {
    if (!song) return;
    const trimmed = fullLyrics.trim();
    await db.songs.update(song.id, { fullLyrics: trimmed || undefined, updatedAt: Date.now() });
    toast({ message: 'Full lyrics saved.', variant: 'success' });
  };

  // --- Advancement --------------------------------------------------
  const currentStage: RepertoireStage = song?.stage ?? DEFAULT_STAGE;
  const crossKeyPairs = useMemo(() => (
    crossKey.map(p => ({
      sectionId: p.sectionId,
      keyName: p.keyName,
      sessionCount: p.sessionCount,
    }))
  ), [crossKey]);
  const advancement = useMemo(() => evaluateAdvancement({
    currentStage,
    logs,
    originalKey: song?.key,
    crossKeyPairs,
  }), [currentStage, logs, song?.key, crossKeyPairs]);
  const nextStageOption = nextStage(currentStage);

  const setStage = async (stage: RepertoireStage) => {
    if (!song) return;
    const prev = song.stage ?? DEFAULT_STAGE;
    await db.songs.update(song.id, { stage, updatedAt: Date.now() });
    toast({
      message: `Advanced to ${STAGE_LABEL[stage]}.`,
      variant: 'success',
      action: {
        label: 'Undo',
        onClick: async () => {
          await db.songs.update(song.id, { stage: prev, updatedAt: Date.now() });
        },
      },
    });
  };

  // --- Section CRUD helpers ----------------------------------------
  const addSection = async () => {
    if (!song) return;
    const order = sections.length;
    const newId = uid('section');
    await db.songSections.add({
      id: newId,
      songId: song.id,
      name: `Section ${order + 1}`,
      order,
      lyrics: '',
      phrases: [],
      arrangements: [{ id: 'basic', name: 'Basic' }],
      activeArrangementId: 'basic',
    });
    setFlashSectionId(newId);
    requestAnimationFrame(() => flash(`section-${newId}`));
    toast({ message: `Section added: Section ${order + 1}`, variant: 'success' });
  };

  const updateSection = async (sectionId: string, patch: Partial<SongSection>) => {
    await db.songSections.update(sectionId, patch);
  };

  // --- Song-owned lyric store (rev 3) ------------------------------
  // Lyric lines belong to the SONG, not to a section, because a line's
  // syllables may be anchored into different sections and line
  // membership carries no positional meaning. So the store, the beat
  // axis, and the anchor→cell index all live here, above the sections,
  // and each LeadSheetSection renders whatever anchors point at it.
  // See docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §2.0 / §2.0b.

  // One ascending beat line across every section, in song order. Needed
  // because the ghost spread reasons across section boundaries.
  const beatAxis = useMemo(() => songBeatAxis(song, sections), [sections, song]);

  const songLyricLines = song?.lyricLines;

  const cellIndex = useMemo(
    () => (songLyricLines ? buildCellIndex(songLyricLines, beatAxis) : undefined),
    [songLyricLines, beatAxis],
  );

  const markerIndex = useMemo(
    () => (songLyricLines ? buildMarkerIndex(songLyricLines) : undefined),
    [songLyricLines],
  );
  // --- progression-patterns collapse (global pref) ------------------
  // Owned here rather than in LeadSheetSection because the pref is
  // GLOBAL: the block renders once per section, and a five-section song
  // meaning five toggles is exactly what this is meant to avoid. One
  // piece of state, every section follows it — same shape as the armed
  // syllable and the refusal notice.
  //
  // Read once via lazy initial state; localStorage is synchronous, so
  // there is no hydration flash and no need for a hydrated flag.
  const [patternsCollapsed, setPatternsCollapsed] = useState(
    loadPatternsCollapsed,
  );

  const handleTogglePatterns = useCallback(() => {
    setPatternsCollapsed(prev => {
      const next = !prev;
      savePatternsCollapsed(next);
      return next;
    });
  }, []);

  // The unplaced-lyrics tray, same shape but a SEPARATE pref. Chaining
  // it to the patterns block would make each one's state a side effect
  // of the other, and wanting patterns open says nothing about wanting
  // every section's lyrics open.
  const [lyricTrayCollapsed, setLyricTrayCollapsed] = useState(
    loadLyricTrayCollapsed,
  );

  const handleToggleLyricTray = useCallback(() => {
    setLyricTrayCollapsed(prev => {
      const next = !prev;
      saveLyricTrayCollapsed(next);
      return next;
    });
  }, []);

  // --- refusal message (floats over the refused cell) ---------------
  // The message sits here rather than in LeadSheetSection because it is
  // ONE floating overlay for the page: per-section copies would put two
  // messages on screen when refusals land in different sections inside
  // the dismiss window, which arming spanning sections makes easy to
  // hit. The shake stays per-section — that one is a class on a cell.
  //
  // It replaces a bottom-of-screen toast. The toast component is fine;
  // it was simply nowhere near where the user is looking, which is the
  // cell they just tapped and which is currently shaking.
  //
  // Positioned `fixed` from the tapped cell's viewport rect rather than
  // absolutely inside the cell: grid ancestors can clip, and viewport
  // coordinates are what make the edge flip straightforward. There are
  // no ancestor transforms on this tree, so `fixed` resolves against
  // the viewport as intended.
  const [refusalNotice, setRefusalNotice] = useState<{
    key: number;
    left: number;
    top: number;
    reason: 'order' | 'off-axis';
  } | null>(null);
  const refusalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (refusalTimer.current) clearTimeout(refusalTimer.current);
    },
    [],
  );

  const handleRefusalNotice = useCallback(
    (reason: 'order' | 'off-axis', cellRect?: DOMRect) => {
      // Same geometry the line-end prompt uses — below by default, flip
      // above when there is no room, clamp so it can't run off any
      // edge. Shared rather than duplicated so the two can't drift.
      //
      // A MISSING RECT IS NOT A REASON TO SHOW NOTHING: passing null
      // parks the message at the bottom edge, which is worse placement
      // but still feedback. Dropping it was a silent failure
      // indistinguishable from the overlay being broken.
      const { left, top } = anchoredOverlayPosition({
        cell: cellRect ? toAnchorRect(cellRect) : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        box: { width: OVERLAY_MAX_W, height: OVERLAY_H },
        gap: OVERLAY_GAP,
        edgePad: OVERLAY_EDGE_PAD,
        safeArea: measureSafeArea(),
      });
      if (refusalTimer.current) clearTimeout(refusalTimer.current);
      setRefusalNotice({ key: Date.now(), left, top, reason });
      refusalTimer.current = setTimeout(() => setRefusalNotice(null), REFUSAL_MS);
    },
    [],
  );

  const commitSongLyrics = useCallback(
    async (next: SongLyricLine[]) => {
      // Read-then-put per the saveMeta precedent — Table.update can
      // silently no-op when its lookup-and-merge fails.
      const fresh = await db.songs.get(songId);
      if (!fresh) return;
      // Stamp the fold version on every user edit, so a future
      // destructive re-fold can distinguish "migrated but untouched"
      // from "the user has worked on this".
      await db.songs.put({
        ...fresh,
        lyricLines: next,
        lyricFoldVersion: LYRIC_FOLD_VERSION,
        updatedAt: Date.now(),
      });
    },
    [songId],
  );


  // --- tap-to-place arming (step 6b) --------------------------------
  // Lifted here from LeadSheetSection so a tap can cross sections: the
  // armed syllable has to outlive any one section's DndContext, and
  // each section previously ran its own reducer, so arming in one was
  // invisible to the next — the second tap simply did nothing.
  //
  // Only the syllable-keyed pieces moved. Placement itself, the
  // ordering guard and the refusal shake all stay in LeadSheetSection,
  // because a beat-cell tap always fires on the section that owns the
  // cell. See docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §A3.
  const [arming, dispatchArming] = useReducer(armingReducer, null);
  const armedSyllableId = selectArmedSyllableId(arming);

  // Drop arming if the armed syllable stops existing (split, join,
  // un-place, undo).
  useEffect(() => {
    if (!armedSyllableId) return;
    if (!songLyricLines || !findSyllable(songLyricLines, armedSyllableId)) {
      dispatchArming({ type: 'syllable-removed', syllableId: armedSyllableId });
    }
  }, [songLyricLines, armedSyllableId]);

  // --- beat two: waiting for a line's end ---------------------------
  // Placing a line is ONE gesture with TWO beats. Beat one drops the
  // first unit; beat two is the app immediately asking where the line
  // ENDS, instead of leaving the user to discover a dimmed 10px marker
  // stacked in the cell they just dropped into.
  //
  // The half-placed state is what had no recovery path: re-dragging a
  // line always re-places its FIRST unit, so a line stranded with only
  // its head down could not be finished by the gesture that stranded
  // it. Beat two removes that state rather than signposting it.
  const awaitingLine = pendingLine(arming);
  const awaitingLineEndId = pendingLineEnd(arming);

  // Snapshot of the line's syllables as they were BEFORE beat one, so
  // cancelling undoes the gesture rather than the line. A resumed line
  // may already carry anchors from an earlier session; `unplaceLine`
  // would take those too, which is a bug you discover by losing work.
  const lineGestureSnapshot = useRef<{
    lineId: string;
    syllables: LyricSyllable[];
  } | null>(null);

  const rollbackLineGesture = useCallback(async () => {
    const snap = lineGestureSnapshot.current;
    lineGestureSnapshot.current = null;
    if (!snap || !song?.lyricLines) return;
    await commitSongLyrics(
      restoreLineSyllables(song.lyricLines, snap.lineId, snap.syllables),
    );
  }, [song?.lyricLines, commitSongLyrics]);

  /** Dismiss whatever is pending, rolling beat one back if there is one.
   *  Read the state BEFORE dispatching — that is the only moment the
   *  rollback signal is still available. */
  const dismissArming = useCallback(() => {
    if (pendingLineEnd(arming)) void rollbackLineGesture();
    else lineGestureSnapshot.current = null;
    dispatchArming({ type: 'dismiss' });
  }, [arming, rollbackLineGesture]);

  // A tap outside every arming surface dismisses, and so does Escape.
  // Surfaces mark themselves with `data-lyric-arm-keep`: syllable
  // chips, beat cells, the edit popover, and the placement prompt.
  useDismissOnOutside(Boolean(arming), {
    keep: '[data-lyric-arm-keep]',
    onDismiss: dismissArming,
  });

  // Drop the wait if the line itself stops existing (deleted mid-
  // gesture). The snapshot goes with it — there is nothing to restore
  // it onto.
  useEffect(() => {
    if (!awaitingLineEndId) return;
    if (!songLyricLines?.some(l => l.id === awaitingLineEndId)) {
      lineGestureSnapshot.current = null;
      dispatchArming({ type: 'line-removed', lineId: awaitingLineEndId });
    }
  }, [songLyricLines, awaitingLineEndId]);

  const handleArmSyllable = useCallback((syllableId: string) => {
    dispatchArming({ type: 'tap-syllable', syllableId });
  }, []);

  /** A word picked from a drawer row. Same arming intent a grid chip
   *  tap produces — pick mode is drawer UI, not a third kind — and the
   *  drawer gets out of the way so the grid is tappable. */
  const handleArmWord = useCallback((syllableId: string) => {
    dispatchArming({ type: 'tap-syllable', syllableId });
    setDrawerOpen(false);
  }, []);

  const handleSyllablePlaced = useCallback(() => {
    // Beat two completing is also what retires the snapshot: the
    // gesture finished, so there is no longer anything to roll back.
    lineGestureSnapshot.current = null;
    dispatchArming({ type: 'placed' });
  }, []);

  /** Beat one landed. `snapshot` is the line as it was before the
   *  write, captured by the section that owns the drop. */
  const handleLineHeadPlaced = useCallback(
    (lineId: string, snapshot: LyricSyllable[]) => {
      lineGestureSnapshot.current = { lineId, syllables: snapshot };
      dispatchArming({ type: 'await-line', lineId, edge: 'end' });
    },
    [],
  );

  // --- the drawer ---------------------------------------------------
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [progressionsOpen, setProgressionsOpen] = useState(false);
  // MUTUALLY EXCLUSIVE. Both are half-height panels docked at the same
  // edge; two open at once would leave almost no grid visible, and the
  // sibling exclusion in each drawer's docking measurement assumes only
  // one is ever expanded.
  const openLyrics = useCallback((next: boolean) => {
    setDrawerOpen(next);
    if (next) setProgressionsOpen(false);
  }, []);
  const openProgressions = useCallback((next: boolean) => {
    setProgressionsOpen(next);
    if (next) setDrawerOpen(false);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // Same mechanism as arming, different keep region — an open drawer is
  // a half-screen panel and tapping the grid behind it should get out
  // of the way rather than needing the strip tapped again.
  useDismissOnOutside(drawerOpen, {
    keep: '[data-lyric-drawer]',
    onDismiss: closeDrawer,
  });

  /** Tapping a line in the drawer arms BEAT ONE and gets out of the
   *  way. The drawer builds no arming UI of its own — the anchored
   *  prompt already owns that job, and a second one at the bottom of
   *  the screen is the mistake this session corrected twice. */
  /** Raw pasted text in, parsed once here at the write. */
  /**
   * Turning eighths ON migrates this song's chord DURATIONS to eighth
   * units. LAZY on purpose: a song where eighths is never enabled has
   * no reason to have every placement rewritten, so only songs
   * deliberately opted in are touched.
   *
   * Turning it OFF is REFUSED while anything sits on an offbeat —
   * those positions stop existing, and a preference toggle does not
   * get to discard placed work. The caller shows the count.
   */
  const offbeatOccupants = useCallback(() => {
    const chords = sections.reduce(
      (n, sec) =>
        n + (sec.chordPlacements ?? []).filter(p => p.offbeat).length,
      0,
    );
    const words = (song?.lyricLines ?? []).reduce(
      (n, l) => n + (l.syllables ?? []).filter(sy => sy.anchor?.offbeat).length,
      0,
    );
    return { chords, words };
  }, [sections, song?.lyricLines]);

  const setEighths = useCallback(
    async (on: boolean) => {
      const fresh = await db.songs.get(songId);
      if (!fresh) return;
      await db.songs.put({ ...fresh, eighths: on, updatedAt: Date.now() });
      if (!on) return;
      // Durations become eighth units, once, on first enable. Routed
      // through the repair helper so enable and repair cannot drift
      // apart: same exclusions, same stamp, one definition.
      for (const sec of sections) {
        const patch = repairSectionDurations(sec);
        if (patch) await db.songSections.update(sec.id, patch);
      }
    },
    [songId, sections],
  );

  /**
   * Songs that had eighths turned on BEFORE the toggle learned to
   * double are still counted in beats. Repair them where they are
   * found, once, then record the unit so this never re-runs.
   *
   * Sections with no stored `chordPlacements` are excluded by
   * `planDurationRepair` — see `RepairSkipReason`. They were never
   * broken and materialisation already hands them over in slots.
   */
  useEffect(() => {
    if (!song?.eighths) return;
    if (sections.length === 0) return;
    const plan = planDurationRepair(sections);
    if (plan.sectionsToDouble === 0) return;
    let cancelled = false;
    void (async () => {
      for (const decision of plan.decisions) {
        if (cancelled) return;
        if (!decision.double) continue;
        const sec = sections.find(s => s.id === decision.sectionId);
        if (!sec) continue;
        const patch = repairSectionDurations(sec);
        if (patch) await db.songSections.update(sec.id, patch);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [song?.eighths, sections]);

  /**
   * Clear strip hides that name a chord no longer in the grid.
   *
   * Deletions before 13.1 left them behind, and a dead hide is not
   * merely inert: it filters nothing, renders nothing, and no surface
   * can reach it, so it can never be undone. The drawer will not
   * surface them either — there is no chord left to draw greyed out.
   *
   * ONLY HIDES. Orphaned BREAKS are left exactly as they are:
   * `buildPhrases` carries a dead break's note forward into the next
   * surviving phrase, so they already behave correctly, and removing
   * them would destroy phrase notes the user wrote.
   */
  useEffect(() => {
    if (!song || sections.length === 0) return;
    const target = song;
    let cancelled = false;
    void (async () => {
      for (const sec of sections) {
        if (cancelled) return;
        const built = buildSectionProgression(target, sec);
        const patch = clearOrphanedHides(sec, built?.order ?? []);
        if (patch) await db.songSections.update(sec.id, patch);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [song, sections]);

  /** The song's chord movement, section by section. A VIEW over the
   *  same per-section `sequenceView` records the strip writes — the
   *  drawer and the strip are two windows onto one thing. */
  const progression = useMemo(
    () => (song ? buildSongProgression(song, sections) : []),
    [song, sections],
  );

  /** Every progression edit routes through here: same pure helpers the
   *  per-section strip uses, same stored record. `order` comes from the
   *  model so break sorting matches what is on screen. */
  const editSequenceView = useCallback(
    async (
      sectionId: string,
      apply: (view: SequenceView, order: string[]) => SequenceView,
    ) => {
      const sec = sections.find(s => s.id === sectionId);
      if (!sec) return;
      const order =
        progression.find(p => p.sectionId === sectionId)?.order ?? [];
      const next = apply(sec.sequenceView ?? EMPTY_SEQUENCE_VIEW, order);
      await db.songSections.update(sectionId, { sequenceView: next });
    },
    [sections, progression],
  );

  const [eighthsRefusal, setEighthsRefusal] = useState<
    { chords: number; words: number } | null
  >(null);
  /** Sections whose durations cannot go back to beats. Non-null means
   *  the last attempt to turn eighths off was refused outright. */
  const [halveRefusal, setHalveRefusal] = useState<HalveBlocker[] | null>(null);

  const handleToggleEighths = useCallback(async () => {
    if (song?.eighths) {
      const occupied = offbeatOccupants();
      if (occupied.chords + occupied.words > 0) {
        setEighthsRefusal(occupied);
        return;
      }
      // ALL OR NOTHING. Decide over the whole song first, and write
      // only if every section can go back. A song whose setting says
      // quarters while one section still holds slot units is wrong
      // about itself, and refusing is the same move `halveChordDurations`
      // already makes on a single value.
      const plan = planDurationHalving(sections);
      if (plan.blockers.length > 0) {
        setHalveRefusal(plan.blockers);
        return;
      }
      // One transaction: the durations, the stamps, and the song's own
      // setting land together or not at all, so the stamp and the
      // setting cannot end up disagreeing in either direction.
      //
      // Full `put`, not `update`: Dexie strips undefined out of an
      // update patch, so `update` can set a field but never clear one.
      // Same reason `commit` in LeadSheetSection routes clears through
      // onReplace.
      const byId = new Map(sections.map(s => [s.id, s]));
      await db.transaction('rw', db.songs, db.songSections, async () => {
        for (const { sectionId, chordPlacements } of plan.patches) {
          const sec = byId.get(sectionId);
          if (!sec) continue;
          const next: SongSection = { ...sec, chordPlacements };
          delete next.eighthsDurationVersion;
          await db.songSections.put(next);
        }
        const fresh = await db.songs.get(songId);
        if (fresh) {
          await db.songs.put({ ...fresh, eighths: false, updatedAt: Date.now() });
        }
      });
      return;
    }
    await setEighths(true);
  }, [song?.eighths, songId, sections, offbeatOccupants, setEighths]);

  const handleAddLines = useCallback(
    async (text: string) => {
      const rows = parseLyricSheet(text);
      if (rows.length === 0) return;
      await commitSongLyrics([
        ...(song?.lyricLines ?? []),
        ...linesFromParsedRows(rows),
      ]);
    },
    [song?.lyricLines, commitSongLyrics],
  );

  /** Return a whole line's words to unplaced, keeping its text. Same
   *  pure path the per-section tray's arrow uses — one un-place, two
   *  surfaces. */
  const handleUnplaceLine = useCallback(
    async (lineId: string) => {
      if (!song?.lyricLines) return;
      const next = unplaceLine(song.lyricLines, lineId);
      if (next === song.lyricLines) return;
      await commitSongLyrics(next);
    },
    [song?.lyricLines, commitSongLyrics],
  );

  const handleDuplicateLine = useCallback(
    async (lineId: string) => {
      if (!song?.lyricLines) return;
      await commitSongLyrics(duplicateLine(song.lyricLines, lineId));
    },
    [song?.lyricLines, commitSongLyrics],
  );

  const handleSetLineKind = useCallback(
    async (lineId: string, kind: 'lyric' | 'header') => {
      if (!song?.lyricLines) return;
      const next = setLineKind(song.lyricLines, lineId, kind);
      await commitSongLyrics(next);
    },
    [song?.lyricLines, commitSongLyrics],
  );

  const handleArmLine = useCallback((lineId: string) => {
    lineGestureSnapshot.current = null;
    dispatchArming({ type: 'await-line', lineId, edge: 'start' });
    setDrawerOpen(false);
  }, []);

  // --- where the beat-two prompt sits -------------------------------
  // Anchored to the cell the line's head just landed in, not parked at
  // the bottom of the viewport. Same reason the refusal message moved:
  // the user is looking at the cell, not at the screen edge.
  //
  // Derived from the STORE rather than remembered from the drop —
  // beat one places `syllables[0]`, so its anchor IS the drop cell, and
  // deriving it means the prompt follows if that anchor ever moves.
  // Anchored to the cell the line's head sits in. At the START edge
  // nothing is placed yet, so there is genuinely nothing to point at
  // and the geometry parks the prompt at the bottom edge — above the
  // drawer, since the drawer is bottom chrome.
  /**
   * WHEN A PROMPT IS NEEDED, and what it points at.
   *
   * One rule decides both: **show it when the armed thing has nothing
   * on screen to look at.** An armed syllable that is already placed
   * wears the inverted chip in its cell and speaks for itself; an
   * armed syllable with no anchor — picked out of the drawer, which
   * then collapsed — leaves a field of hinted cells and no indication
   * of what is being placed. Same for a line whose head is not down
   * yet.
   *
   * The anchor follows from the same fact: if there were something to
   * look at there would be a cell to point at, so the no-anchor cases
   * park at the screen edge by definition.
   */
  const prompt = useMemo((): { text: string; anchorCellKey: string | null } | null => {
    if (awaitingLine) {
      if (awaitingLine.edge === 'start') {
        return { text: 'tap the beat where this line starts', anchorCellKey: null };
      }
      const head = songLyricLines?.find(l => l.id === awaitingLine.lineId)
        ?.syllables?.[0]?.anchor;
      return {
        text: 'tap the beat where this line ends',
        anchorCellKey: head ? cellKey(head) : null,
      };
    }
    if (!armedSyllableId || !songLyricLines) return null;
    const found = findSyllable(songLyricLines, armedSyllableId);
    // Placed and visible: the armed chip is the prompt.
    if (!found || found.syllable.anchor) return null;
    return {
      text: `tap the beat for “${found.syllable.text}”`,
      anchorCellKey: null,
    };
  }, [awaitingLine, armedSyllableId, songLyricLines]);

  const promptAnchorCellKey = prompt?.anchorCellKey ?? null;

  const [promptAnchorNode, setPromptAnchorNode] = useState<HTMLElement | null>(
    null,
  );
  const [promptPos, setPromptPos] = useState<OverlayPosition | null>(null);

  // Unlike the refusal message — which is measured once because it is
  // gone in ~2s — this prompt outlives scrolling, so its position is
  // re-derived continuously while it is up. A rAF loop rather than
  // scroll listeners: the app scrolls an INNER container, so a window
  // scroll listener would be watching the wrong thing, and a loop also
  // catches layout shifts that fire no scroll event at all. It only
  // sets state when the computed position actually changes, so a
  // stationary prompt costs one rect read per frame and no re-renders.
  //
  // Note for anyone tracing the parked drag-ring bug: this measures a
  // cell to POSITION AN OVERLAY. It feeds nothing into collision
  // detection, `over`, or the drop ring, and runs between taps rather
  // than during a drag.
  useEffect(() => {
    if (!prompt) {
      setPromptPos(null);
      return;
    }
    let raf = 0;
    let last: OverlayPosition | null = null;
    const tick = () => {
      const rect = promptAnchorNode?.getBoundingClientRect();
      const next = anchoredOverlayPosition({
        cell: rect ? toAnchorRect(rect) : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        box: { width: OVERLAY_MAX_W, height: OVERLAY_H },
        gap: OVERLAY_GAP,
        edgePad: OVERLAY_EDGE_PAD,
        safeArea: measureSafeArea(),
      });
      if (
        !last ||
        last.left !== next.left ||
        last.top !== next.top ||
        last.placement !== next.placement
      ) {
        last = next;
        setPromptPos(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [prompt, promptAnchorNode]);


  // Lazy fold: the first time a song is opened after the redesign,
  // collapse its per-section lyrics into the song-level store.
  // Positions import as PLACED at the cells the legacy renderer already
  // puts them in, so the first render after migration matches the last
  // one before it. Runs once per song — `song.lyricLines !== undefined`
  // is the guard, mirroring how `section.chordPlacements` gates the
  // chord migration.
  //
  // Songs with no lyrics initialise to `[]` rather than being skipped.
  // Leaving them un-migrated would strand them on the legacy write path
  // indefinitely — a first paste would land in `section.lyricLines` and
  // only fold on a later reload. One small write per song, once, buys a
  // uniform model with no half-states.
  //
  // `sections.length === 0` covers BOTH "still loading" and "genuinely
  // sectionless"; waiting in either case is right, since initialising
  // to `[]` before the sections arrive would discard their legacy lines.
  //
  // Re-runs when the store predates the current LYRIC_FOLD_VERSION —
  // that's how the v1 fold's damage gets repaired, and it's lossless
  // because the fold only ever READS `section.lyricLines`.
  const foldInFlight = useRef(false);
  useEffect(() => {
    if (!song) return;
    const needsFold =
      song.lyricLines === undefined ||
      (song.lyricFoldVersion ?? 0) < LYRIC_FOLD_VERSION;
    if (!needsFold) return;
    if (sections.length === 0 || foldInFlight.current) return;
    foldInFlight.current = true;
    void (async () => {
      try {
        const folded = foldSectionLyrics(
          sections.map(s => ({
            sectionId: s.id,
            beatsPerBar: parseTimeSignature(effectiveTimeSignature(song, s))
              .beatsPerBar,
            lyricLines: s.lyricLines,
          })),
        );
        await commitSongLyrics(folded);
      } finally {
        foldInFlight.current = false;
      }
    })();
  }, [song, sections, commitSongLyrics]);

  // Full-record replace used by the lead-sheet undo path. Necessary
  // because `Table.update(key, patch)` strips `undefined` values from
  // `patch` (treats them as "no change") rather than honoring them as
  // deletions — so restoring a snapshot that captured `undefined`
  // fields silently fails. `put` replaces the whole row, undefined and
  // all, so the restore lands correctly.
  const replaceSection = async (next: SongSection) => {
    await db.songSections.put(next);
  };

  // Section delete with full-state undo. Snapshot the section row +
  // every related progress/chord row so Undo restores the exact
  // prior state.
  /** Words anchored into a section, which its deletion leaves
   *  homeless. A LINE may also have words in other sections; only the
   *  part inside this one is affected. */
  const wordsInSection = useCallback(
    (sectionId: string) =>
      song?.lyricLines
        ? anchorsMatching(song.lyricLines, a => a.sectionId === sectionId)
        : [],
    [song?.lyricLines],
  );

  const deleteSection = async (section: SongSection) => {
    const [chordRows, ckRows] = await Promise.all([
      db.songChords.where('sectionId').equals(section.id).toArray(),
      db.songCrossKeyProgress.where('[songId+sectionId]').equals([section.songId, section.id]).toArray(),
    ]);
    // Un-place anything anchored here BEFORE the section row goes, so
    // the words return to the drawer rather than becoming anchors
    // pointing at a section that no longer exists. Words of the same
    // LINE anchored in other sections keep their anchors — a line can
    // span sections, and only the part inside this one is homeless.
    if (song?.lyricLines) {
      const cleared = unplaceAnchorsMatching(
        song.lyricLines,
        a => a.sectionId === section.id,
      );
      if (cleared !== song.lyricLines) await commitSongLyrics(cleared);
    }
    await db.transaction('rw', [db.songSections, db.songChords, db.songCrossKeyProgress], async () => {
      await db.songSections.delete(section.id);
      if (chordRows.length > 0) await db.songChords.bulkDelete(chordRows.map(r => r.id));
      if (ckRows.length > 0) await db.songCrossKeyProgress.bulkDelete(ckRows.map(r => r.id));
    });
    toast({
      message: `Section deleted: ${section.name}`,
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => {
          await db.transaction('rw', [db.songSections, db.songChords, db.songCrossKeyProgress], async () => {
            await db.songSections.add(section);
            if (chordRows.length > 0) await db.songChords.bulkAdd(chordRows);
            if (ckRows.length > 0) await db.songCrossKeyProgress.bulkAdd(ckRows);
          });
          setFlashSectionId(section.id);
          requestAnimationFrame(() => flash(`section-${section.id}`));
        },
      },
    });
  };

  const moveSection = async (section: SongSection, dir: -1 | 1) => {
    const plan = planSectionMove(sections, section.id, dir);
    if (!plan) return;
    await db.transaction('rw', [db.songSections], async () => {
      await db.songSections.update(plan.moved.id, { order: plan.moved.order });
      await db.songSections.update(plan.neighbour.id, { order: plan.neighbour.order });
    });
    setFlashSectionId(section.id);
    requestAnimationFrame(() => flash(`section-${section.id}`));
  };

  // Signals whether a section carries enough user-entered work that
  // deletion should go through a confirm dialog first. Lyrics alone
  // don't qualify (seeds ship with lyrics pre-populated); it's chords,
  // alternates, or notes that imply real effort.
  const sectionHasUserContent = (s: SongSection): boolean => {
    const anyChordTokens = (s.phrases ?? []).some(p => {
      // Legacy pre-beat chord blob.
      if ((p.chords ?? '').trim() !== '') return true;
      // Any arrangement has at least one non-empty ChordFunction
      // placement. `function` or `raw` carrying content both count.
      const placements = p.chordsByArrangement ?? {};
      for (const perArrangement of Object.values(placements)) {
        for (const chord of Object.values(perArrangement)) {
          if (chord.function !== '' || (chord.raw ?? '').trim() !== '') return true;
        }
      }
      return false;
    });
    const anyAlt = (s.alternateChords ?? '').trim() !== '' || (s.alternateNote ?? '').trim() !== '';
    const anyNotes = (s.notes ?? '').trim() !== '';
    const legacyChords = (s.basicChords ?? '').trim() !== '';
    // More than one arrangement means user has created additional
    // chord variations beyond the default — treat as user content.
    const multipleArrangements = (s.arrangements ?? []).length > 1;
    return anyChordTokens || anyAlt || anyNotes || legacyChords || multipleArrangements;
  };

  // Wrap deleteSection to route through a confirm dialog when the
  // section carries user work. Empty seed-only sections bypass the
  // confirm and go straight to the undo-toast path.
  const requestDeleteSection = (section: SongSection) => {
    if (sectionHasUserContent(section)) {
      setConfirmDeleteSection(section);
    } else {
      deleteSection(section);
    }
  };

  const doDeleteSongConfirmed = async () => {
    if (!song) return;
    setConfirmDeleteSong(false);
    await performDeleteSong();
  };

  const performDeleteSong = async () => {
    if (!song) return;
    const skillId = canonicalSkillId('repertoire', 'song', song.id);
    const title = song.title;
    await db.transaction('rw', [
      db.songs,
      db.songSections,
      db.songChords,
      db.songPracticeLog,
      db.songCrossKeyProgress,
      db.skillAnnotations,
      db.harmonicDiaryEntries,
    ], async () => {
      const [sectionRows, chordRows, logRows, ckRows, diaryRows] = await Promise.all([
        db.songSections.where('songId').equals(song.id).toArray(),
        db.songChords.where('songId').equals(song.id).toArray(),
        db.songPracticeLog.where('songId').equals(song.id).toArray(),
        db.songCrossKeyProgress.where('songId').equals(song.id).toArray(),
        db.harmonicDiaryEntries.where('skillId').equals(skillId).toArray(),
      ]);
      await Promise.all([
        db.songSections.bulkDelete(sectionRows.map(r => r.id)),
        db.songChords.bulkDelete(chordRows.map(r => r.id)),
        db.songPracticeLog.bulkDelete(logRows.map(r => r.id)),
        db.songCrossKeyProgress.bulkDelete(ckRows.map(r => r.id)),
        db.skillAnnotations.delete(skillId),
        db.harmonicDiaryEntries.bulkDelete(diaryRows.map(r => r.entryId)),
        db.songs.delete(song.id),
      ]);
    });
    toast({ message: `Deleted "${title}" and all associated data.`, variant: 'warning' });
    onBackToActive();
  };

  // Clean up the one-shot flash state once the highlight animation has
  // finished its own lifecycle (handled inside the hook).
  useEffect(() => {
    if (flashSectionId === null) return;
    const t = window.setTimeout(() => setFlashSectionId(null), 1800);
    return () => window.clearTimeout(t);
  }, [flashSectionId]);

  if (!song) {
    return (
      <section className="rounded-2xl border border-black/[0.07] p-5 text-sm text-neutral-500">
        loading song…
      </section>
    );
  }

  const hasDescription = Boolean(song.description && song.description.trim().length > 0);

  return (
    <div className="space-y-5">
      {/* Top nav */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <button
          onClick={onBackToActive}
          className="text-neutral-500 hover:text-fluent"
        >
          ← back to active repertoire
        </button>
        {songs.length > 1 && (
          <label className="inline-flex items-center gap-2 text-neutral-500">
            open:
            <select
              value={song.id}
              onChange={e => onSelectSong(e.target.value)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
            >
              {songs.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Metadata */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3">
        {editingMeta ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">title</span>
                <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">artist</span>
                <input value={artistDraft} onChange={e => setArtistDraft(e.target.value)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">genre</span>
                <input value={genreDraft} onChange={e => setGenreDraft(e.target.value)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">original key</span>
                <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} placeholder="e.g. G or Db" className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">tempo</span>
                <input value={tempoDraft} onChange={e => setTempoDraft(e.target.value)} placeholder="80 BPM or 70–85" className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">time signature</span>
                <select
                  value={timeSigPreset}
                  onChange={e => setTimeSigPreset(e.target.value)}
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
                >
                  <option value="">— none —</option>
                  {TIME_SIGNATURE_PRESETS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  <option value="Other">Other…</option>
                </select>
                {timeSigPreset === 'Other' && (
                  <input
                    value={timeSigCustom}
                    onChange={e => setTimeSigCustom(e.target.value)}
                    placeholder="e.g. 9/8 or 11/8"
                    className="mt-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
                  />
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">spotify link</span>
                <input value={spotifyDraft} onChange={e => setSpotifyDraft(e.target.value)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 font-mono text-xs" />
              </label>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">reference videos</span>
                {referenceVideosDraft.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">
                    no videos yet — tap "+ Add video" to link a recording, tutorial, or cover.
                  </p>
                ) : (
                  referenceVideosDraft.map(video => (
                    <div
                      key={video.id}
                      className="flex flex-col gap-1 p-2 rounded-md border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          value={video.url}
                          onChange={e => updateReferenceVideoDraft(video.id, { url: e.target.value })}
                          placeholder="https://..."
                          className="flex-1 min-w-0 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeReferenceVideoDraft(video.id)}
                          aria-label="remove video"
                          title="remove this video"
                          className="px-2 py-1 text-neutral-400 hover:text-needswork shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        value={video.label ?? ''}
                        onChange={e => updateReferenceVideoDraft(video.id, { label: e.target.value })}
                        placeholder="e.g. Jazz version, Tutorial, Original recording"
                        className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs"
                      />
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={addReferenceVideoDraft}
                  className="self-start px-2 py-1 rounded-md text-xs text-neutral-500 hover:text-fluent border border-dashed border-neutral-300 dark:border-neutral-600 hover:border-fluent transition-colors"
                >
                  + Add video
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={saveMeta} className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90">save</button>
              <button onClick={() => setEditingMeta(false)} className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs">cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-medium tracking-tight">{song.title}</h2>
                <div className="text-sm text-neutral-500">{song.artist}{song.genre ? ` · ${song.genre}` : ''}</div>
              </div>
              <button onClick={openEdit} className="text-xs text-neutral-500 hover:text-fluent">edit</button>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-500">
              {song.key && (
                <span>
                  key: <span className="font-mono text-neutral-700 dark:text-neutral-200">{song.key}</span>
                  {song.keyNeedsVerification && <span className="ml-1 text-developing" title="estimated — verify with recording">?</span>}
                </span>
              )}
              {song.tempoLabel && <span>tempo: {song.tempoLabel}</span>}
              {song.timeSignature && (
                <span>
                  time: <span className="font-mono text-neutral-700 dark:text-neutral-200">{song.timeSignature}</span>
                </span>
              )}
            </div>
          </>
        )}
      </section>

      {/* Drag-to-reorder section list. Each entry in sectionOrder
          renders inside a SortableSection wrapper so the user can
          rearrange them per-song. The meta header above and the
          cross-key / practice history / danger zone below stay
          fixed — only the five named sections participate. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-5">
            {sectionOrder.map(key => (
              <SortableSection key={key} id={key}>
                {key === 'leadSheet' && (
                  // No backdrop-blur: it's a no-op on this opaque card AND
                  // would establish a containing block that makes the mobile
                  // voicing bottom sheet (position: fixed) anchor to the card
                  // instead of the viewport. See LEAD_SHEET_PLAY_MODE_DESIGN.md.
                  <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] p-3 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 pr-10">
                      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">lead sheet</h3>
                      <div className="flex items-center gap-3 flex-wrap text-xs">
                        {/* Editing chrome (notation / add / reorder) is
                            hidden in play mode; only the play/exit toggle
                            remains. */}
                        {!playMode && (
                          <>
                            <label className="inline-flex items-center gap-1 text-neutral-500">
                              notation:
                              <select
                                value={notationMode}
                                onChange={e => { void setNotationMode(e.target.value as NotationMode); }}
                                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5"
                                title="changes how chord functions display across the whole app"
                              >
                                {(Object.keys(NOTATION_LABEL) as NotationMode[]).map(m => (
                                  <option key={m} value={m}>{NOTATION_LABEL[m]}</option>
                                ))}
                              </select>
                            </label>
                            {/* Song-level, never per-bar or per-section:
                                mixing resolutions within a song would
                                make the beat axis mean different things
                                in different places. */}
                            <button
                              type="button"
                              onClick={() => void handleToggleEighths()}
                              aria-pressed={song.eighths === true}
                              title="show the ‘and’ of every beat across this song"
                              className={`px-2 py-0.5 rounded-full border ${
                                song.eighths
                                  ? 'border-fluent bg-fluent/10 text-fluent'
                                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                              }`}
                            >
                              eighths
                            </button>
                            <button
                              onClick={addSection}
                              className="text-neutral-500 hover:text-fluent"
                            >
                              + add section
                            </button>
                            {(sections.length > 1 || reorderMode) && (
                              <button
                                onClick={() => { setReorderMode(v => !v); setPlayMode(false); }}
                                className="text-neutral-500 hover:text-fluent"
                              >
                                {reorderMode ? 'done' : 'reorder'}
                              </button>
                            )}
                          </>
                        )}
                        {sections.length > 0 && (
                          <div
                            role="tablist"
                            aria-label="lead sheet view"
                            className="inline-flex items-center gap-1 p-0.5 rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900/40"
                          >
                            <button
                              type="button"
                              onClick={() => setPlayMode(false)}
                              aria-pressed={!playMode}
                              className={`px-3 py-1 text-xs rounded-md transition ${
                                !playMode
                                  ? 'bg-fluent text-white'
                                  : 'text-neutral-500 hover:text-fluent'
                              }`}
                            >
                              edit
                            </button>
                            <button
                              type="button"
                              onClick={() => { setPlayMode(true); setReorderMode(false); }}
                              aria-pressed={playMode}
                              className={`px-3 py-1 text-xs rounded-md transition ${
                                playMode
                                  ? 'bg-fluent text-white'
                                  : 'text-neutral-500 hover:text-fluent'
                              }`}
                            >
                              play
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {sections.length === 0 ? (
                      <p className="text-xs text-neutral-500 italic">no sections yet. click "+ add section" to start.</p>
                    ) : (
                      <div className={playMode ? 'space-y-1' : 'space-y-3'}>
                        {sections.map((s, idx) => (
                          <LeadSheetSection
                            key={s.id}
                            song={song}
                            section={s}
                            reorderMode={reorderMode}
                            playMode={playMode}
                            canMoveUp={idx > 0}
                            canMoveDown={idx < sections.length - 1}
                            highlighted={isHighlighted(`section-${s.id}`) || flashSectionId === s.id}
                            onChange={patch => updateSection(s.id, patch)}
                            onReplace={replaceSection}
                            onMoveUp={() => moveSection(s, -1)}
                            onMoveDown={() => moveSection(s, 1)}
                            onDelete={sections.length > 1 ? async () => { requestDeleteSection(s); } : undefined}
                            songLyricLines={songLyricLines}
                            cellIndex={cellIndex}
                            beatAxis={beatAxis}
                            markerIndex={markerIndex}
                            onSongLyricsChange={commitSongLyrics}
                            armedSyllableId={armedSyllableId}
                            onArmSyllable={handleArmSyllable}
                            onSyllablePlaced={handleSyllablePlaced}
                            awaitingLine={awaitingLine}
                            onLineHeadPlaced={handleLineHeadPlaced}
                            onArmLine={handleArmLine}
                            onArmWord={handleArmWord}
                            onSetLineKind={handleSetLineKind}
                            onDuplicateLine={handleDuplicateLine}
                            promptAnchorCellKey={promptAnchorCellKey}
                            onPromptAnchorNode={setPromptAnchorNode}
                            onRefusalNotice={handleRefusalNotice}
                            patternsCollapsed={patternsCollapsed}
                            onTogglePatterns={handleTogglePatterns}
                            lyricTrayCollapsed={lyricTrayCollapsed}
                            onToggleLyricTray={handleToggleLyricTray}
                          />
                        ))}
                      </div>
                    )}
                    {/* Full lyrics collapsible — opens via "Show full
                        lyrics" toggle, closed by default. The full
                        lyrics live HERE now rather than as a
                        standalone section. */}
                    <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                      {/* Label is static now — the chevron carries the
                          state, so "Show…"/"Hide…" said it twice. */}
                      <SectionToggle
                        label="full lyrics"
                        expanded={showFullLyrics}
                        onToggle={() => setShowFullLyrics(v => !v)}
                      />
                      {showFullLyrics && (
                        <div className="mt-3">
                          <FullLyricsSection song={song} onSave={saveFullLyrics} />
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {key === 'matrix' && (
                  <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3">
                    <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300 pr-10">matrix</h3>
                    <SongMatrixView song={song} onClose={() => {}} embedded />
                  </section>
                )}

                {key === 'learningStatus' && (
                  <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3">
                    <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300 pr-10">learning status</h3>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium rounded-full px-3 py-1 border ${STAGE_BADGE_CLASS[currentStage]}`}>
                          {STAGE_LABEL[currentStage]}
                        </span>
                        <span className="text-[11px] italic text-neutral-500">{STAGE_TAGLINE[currentStage]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-neutral-500 inline-flex items-center gap-1">
                          change stage:
                          <select
                            value={currentStage}
                            onChange={e => setStage(e.target.value as RepertoireStage)}
                            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
                          >
                            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                          </select>
                        </label>
                        {nextStageOption && (
                          <button
                            onClick={() => setStage(nextStageOption)}
                            className="px-3 py-1 rounded-md border border-fluent text-fluent text-xs font-medium hover:bg-fluent/10"
                          >
                            advance to {STAGE_LABEL[nextStageOption]} →
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 dark:text-neutral-200 italic leading-snug">
                      {STAGE_GUIDANCE[currentStage]}
                    </p>
                    {advancement.suggest && advancement.reason && (
                      <div className="rounded-md border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-fluent">
                        <span aria-hidden className="mr-1.5">✨</span>
                        {advancement.reason}
                      </div>
                    )}
                  </section>
                )}

                {key === 'whyAndLinks' && (
                  <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3">
                    <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300 pr-10">why this song</h3>
                    {whyEditing ? (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={whyDraft}
                          autoFocus
                          onChange={e => setWhyDraft(e.target.value)}
                          placeholder="what drew you to it, what you want to learn from it"
                          className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <button onClick={saveWhy} className="px-3 py-1 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90">save</button>
                          <button onClick={() => setWhyEditing(false)} className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs">cancel</button>
                        </div>
                      </div>
                    ) : hasDescription ? (
                      <div className="flex items-start justify-between gap-2">
                        <p className="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200">
                          {song.description}
                        </p>
                        <button onClick={openWhyEditor} className="text-[11px] text-neutral-500 hover:text-fluent shrink-0">edit</button>
                      </div>
                    ) : (
                      <button
                        onClick={openWhyEditor}
                        className="text-xs text-neutral-500 hover:text-fluent"
                      >
                        + add a note about this song
                      </button>
                    )}
                    {(song.spotifyLink
                      || (song.referenceVideos && song.referenceVideos.length > 0)
                      || song.youtubeLink) && (
                      <div className="flex items-center gap-3 flex-wrap text-xs pt-1">
                        {song.spotifyLink && (
                          <a href={song.spotifyLink} target="_blank" rel="noopener noreferrer" className="text-fluent hover:underline">spotify ↗</a>
                        )}
                        {song.referenceVideos && song.referenceVideos.length > 0
                          ? song.referenceVideos.map(video => (
                              <a
                                key={video.id}
                                href={video.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-fluent hover:underline"
                              >
                                {(video.label && video.label.trim() !== '')
                                  ? video.label
                                  : hostnameOf(video.url)} ↗
                              </a>
                            ))
                          // Legacy fallback — un-migrated songs still surface
                          // their old single YouTube link until the user opens
                          // the editor and saves (which migrates + clears it).
                          : song.youtubeLink && (
                            <a href={song.youtubeLink} target="_blank" rel="noopener noreferrer" className="text-fluent hover:underline">
                              youtube ↗
                            </a>
                          )}
                      </div>
                    )}
                  </section>
                )}

                {key === 'associations' && (
                  <SongAssociationsSection song={song} />
                )}
              </SortableSection>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Cross-key grid */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">cross-key mastery</h3>
        {sections.filter(s => !s.hidden).length === 0 ? (
          <p className="text-xs text-neutral-500 italic">add a section to start tracking cross-key practice.</p>
        ) : (
          <div className="space-y-4">
            {sections.filter(s => !s.hidden).map(s => (
              <div key={s.id} className="space-y-1">
                <div className="text-xs font-medium">{s.name}</div>
                <CrossKeyGrid
                  songId={song.id}
                  section={s}
                  originalKey={song.key}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Practice history + heatmap */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">practice history</h3>
          <button
            onClick={() => setShowLogModal(true)}
            className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
          >
            + log a practice session
          </button>
        </div>
        <SongHeatmap logs={logs} />
        <PracticeHistory logs={logs} sections={sections} />
      </section>

      {/* Danger zone — destructive actions, visually separated from
          the rest of the page so nothing is clicked by accident. */}
      <section className="rounded-2xl border border-needswork/30 bg-needswork/5 p-3 sm:p-5 space-y-2">
        <h3 className="text-sm font-medium uppercase tracking-wide text-needswork">
          danger zone
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Permanently remove this song and every record tied to it — sections, chords, practice history, cross-key progress, Harmonic Diary associations, and Skills Catalogue annotations. This cannot be undone.
        </p>
        <div>
          <button
            onClick={() => setConfirmDeleteSong(true)}
            className="px-3 py-1.5 rounded-md bg-needswork text-white text-xs font-medium hover:opacity-90"
          >
            Delete this song
          </button>
        </div>
      </section>

      {showLogModal && (
        <PracticeLogModal
          song={song}
          sections={sections}
          onClose={() => setShowLogModal(false)}
          onLogged={() => {
            setShowLogModal(false);
            toast({ message: 'Session logged.', variant: 'success' });
          }}
        />
      )}

      {/* High-stakes confirm dialogs — first safety layer; undo toast
          after confirmation is the second layer. */}
      <ConfirmDialog
        open={confirmDeleteSong}
        title={`Delete "${song.title}"?`}
        message={
          <p>
            This permanently deletes <span className="font-medium">{song.title}</span> and all associated practice history, notes, and associations. This cannot be undone.
          </p>
        }
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        onCancel={() => setConfirmDeleteSong(false)}
        onConfirm={doDeleteSongConfirmed}
      />

      <ConfirmDialog
        open={confirmDeleteSection !== null}
        title={`Delete the "${confirmDeleteSection?.name ?? ''}" section?`}
        message={
          confirmDeleteSection && (
            <>
              <p>
                This section has user-entered work:
              </p>
              <ul className="list-disc pl-5 text-xs text-neutral-600 dark:text-neutral-300 space-y-0.5">
                {(() => {
                  const s = confirmDeleteSection;
                  const phraseCount = (s.phrases ?? []).filter(p => {
                    const beatCount = (p.beats ?? []).filter(
                      b => (b.type === 'word' && (b.text ?? '').trim() !== ''),
                    ).length;
                    const chordCount = Object.values(p.chordsByArrangement ?? {})
                      .reduce((acc, placements) =>
                        acc + Object.values(placements).filter(c => c.function !== '' || (c.raw ?? '').trim() !== '').length, 0);
                    const legacy = (p.chords ?? '').trim() !== '' || (p.lyrics ?? '').trim() !== '';
                    return beatCount > 0 || chordCount > 0 || legacy;
                  }).length;
                  const bullets: string[] = [];
                  if (phraseCount > 0) {
                    bullets.push(`${phraseCount} phrase line${phraseCount === 1 ? '' : 's'} with chords or lyrics`);
                  }
                  if ((s.alternateChords ?? '').trim() !== '' || (s.alternateNote ?? '').trim() !== '') {
                    bullets.push('an alternate chord chart / note');
                  }
                  if ((s.notes ?? '').trim() !== '') {
                    bullets.push('section notes');
                  }
                  // Lyrics were never mentioned here, and the section
                  // delete silently orphaned every syllable anchored
                  // into it — including words belonging to lines that
                  // live mostly in OTHER sections.
                  const words = wordsInSection(s.id).length;
                  if (words > 0) {
                    bullets.push(
                      `${words} placed lyric word${words === 1 ? '' : 's'} — ` +
                        `${words === 1 ? 'it returns' : 'they return'} to the ` +
                        `lyrics drawer as unplaced text, and words of the same ` +
                        `line placed in other sections stay where they are`,
                    );
                  }
                  if (bullets.length === 0) bullets.push('chord or note data');
                  return bullets.map((b, i) => <li key={i}>{b}</li>);
                })()}
              </ul>
              <p className="text-xs text-neutral-500">
                You can still undo from the toast right after, but only for 10 seconds.
              </p>
            </>
          )
        }
        confirmLabel="Delete section"
        onCancel={() => setConfirmDeleteSection(null)}
        onConfirm={async () => {
          const s = confirmDeleteSection;
          setConfirmDeleteSection(null);
          if (s) await deleteSection(s);
        }}
      />

      {/* Refusing, not offering to clear. A preference toggle does not
          get to discard placed work — those positions simply stop
          existing, so the user moves or deletes them first. */}
      <ConfirmDialog
        open={eighthsRefusal !== null}
        title="Turn eighths off?"
        message={
          <p>
            {[
              eighthsRefusal?.chords
                ? `${eighthsRefusal.chords} chord${eighthsRefusal.chords === 1 ? '' : 's'}`
                : null,
              eighthsRefusal?.words
                ? `${eighthsRefusal.words} word${eighthsRefusal.words === 1 ? '' : 's'}`
                : null,
            ]
              .filter(Boolean)
              .join(' and ')}{' '}
            sit on offbeats. Move or delete them before turning eighths
            off — those positions stop existing.
          </p>
        }
        confirmLabel="OK"
        variant="default"
        onConfirm={() => setEighthsRefusal(null)}
        onCancel={() => setEighthsRefusal(null)}
      />

      {/* The other refusal: durations that cannot go back to beats.
          Names the sections, because "something is blocking" leaves
          the user with a toggle that just doesn't work and no way to
          find out why. */}
      <ConfirmDialog
        open={halveRefusal !== null}
        title="Turn eighths off?"
        message={
          <p>
            {describeHalveBlockers(halveRefusal ?? [])}{' '}
            {(halveRefusal?.length ?? 0) === 1 ? 'has' : 'have'}{' '}
            {halveRefusal?.reduce((n, b) => n + b.odd.length, 0)} chord
            {halveRefusal?.reduce((n, b) => n + b.odd.length, 0) === 1
              ? ''
              : 's'}{' '}
            an odd number of eighths long, which cannot be expressed in
            whole beats. Nothing was changed. Adjust those durations
            first, then turn eighths off.
          </p>
        }
        confirmLabel="OK"
        variant="default"
        onConfirm={() => setHalveRefusal(null)}
        onCancel={() => setHalveRefusal(null)}
      />

      {/* The lyric drawer. Whole-screen chrome about the SONG, which
          is why it lives at the bottom while the cell-anchored
          overlays do not — see the plan doc's anchoring principle.
          Only when the song's lyric store is live; before migration
          the section-level path still owns lyrics. */}
      <ProgressionDrawer
        sections={progression}
        songKey={song?.key}
        open={progressionsOpen}
        onOpenChange={openProgressions}
        onSetBreak={(sectionId, after, kind) =>
          editSequenceView(sectionId, (v, order) =>
            setBreak(v, after, kind, order),
          )
        }
        onRemoveBreak={(sectionId, after) =>
          editSequenceView(sectionId, (v, order) => removeBreak(v, after, order))
        }
        onSetPhraseNote={(sectionId, after, note) =>
          editSequenceView(sectionId, v => setPhraseNote(v, after, note))
        }
        onToggleHidden={(sectionId, placementId) =>
          editSequenceView(sectionId, v => toggleHidden(v, placementId))
        }
      />

      {songLyricLines && (
        <LyricDrawer
          lines={songLyricLines}
          open={drawerOpen}
          onOpenChange={openLyrics}
          onArmLine={handleArmLine}
          onArmWord={handleArmWord}
          onAddLines={handleAddLines}
          onSetLineKind={handleSetLineKind}
          onDuplicateLine={handleDuplicateLine}
          onLineUnplace={handleUnplaceLine}
        />
      )}

      {/* BEAT TWO's prompt. A slim fixed bar rather than an inline hint
          for two reasons: it stays visible while the grid is scrolled
          to find the end cell, and it gives cancel a large target
          instead of asking the user to hit empty space precisely on a
          page that is mostly tappable cells.
          This is §B1's already-specified pattern ("arming collapses the
          drawer to a slim hint bar, ~40px, fixed bottom, tap here to
          cancel") reused rather than a second vocabulary invented for
          the same job. */}
      {prompt && promptPos && (
        <CellAnchoredMessage
          left={promptPos.left}
          top={promptPos.top}
          z={180}
          /* The BODY passes taps through; only the cancel control takes
             them. A floating prompt sits over the grid, and the end
             cell can easily be the one underneath it. Rather than flip
             away from a target we cannot know in advance, the prompt
             simply never blocks one. */
          className="flex items-start justify-between gap-2"
          /* Marked as an arming surface so the document pointerdown
             listener doesn't dismiss on the way to the cancel BUTTON —
             pointerdown fires before click, so without this the
             listener would swallow the gesture and the button would
             never run. */
          armKeep
        >
          {/* No truncation, ever: this sentence is the whole
              instruction, and half of it is not an instruction. */}
          <span>{prompt.text}</span>
          <button
            type="button"
            onClick={dismissArming}
            className="pointer-events-auto shrink-0 rounded-full border border-white/40 dark:border-neutral-900/40 px-1.5 hover:bg-white/10 dark:hover:bg-neutral-900/10"
          >
            cancel
          </button>
        </CellAnchoredMessage>
      )}

      {/* Re-keyed per refusal so a repeat on another cell restarts the
          message rather than leaving the previous one mid-flight.
          pointer-events-none matters: arming SURVIVES a refusal so the
          next cell can be tried immediately, and a message lying over
          the grid must never swallow that tap. */}
      {refusalNotice && (
        <CellAnchoredMessage
          key={refusalNotice.key}
          left={refusalNotice.left}
          top={refusalNotice.top}
          z={190}
          className="text-center"
        >
          {REFUSAL_TEXT[refusalNotice.reason]}
        </CellAnchoredMessage>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// SortableSection — dnd-kit wrapper around a single drag-to-reorder
// section on the song detail page. Mirrors the SortableSongRow
// pattern in ActiveRepertoireView so the two surfaces feel
// consistent. The drag handle sits absolutely positioned at the
// top-right of the section card so each section's existing
// internal header (title, inline controls) stays intact.
// -------------------------------------------------------------------

function SortableSection({
  id,
  children,
}: {
  id: SectionKey;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        aria-label={`drag to reorder ${SECTION_TITLES[id]} section`}
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md border border-black/[0.07] bg-white/80 dark:bg-neutral-900/80 backdrop-blur text-neutral-400 hover:text-neutral-700 hover:border-fluent/40 cursor-grab active:cursor-grabbing touch-none text-xs leading-none"
      >
        <span aria-hidden className="font-mono">≡</span>
      </button>
      {children}
    </div>
  );
}

// -------------------------------------------------------------------
// My associations (per-song) — syncs to the Harmonic Diary so the
// same note shows up in both places. We deliberately keep the UX
// lightweight here: inline textarea, save writes through
// upsertDiaryEntry using the canonical repertoire skill id, and a
// "open in Harmonic Diary" link for tag editing / deeper context.
// -------------------------------------------------------------------

function SongAssociationsSection({ song }: { song: Song }) {
  const skillId = canonicalSkillId('repertoire', 'song', song.id);
  const entry = useLiveQuery<HarmonicDiaryEntry | undefined>(
    () => db.harmonicDiaryEntries.where('skillId').equals(skillId).first(),
    [skillId],
  );

  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const savedText = entry?.userText ?? '';
  const hasSaved = savedText.trim().length > 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dirty) setDraft(savedText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedText]);

  const save = async () => {
    const text = draft.trim();
    await upsertDiaryEntry(skillId, {
      userText: text,
      emotionalTags: entry?.emotionalTags ?? [],
      genreTags: entry?.genreTags ?? [],
      claudeStarterText: entry?.claudeStarterText,
      isStarterEdited: text !== '',
    });
    setDirty(false);
    setEditing(false);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  const cancel = () => {
    setDraft(savedText);
    setDirty(false);
    setEditing(false);
  };

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
            my associations
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            how does this song feel to you? notes here save to your Harmonic Diary.
          </p>
        </div>
        <Link
          to={`/harmonic-diary?skill=${encodeURIComponent(skillId)}`}
          className="text-[11px] text-fluent hover:underline"
        >
          open in Harmonic Diary →
        </Link>
      </div>

      {!editing && hasSaved ? (
        <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{savedText}</p>
          <button
            onClick={() => setEditing(true)}
            className="mt-2 text-[11px] text-fluent hover:underline"
          >
            edit
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={e => { setDraft(e.target.value); setDirty(true); setEditing(true); }}
            rows={3}
            placeholder={entry?.claudeStarterText
              ? `Claude's starter: "${entry.claudeStarterText}" — add your own take.`
              : 'what does this song make you feel? the bridge, a lyric, a chord change that stays with you.'}
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={draft.trim() === savedText && !dirty}
              className={`px-3 py-1.5 rounded-md text-xs font-medium text-white ${
                draft.trim() === savedText && !dirty
                  ? 'bg-neutral-300 dark:bg-neutral-700'
                  : 'bg-fluent hover:opacity-90'
              }`}
            >
              save to harmonic diary
            </button>
            {(editing || dirty) && (
              <button
                onClick={cancel}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
              >
                cancel
              </button>
            )}
            {justSaved && (
              <span className="text-[11px] text-fluent italic">saved</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

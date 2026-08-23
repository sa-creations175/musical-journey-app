import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type HarmonicDiaryEntry,
  type ReferenceVideo,
  type Song,
  type SongKey,
  type SongKeyRunThrough,
  type SongPracticeLog,
  type LyricSyllable,
  type SongLyricLine,
  type SongSection,
  type RepertoireStage,
} from '../../lib/db';
import { upsertDiaryEntry } from '../harmonic-diary/data';
import { canonicalSkillId } from '../skills/registry';
import {
  STAGE_BADGE_CLASS,
  STAGE_GUIDANCE,
  STAGE_LABEL,
  STAGE_TAGLINE,
  deriveStage,
  evaluateAdvancement,
  normaliseStage,
  stageCriteria,
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
  moveLine,
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
import PracticeHistory from './PracticeHistory';
import StageCriteriaPanel, { type HoldingKey } from './StageCriteriaPanel';
import DemotionNotice from './DemotionNotice';
import { useSongSpelling } from './useSongSpelling';
import { isComfortableOrBetter, quadrantHoldings } from './matrix/keyProgress';
import { daysUntilDue, keyDueState } from './matrix/keySpacing';
import SectionGuidance from './SectionGuidance';
import CellPanel, { type CellPanelLayout } from './matrix/CellPanel';
import { dueByKeyId } from './matrix/proveKey';
import { stageReconciliation } from './stageTransition';
import {
  SPACING_DEFAULTS,
  getSpacingSettings,
  windowsFrom,
  type SongKeySpacingSettings,
} from './spacingPrefs';
import SongHeatmap from './SongHeatmap';
import PracticeLogModal from './PracticeLogModal';
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
import LeadSheetDrawers from './LeadSheetDrawers';
import type { SequenceView } from '../../lib/db';
import {
  EMPTY_SEQUENCE_VIEW,
  pruneDeletedPlacements,
  removeBreak,
  setBreak,
  setPhraseNote,
  toggleHidden,
} from './sequenceView';
import {
  deadAnchors,
  peekUndo,
  popUndo,
  pushUndo,
  setUndoSong,
  useUndoDepth,
} from './sequenceUndo';
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
import { computeSongLevelState } from './matrix/songLevelState';
import { reassignOriginalKey } from './matrix/reassignOriginalKey';
import { SONG_KEY_OPTIONS, isCanonicalSongKey } from './matrix/keys';
import { ensureSongHasOriginalKey } from './matrixMigration';
import { spellKey, type Spelling } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';



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
  // `songSpelling` is what this page RENDERS with; `globalSpelling` is
  // what the "follow global" option has to NAME, so the user can see
  // what they would inherit before choosing it. Declared here beside
  // the song they derive from — the criteria copy reads them too, not
  // just the matrix.
  const songSpelling = useSongSpelling(song);
  const [globalSpelling] = useSpelling();
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
  // The songCrossKeyProgress subscription is gone as of 21 Aug 2026:
  // no advancement rule reads that @deprecated table any more, and
  // CrossKeyGrid runs its own query. A live subscription kept only to
  // feed a deleted rule is a table this screen re-renders on for
  // nothing.
  // The twelve key rows, for the stage rules. Learning → Comfortable
  // reads the original key's `wholeSongTestPassedAt`; Comfortable →
  // Cross-key reads which keys are still held and which quadrants
  // they cover.
  const matrixKeys = useLiveQuery<SongKey[]>(
    () => db.songKeys.where('songId').equals(songId).toArray(),
    [songId],
  ) ?? [];
  // Whole-song run-throughs, for the breadth half of Cross-key →
  // Internalized: every key not held has to show a clean run at tempo.
  const keyRunThroughs = useLiveQuery<SongKeyRunThrough[]>(
    () => db.songKeyRunThroughs.where('songId').equals(songId).toArray(),
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

  // Section-order drag state. The sortable list reads from
  // song.sectionOrder (falling back to DEFAULT_SECTION_ORDER); the
  // drag-end handler writes the new order back to db.songs. dnd-kit
  // wiring mirrors ActiveRepertoireView's SortableSongRow setup —
  // 5px pointer activation distance so taps don't accidentally
  // trigger a drag, keyboard sensor for accessibility.
  // The card-reorder machinery lived here and is gone: `sectionOrder`,
  // the dnd-kit sensors, and the drag-end handler that wrote
  // `songs.sectionOrder`. The page has a fixed order now — see the
  // note above the cards.
  //
  // `songs.sectionOrder` is left on the row rather than migrated away.
  // It is unindexed, it rides in the sync blob, and a stored order
  // nothing reads costs nothing; a migration to remove it would touch
  // every song for no gain.

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
  /**
   * Returning a song to "follow global" means REMOVING the field, not
   * setting it to a value — undefined is the third state, not a null
   * object.
   *
   * Read-then-put for the reason `saveMeta` documents above: `.update`
   * can silently no-op when its internal lookup-and-merge fails —
   * returns 0, no throw, no signal — and a reset that quietly does
   * nothing leaves the song pinned with a control that looks like it
   * worked. `.put` with the full record is unambiguous upsert.
   *
   * NOT because `.update` mishandles undefined. It was worth checking,
   * and it does not: Dexie 4.4.2 deletes the key, which
   * `__tests__/songSpelling.test.ts` pins as a characterisation so a
   * future version changing it is caught rather than assumed.
   */
  const setSongSpelling = async (next: Spelling | undefined) => {
    if (!song) return;
    const fresh = await db.songs.get(song.id);
    if (!fresh) return;
    const updated = { ...fresh, updatedAt: Date.now() };
    if (next === undefined) delete updated.spelling;
    else updated.spelling = next;
    await db.songs.put(updated);
  };

  const saveWhy = async () => {
    if (!song) return;
    const next = whyDraft.trim();
    await db.songs.update(song.id, { description: next || undefined, updatedAt: Date.now() });
    setWhyEditing(false);
    toast({ message: next ? 'Note saved.' : 'Note cleared.', variant: 'success' });
  };

  // --- Advancement --------------------------------------------------
  // The watermark: what the derivation last produced. Read through
  // normaliseStage because a row written before the 'maintenance' rung
  // was retired still carries that string.
  const lastObservedStage: RepertoireStage = normaliseStage(song?.stage);
  // Captured once per mount rather than read during render — the
  // purity rule the matrix already observes. A stage suggestion does
  // not need second-accuracy, so a session left open overnight
  // evaluating against this morning's clock is acceptable; the value
  // only feeds `isHeld`'s 30-day lapse threshold.
  const [advancementNow] = useState(() => Date.now());
  // Due dates and windows for the stage rules. Both are async reads,
  // so they start at "never proven / defaults" — which HOLDS every
  // rung rather than dropping one. A first paint that briefly demoted
  // a song would be a demotion notice for a lapse that had not
  // happened.
  const [dueMap, setDueMap] = useState<ReadonlyMap<string, number | null>>(new Map());
  const [spacing, setSpacing] = useState<SongKeySpacingSettings>(SPACING_DEFAULTS);
  useEffect(() => {
    let live = true;
    void getSpacingSettings().then(s => { if (live) setSpacing(s); });
    return () => { live = false; };
  }, []);
  const keyIds = useMemo(() => matrixKeys.map(k => k.id).join(','), [matrixKeys]);
  useEffect(() => {
    let live = true;
    const ids = keyIds === '' ? [] : keyIds.split(',');
    void dueByKeyId(ids).then(m => { if (live) setDueMap(m); });
    return () => { live = false; };
  }, [keyIds]);
  // DERIVED, never read off the song. Play it, prove it, three times.
  const currentStage: RepertoireStage = useMemo(
    () => deriveStage({
      songKeys: matrixKeys,
      keyRunThroughs,
      performanceTempo: song?.tempo ?? null,
      now: advancementNow,
      dueByKeyId: dueMap,
      dueWindows: windowsFrom(spacing),
      spelling: songSpelling,
    }),
    [matrixKeys, keyRunThroughs, song?.tempo, advancementNow, dueMap, spacing, songSpelling],
  );

  const advancementInputs = useMemo(() => ({
    currentStage,
    songKeys: matrixKeys,
    keyRunThroughs,
    performanceTempo: song?.tempo ?? null,
    now: advancementNow,
    dueByKeyId: dueMap,
    dueWindows: windowsFrom(spacing),
    spelling: songSpelling,
  }), [currentStage, matrixKeys, keyRunThroughs, song?.tempo, advancementNow, dueMap, spacing, songSpelling]);
  // One input object feeding both, so the panel and the banner cannot
  // be looking at different data even for a render.
  // ---------------------------------------------------------------
  // THE CELL PANEL LIVES HERE, NOT IN THE MATRIX.
  //
  // Practice mode collapses to a bar pinned at the top of the SCREEN
  // and opens the lead sheet beneath it. The matrix cannot reach that
  // layout from inside its own card, and the lead sheet is this
  // page's rather than the matrix's — so the page owns the panel and
  // the matrix only reports the tap.
  // ---------------------------------------------------------------
  const [panelCellId, setPanelCellId] = useState<string | null>(null);
  const [panelLayout, setPanelLayout] = useState<CellPanelLayout>('full');
  // `scroll-mt-28` keeps the heading clear of the pinned bar — without
  // it the bar sits on top of the first line of what it just revealed.
  const leadSheetRef = useRef<HTMLElement | null>(null);

  const matrixCells = useLiveQuery(
    () => db.songCells.where('songId').equals(songId).toArray(),
    [songId],
  ) ?? [];
  const matrixSections = useLiveQuery(
    () => db.songMatrixSections.where('songId').equals(songId).toArray(),
    [songId],
  ) ?? [];

  const panelCell = panelCellId
    ? matrixCells.find(c => c.id === panelCellId) ?? null
    : null;
  const panelKey = panelCell
    ? matrixKeys.find(k => k.id === panelCell.songKeyId) ?? null
    : null;
  const panelSection = panelCell
    ? matrixSections.find(sec => sec.id === panelCell.sectionId) ?? null
    : null;
  const visibleMatrixSections = useMemo(
    () => matrixSections
      .filter(sec => !sec.isArchived)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    [matrixSections],
  );

  // THE ONE FACT THE DELETED MATRIX SUB-CARD CARRIED THAT WAS NOT A
  // DUPLICATE. `learningPercent` is the share of original-key cells at
  // Comfortable — progress toward getting the song under the fingers,
  // which happens BEFORE the whole-song test the Learning criterion
  // names. So it is not a second rendering of the stage; it is the
  // part of the run-up the stage rules do not measure.
  //
  // Recomputed here rather than plumbed out of SongMatrixView:
  // `computeSongLevelState` is pure and this component already holds
  // every input it takes.
  const rollup = useMemo(
    () => computeSongLevelState(
      matrixKeys, matrixCells, visibleMatrixSections.length, advancementNow,
    ),
    [matrixKeys, matrixCells, visibleMatrixSections.length, advancementNow],
  );

  const openCellPanel = useCallback((cellId: string) => {
    setPanelCellId(cellId);
    setPanelLayout('full');
  }, []);
  const closeCellPanel = useCallback(() => {
    setPanelCellId(null);
    setPanelLayout('full');
  }, []);

  // Collapsing to the bar scrolls the lead sheet under it. Without
  // this the panel would shrink over whatever happened to be on
  // screen — usually the matrix it was opened from — and the button
  // would appear to do nothing.
  useEffect(() => {
    if (panelLayout !== 'bar') return;
    leadSheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [panelLayout]);

  const criteria = useMemo(
    () => stageCriteria(advancementInputs),
    [advancementInputs],
  );
  const advancement = useMemo(() => evaluateAdvancement({
    currentStage,
    songKeys: matrixKeys,
    keyRunThroughs,
    performanceTempo: song?.tempo ?? null,
    now: advancementNow,
    dueByKeyId: dueMap,
    dueWindows: windowsFrom(spacing),
    spelling: songSpelling,
  }), [currentStage, matrixKeys, keyRunThroughs, song?.tempo, advancementNow, dueMap, spacing]);

  // Only keys that can hold a rung — comfortable or better. A key at
  // learning has nothing to lose and would read as permanently held,
  // which is true and useless.
  const holdingKeys: HoldingKey[] = useMemo(() => {
    const windows = windowsFrom(spacing);
    return matrixKeys
      .filter(k => isComfortableOrBetter(k.keyState))
      .map(k => {
        const due = dueMap.get(k.id) ?? null;
        return {
          keyName: k.keyName,
          state: keyDueState(due, advancementNow, windows),
          daysUntil: daysUntilDue(due, advancementNow),
        };
      });
  }, [matrixKeys, dueMap, spacing, advancementNow]);

  // Record a move once the derivation has real inputs behind it.
  //
  // In an EFFECT, never during render: this writes, and a write in a
  // render body is a re-render loop rather than a record. Gated on the
  // async reads having landed — `dueMap` empty means "not loaded yet",
  // which reads every key as never-proven and holds every rung, so
  // reconciling then would record a promotion that the next paint
  // takes back.
  const dueLoaded = dueMap.size > 0 || matrixKeys.length === 0;
  useEffect(() => {
    if (!song || !dueLoaded) return;
    const patch = stageReconciliation({
      song,
      previous: lastObservedStage,
      derived: currentStage,
      criteriaAtDerived: criteria,
      now: Date.now(),
      // Snapshotted at the moment of the drop, not read live: the
      // notice has to keep reading correctly once the key that lapsed
      // has been re-proved.
      holdings: quadrantHoldings(
        matrixKeys, advancementNow, dueMap, windowsFrom(spacing),
      ),
    });
    if (patch === null) return;
    void db.songs.update(song.id, patch);
  }, [song, dueLoaded, lastObservedStage, currentStage, criteria]);

  // `setStage` is gone with the controls that called it. Nothing
  // writes a stage now — `stageReconciliation` writes the WATERMARK,
  // which is a record of what the derivation produced, not a choice.

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
      /** Names the edit for the undo control. */
      label = 'change',
    ) => {
      const sec = sections.find(s => s.id === sectionId);
      if (!sec) return;
      const order =
        progression.find(p => p.sectionId === sectionId)?.order ?? [];
      const before = sec.sequenceView ?? EMPTY_SEQUENCE_VIEW;
      const next = apply(before, order);
      // Captured BEFORE the write, and only once it is known the write
      // will happen — an entry pushed for a no-op edit would make undo
      // appear to do nothing.
      if (song) {
        pushUndo({
          songId: song.id,
          sectionId,
          before,
          orderAtCapture: order,
          label,
        });
      }
      await db.songSections.update(sectionId, { sequenceView: next });
    },
    [sections, progression, song],
  );

  /**
   * Restore the previous view for whichever section was last edited.
   *
   * Pruned against the CURRENT order first: a chord deleted since the
   * edit would otherwise get its annotation back as an orphan — a row
   * that filters nothing, renders nothing and cannot be reached from
   * any UI, so it could never be removed again. `orderAtCapture` is
   * what makes each orphaned note merge into the right neighbour
   * rather than piling onto the tail.
   */
  const undoDepth = useUndoDepth();
  // Scopes the stack, and clears it on a song change so an undo can
  // never reach into a song no longer on screen. Idempotent, so a
  // re-render cannot wipe the history.
  useEffect(() => {
    setUndoSong(song?.id ?? null);
  }, [song?.id]);

  const undoSequenceEdit = useCallback(async () => {
    const entry = popUndo();
    if (!entry) return;
    const order =
      progression.find(p => p.sectionId === entry.sectionId)?.order ?? [];
    const dead = deadAnchors(entry.before, order);
    const restored = dead.length > 0
      ? pruneDeletedPlacements(entry.before, dead, entry.orderAtCapture)
      : entry.before;
    await db.songSections.update(entry.sectionId, { sequenceView: restored });
  }, [progression]);

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

  /** Move one lyric row to another's position. One row, nothing
   *  carried — see `moveLine` for what order does and does not
   *  control. */
  const handleReorderLines = useCallback(
    async (fromId: string, toId: string) => {
      if (!songLyricLines) return;
      const next = moveLine(songLyricLines, fromId, toId);
      if (next === songLyricLines) return;
      await commitSongLyrics(next);
    },
    [songLyricLines, commitSongLyrics],
  );

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

      {/* Metadata — and everything else that answers "what IS this
          song": the note, the links, and the associations.

          COMPACTION, NOT DELETION. Everything it held it still holds —
          title, artist, key, spelling, tempo, time, the note, the
          links, the associations. It simply stopped needing this much
          room to say it. */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3 space-y-1.5">
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
                {/* A picker, not free text. The field can only
                    legitimately hold one of twelve values, and a
                    non-canonical one (a Unicode flat, "Ab major", a
                    stray space) is silently accepted everywhere and
                    then renders a phantom 13th matrix row via
                    keysOrderedFromOriginal's unknown-key fallback.
                    Making it unselectable is cheaper than validating
                    it in every reader.

                    The blank option is retained: a song whose key is
                    genuinely unknown should stay unknown rather than
                    being forced to claim C. Legacy non-canonical
                    values render as a disabled option so the current
                    value is visible rather than silently reset. */}
                <select
                  value={keyDraft}
                  onChange={e => setKeyDraft(e.target.value)}
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
                >
                  <option value="">(not set)</option>
                  {keyDraft !== '' && !isCanonicalSongKey(keyDraft) && (
                    <option value={keyDraft} disabled>
                      {keyDraft} — not a recognised key
                    </option>
                  )}
                  {SONG_KEY_OPTIONS.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
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
            {/* ---------------------------------------------------------------
                TWO COLUMNS, NOT A STACK.

                Left is what the song IS — title, artist, key, spelling,
                tempo, time. Right is what you have written about it and
                where it lives — the note, the links, the associations.
                Stacked, the right-hand material pushed the matrix off
                the screen while the whole right half of the card sat
                empty; side by side the card is about half as tall and
                the second column costs nothing, because the facts row
                never used the width.

                The divider went with the restructure. A rule between
                two columns is a rule the columns already draw.
                --------------------------------------------------------------- */}
            <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-medium tracking-tight">{song.title}</h2>
                <div className="text-sm text-neutral-500">{song.artist}{song.genre ? ` · ${song.genre}` : ''}</div>
              </div>
              <button onClick={openEdit} className="text-xs text-neutral-500 hover:text-fluent">edit</button>
            </div>
            <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs text-neutral-500 leading-tight">
              {song.key && (
                <span>
                  key: <span className="font-mono text-neutral-700 dark:text-neutral-200">{spellKey(song.key, songSpelling)}</span>
                  {song.keyNeedsVerification && <span className="ml-1 text-developing" title="estimated — verify with recording">?</span>}
                </span>
              )}
              {/* Beside the key because the key is the most visible thing
                  it changes. The option list NAMES all three states —
                  a two-way toggle cannot show that a song is inheriting,
                  only which side is lit, and "follow global (flats)" has
                  to say what it is inheriting as well as that it is. */}
              <label className="inline-flex items-center gap-1">
                spelling:
                <select
                  value={song.spelling ?? 'inherit'}
                  onChange={e => {
                    const v = e.target.value;
                    void setSongSpelling(v === 'inherit' ? undefined : (v as Spelling));
                  }}
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5"
                  title="how this song's key and chord names are spelled. changes names only — no practice data moves."
                >
                  <option value="inherit">
                    follow global ({globalSpelling === 'flat' ? 'flats' : 'sharps'})
                  </option>
                  <option value="flat">always flats</option>
                  <option value="sharp">always sharps</option>
                </select>
                {song.spelling && (
                  <span
                    className="text-[10px] text-neutral-400"
                    title="this song does not follow the global setting"
                  >
                    overridden
                  </span>
                )}
              </label>
              {song.tempoLabel && <span>tempo: {song.tempoLabel}</span>}
              {song.timeSignature && (
                <span>
                  time: <span className="font-mono text-neutral-700 dark:text-neutral-200">{song.timeSignature}</span>
                </span>
              )}
            </div>
            </div>

            {/* ---------------------------------------------------------------
                "WHY THIS SONG" AND THE LINKS LIVE HERE NOW.

                They were a card of their own, two scrolls down. Both
                answer the same question the rest of this card answers —
                what IS this song — and neither is something you act on
                while playing. A note about why you picked a song and a
                link to the recording belong beside the title, not below
                the matrix.

                The links were already anchors; what they were not was
                anywhere near the metadata. Nothing about them is fixed
                here, they are simply where they should have been.
                --------------------------------------------------------------- */}
            {/* The right column is PINNED to column 2 rather than just being
    second in source order. The left block's height varies with
    the facts row wrapping, and auto-placement would let this
    slide under it. */}
            <div className="min-w-0 space-y-1 sm:col-start-2">
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

            {/* ---------------------------------------------------------------
                ASSOCIATIONS LIVE HERE TOO.

                Sitting alone near the bottom it read as disjointed — a
                card of its own for one textarea, two scrolls from
                anything it relates to. It is a note about the song, the
                same as "why this song", and it belongs beside it.

                It still writes to the Harmonic Diary, unchanged. Only
                its placement moved.
                --------------------------------------------------------------- */}
              <SongAssociationsSection song={song} />
            </div>
            </div>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------
          FIXED ORDER, NO LONGER DRAGGABLE.

          The five cards used to be user-reorderable, stored on
          `songs.sectionOrder`. That freedom was worth less than a
          shape you can learn: metadata says what the song is, the
          matrix says where it stands and what would move it, the lead
          sheet is what you read while playing, associations are the
          links outward. A page whose order differs per song is a page
          you re-read every time.
          --------------------------------------------------------------- */}

      {/* ---------------------------------------------------------------
          THE MATRIX IS THE SONG'S DASHBOARD.

          Status by section, by key — the same role the app dashboard
          plays for everything else. So the derived status and what
          would advance it belong in its header rather than in a card
          of their own further down: the answer and the evidence for it
          were two scrolls apart, and the card that held the answer had
          three sources of truth in it.
          --------------------------------------------------------------- */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">matrix</h3>
          <SectionGuidance surface="matrix" />
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium rounded-full px-3 py-1 border ${STAGE_BADGE_CLASS[currentStage]}`}>
              {STAGE_LABEL[currentStage]}
            </span>
            {currentStage === 'learning' && visibleMatrixSections.length > 0 && (
              <span
                className="inline-flex items-center px-2 py-1 rounded-full text-[11px] bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 tabular-nums"
                title="sections at Comfortable in the original key"
              >
                {rollup.learningPercent}% original
              </span>
            )}
            <span className="text-[11px] italic text-neutral-500">{STAGE_TAGLINE[currentStage]}</span>
          </div>
          {/* The change-stage dropdown and the advance
              button are gone. A stage is where the
              evidence puts you: play it, prove it, three
              times. An override would make the badge a
              claim about what the user was willing to
              assert rather than about the song. */}
        </div>
        {/* Guidance, not a headline. At text-sm it was the largest
            text in the card, which made the advice look like the
            answer — the badge above it is the answer. */}
        <p className="text-xs text-neutral-600 dark:text-neutral-300 italic leading-snug">
          {STAGE_GUIDANCE[currentStage]}
        </p>
        {/* Always, not only once the criteria are met.
            The banner below is the call to action; this is
            the answer to "what would advance this song?",
            which had nowhere to be asked before. */}
        <StageCriteriaPanel
          criteria={criteria}
          holding={holdingKeys}
          spelling={songSpelling}
        />
        {/* Above the ✨ banner: a drop is more urgent than
            an invitation, and the two would otherwise sit
            side by side saying opposite things. */}
        {song.stageDemotion && (
          <DemotionNotice
            demotion={song.stageDemotion}
            spelling={songSpelling}
          />
        )}
        {advancement.suggest && advancement.reason && (
          <div className="rounded-md border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-fluent">
            <span aria-hidden className="mr-1.5">✨</span>
            {advancement.reason}
          </div>
        )}
        <SongMatrixView
          song={song}
          onClose={() => {}}
          embedded
          onCellSelected={openCellPanel}
          dueByKeyId={dueMap}
          dueWindows={windowsFrom(spacing)}
        />
      </section>

        {/* No backdrop-blur: it's a no-op on this opaque card AND
            would establish a containing block that makes the mobile
            voicing bottom sheet (position: fixed) anchor to the card
            instead of the viewport. See LEAD_SHEET_PLAY_MODE_DESIGN.md.

            THIS WAS RENDERING AS VISIBLE TEXT. It used to sit inside
            `{key === 'leadSheet' && ( … )}`, where `//` is a real
            comment because the braces make it an EXPRESSION. Unwrapping
            the card in 3d-4 moved it into JSX CHILDREN position, where
            `//` is just characters — and JSX has no way to tell a
            developer note from body copy. */}
        <section
          ref={leadSheetRef}
          className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] p-3 sm:p-5 space-y-3 scroll-mt-28"
        >
          <div className="flex items-center justify-between flex-wrap gap-2 pr-10">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">lead sheet</h3>
              <SectionGuidance surface="leadSheet" />
            </div>
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
        </section>

      {/* Practice history + heatmap */}
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">practice history</h3>
            <SectionGuidance surface="practiceHistory" />
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
          >
            + log a practice session
          </button>
        </div>
        {/* The bottom timer strip is gone as of 3d-5. It sat below
            the danger zone, inside practice history — a timer you had
            to scroll past two cards to reach. Practice starts from a
            matrix cell now, and the panel keeps the clock on screen
            whatever else you are doing. */}
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

      {panelCell && panelKey && panelSection && (
        <CellPanel
          key={panelCell.id}
          song={song}
          songKey={panelKey}
          section={panelSection}
          sections={visibleMatrixSections}
          spelling={songSpelling}
          layout={panelLayout}
          onLayoutChange={setPanelLayout}
          onClose={closeCellPanel}
          onFinished={(minutes, sectionCount) => toast({
            message: sectionCount > 0
              ? `${minutes}m logged across ${sectionCount} section${sectionCount === 1 ? '' : 's'}.`
              : `${minutes}m logged.`,
            variant: 'success',
          })}
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
      {/* ONE fixed box, stacked. Lyrics renders LAST so it sits
          against the docking edge and keeps the exact position it
          has always had. */}
      <LeadSheetDrawers>
        <ProgressionDrawer
          sections={progression}
          songKey={song?.key}
          open={progressionsOpen}
          onOpenChange={openProgressions}
          onSetBreak={(sectionId, after, kind) =>
            editSequenceView(
              sectionId,
              (v, order) => setBreak(v, after, kind, order),
              kind === 'row' ? 'new row' : 'separator',
            )
          }
          onRemoveBreak={(sectionId, after) =>
            editSequenceView(
              sectionId,
              (v, order) => removeBreak(v, after, order),
              'remove break',
            )
          }
          onSetPhraseNote={(sectionId, after, note) =>
            editSequenceView(sectionId, v => setPhraseNote(v, after, note), 'note')
          }
          onToggleHidden={(sectionId, placementId) =>
            editSequenceView(sectionId, v => toggleHidden(v, placementId), 'hide')
          }
          onUndo={undoSequenceEdit}
          undoDepth={undoDepth}
          undoLabel={peekUndo()?.label}
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
            onReorder={handleReorderLines}
          />
        )}
      </LeadSheetDrawers>

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
// `SortableSection` lived here and is gone with the drag-to-reorder
// it wrapped.

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

  // No card chrome of its own any more — it sits INSIDE the metadata
  // card, so a second border and a second shadow would read as a card
  // nested in a card.
  return (
    // One divider for the whole note/links/associations group rather
    // than one per block — three horizontal rules in a card this size
    // is more chrome than content.
    <div className="space-y-1.5">
      {/* ---------------------------------------------------------------
          COLLAPSED UNTIL THERE IS SOMETHING TO SHOW.

          The else-branch below renders whenever nothing is saved, so an
          empty three-row textarea and its save button held their space
          permanently — the single tallest thing in this card, and the
          reason the matrix started below the fold. It now opens on a
          tap, the same way "+ add a note about this song" already does.

          The heading collapses with it. A label above a one-line button
          that already says what it is would be the label twice.
          --------------------------------------------------------------- */}
      {!editing && !hasSaved ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          + add what this song makes you feel
        </button>
      ) : (
      <>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
          my associations
        </h3>
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
      </>
      )}
    </div>
  );
}

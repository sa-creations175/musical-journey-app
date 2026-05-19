import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
import { PhraseClipboardProvider } from './phraseClipboard';
import CrossKeyGrid from './CrossKeyGrid';
import PracticeHistory from './PracticeHistory';
import SongHeatmap from './SongHeatmap';
import PracticeLogModal from './PracticeLogModal';
import FullLyricsSection from './FullLyricsSection';
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
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
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

  // Which section / phrase to flash on next render — set by the
  // action handlers below.
  const [flashSectionId, setFlashSectionId] = useState<string | null>(null);
  const [flashPhraseId, setFlashPhraseId] = useState<string | null>(null);

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
  // default; the user opens it explicitly via "Show full lyrics".
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
    await db.songs.put({ ...fresh, sectionOrder: next });
  };

  /**
   * Drag-to-reorder for the lead-sheet sections list. Computes the
   * new order in memory, then writes every affected row's `.order`
   * field in a single transaction. The matrix mirror updates
   * automatically via the songSections write hook (which calls
   * syncMatrixSectionsForSong) — no extra wiring needed here.
   */
  const handleLeadSheetSectionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sections, oldIndex, newIndex);
    await db.transaction('rw', db.songSections, async () => {
      // Write every row whose .order changed. The reconciler picks
      // up the resulting writes via the Dexie hook installed on
      // songSections, so the matrix's displayOrder follows.
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order !== i) {
          await db.songSections.update(reordered[i].id, { order: i });
        }
      }
    });
  };

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
    const patch: Partial<Song> = {
      title: titleDraft.trim() || song.title,
      artist: artistDraft.trim() || song.artist,
      genre: genreDraft.trim() || undefined,
      key: newKey,
      keyNeedsVerification: keyDraft.trim() === song.key ? song.keyNeedsVerification : false,
      tempoLabel: tempoDraft.trim() || undefined,
      timeSignature: newTimeSignature,
      spotifyLink: spotifyDraft.trim() || undefined,
      referenceVideos: cleanedVideos.length > 0 ? cleanedVideos : undefined,
      youtubeLink: undefined,
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
    await db.songs.update(song.id, { description: next || undefined });
    setWhyEditing(false);
    toast({ message: next ? 'Note saved.' : 'Note cleared.', variant: 'success' });
  };

  const saveFullLyrics = async (fullLyrics: string) => {
    if (!song) return;
    const trimmed = fullLyrics.trim();
    await db.songs.update(song.id, { fullLyrics: trimmed || undefined });
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
    await db.songs.update(song.id, { stage });
    toast({
      message: `Advanced to ${STAGE_LABEL[stage]}.`,
      variant: 'success',
      action: {
        label: 'Undo',
        onClick: async () => {
          await db.songs.update(song.id, { stage: prev });
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
  const deleteSection = async (section: SongSection) => {
    const [chordRows, ckRows] = await Promise.all([
      db.songChords.where('sectionId').equals(section.id).toArray(),
      db.songCrossKeyProgress.where('[songId+sectionId]').equals([section.songId, section.id]).toArray(),
    ]);
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
    const idx = sections.findIndex(s => s.id === section.id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    const a = sections[idx];
    const b = sections[target];
    await db.transaction('rw', [db.songSections], async () => {
      await db.songSections.update(a.id, { order: b.order });
      await db.songSections.update(b.id, { order: a.order });
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
  useEffect(() => {
    if (flashPhraseId === null) return;
    const t = window.setTimeout(() => setFlashPhraseId(null), 1800);
    return () => window.clearTimeout(t);
  }, [flashPhraseId]);

  if (!song) {
    return (
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 p-5 text-sm text-neutral-500">
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
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
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
                  <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 pr-10">
                      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">lead sheet</h3>
                      <div className="flex items-center gap-3 flex-wrap text-xs">
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
                        <button
                          onClick={addSection}
                          className="text-neutral-500 hover:text-fluent"
                        >
                          + add section
                        </button>
                      </div>
                    </div>
                    {sections.length === 0 ? (
                      <p className="text-xs text-neutral-500 italic">no sections yet. click "+ add section" to start.</p>
                    ) : (
                      <PhraseClipboardProvider>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleLeadSheetSectionDragEnd}
                      >
                        <SortableContext
                          items={sections.map(s => s.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-3">
                            {sections.map((s, idx) => (
                              <SortableLeadSheetItem key={s.id} id={s.id}>
                                <LeadSheetSection
                                  song={song}
                                  section={s}
                                  canMoveUp={idx > 0}
                                  canMoveDown={idx < sections.length - 1}
                                  highlighted={isHighlighted(`section-${s.id}`) || flashSectionId === s.id}
                                  highlightedPhraseId={flashPhraseId}
                                  onChange={patch => updateSection(s.id, patch)}
                                  onReplace={replaceSection}
                                  onMoveUp={() => moveSection(s, -1)}
                                  onMoveDown={() => moveSection(s, 1)}
                                  onDelete={sections.length > 1 ? async () => { requestDeleteSection(s); } : undefined}
                                  onPhraseAdded={pid => {
                                    setFlashPhraseId(pid);
                                    requestAnimationFrame(() => flash(`phrase-${pid}`));
                                  }}
                                />
                              </SortableLeadSheetItem>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                      </PhraseClipboardProvider>
                    )}
                    {/* Full lyrics collapsible — opens via "Show full
                        lyrics" toggle, closed by default. The full
                        lyrics live HERE now rather than as a
                        standalone section. */}
                    <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                      <button
                        type="button"
                        onClick={() => setShowFullLyrics(v => !v)}
                        className="text-xs text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
                        aria-expanded={showFullLyrics}
                      >
                        <span aria-hidden>{showFullLyrics ? '▾' : '▸'}</span>
                        {showFullLyrics ? 'Hide full lyrics' : 'Show full lyrics'}
                      </button>
                      {showFullLyrics && (
                        <div className="mt-3">
                          <FullLyricsSection song={song} onSave={saveFullLyrics} />
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {key === 'matrix' && (
                  <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
                    <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300 pr-10">matrix</h3>
                    <SongMatrixView song={song} onClose={() => {}} embedded />
                  </section>
                )}

                {key === 'learningStatus' && (
                  <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
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
                  <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
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
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
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
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-4">
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
      <section className="rounded-card border border-needswork/30 bg-needswork/5 p-3 sm:p-5 space-y-2">
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
        className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur text-neutral-400 hover:text-neutral-700 hover:border-fluent/40 cursor-grab active:cursor-grabbing touch-none text-xs leading-none"
      >
        <span aria-hidden className="font-mono">≡</span>
      </button>
      {children}
    </div>
  );
}

// -------------------------------------------------------------------
// SortableLeadSheetItem — dnd-kit wrapper around a single
// LeadSheetSection. Same pattern as SortableSection above, but with
// the drag handle at the section's top-left so it doesn't collide
// with the section's own move-up/down/hide/delete control row on
// the top-right. LeadSheetSection already carries that control row;
// the drag handle is an additional affordance, not a replacement,
// so users who prefer pointer-stepping keep their existing arrows.
// -------------------------------------------------------------------

function SortableLeadSheetItem({
  id,
  children,
}: {
  id: string;
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
        aria-label="drag to reorder lead-sheet section"
        {...attributes}
        {...listeners}
        className="absolute bottom-2 right-2 z-10 px-1.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur text-neutral-400 hover:text-neutral-700 hover:border-fluent/40 cursor-grab active:cursor-grabbing touch-none text-xs leading-none"
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
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-2">
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

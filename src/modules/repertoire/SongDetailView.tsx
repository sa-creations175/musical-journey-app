import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type Song,
  type SongCrossKeyProgress,
  type SongPracticeLog,
  type SongSection,
  type RepertoireStage,
} from '../../lib/db';
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
import CrossKeyGrid from './CrossKeyGrid';
import PracticeHistory from './PracticeHistory';
import SongHeatmap from './SongHeatmap';
import PracticeLogModal from './PracticeLogModal';
import FullLyricsSection from './FullLyricsSection';
import { useToast } from '../../components/Toaster';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useScrollHighlight } from './useScrollHighlight';

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

  const [titleDraft, setTitleDraft] = useState('');
  const [artistDraft, setArtistDraft] = useState('');
  const [genreDraft, setGenreDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [tempoDraft, setTempoDraft] = useState('');
  const [spotifyDraft, setSpotifyDraft] = useState('');
  const [youtubeDraft, setYoutubeDraft] = useState('');

  const openEdit = () => {
    if (!song) return;
    setTitleDraft(song.title);
    setArtistDraft(song.artist);
    setGenreDraft(song.genre ?? '');
    setKeyDraft(song.key ?? '');
    setTempoDraft(song.tempoLabel ?? (song.tempo ? String(song.tempo) : ''));
    setSpotifyDraft(song.spotifyLink ?? '');
    setYoutubeDraft(song.youtubeLink ?? '');
    setEditingMeta(true);
  };

  const saveMeta = async () => {
    if (!song) return;
    const patch: Partial<Song> = {
      title: titleDraft.trim() || song.title,
      artist: artistDraft.trim() || song.artist,
      genre: genreDraft.trim() || undefined,
      key: keyDraft.trim() || undefined,
      keyNeedsVerification: keyDraft.trim() === song.key ? song.keyNeedsVerification : false,
      tempoLabel: tempoDraft.trim() || undefined,
      spotifyLink: spotifyDraft.trim() || undefined,
      youtubeLink: youtubeDraft.trim() || undefined,
    };
    await db.songs.update(song.id, patch);
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
    });
    setFlashSectionId(newId);
    requestAnimationFrame(() => flash(`section-${newId}`));
    toast({ message: `Section added: Section ${order + 1}`, variant: 'success' });
  };

  const updateSection = async (sectionId: string, patch: Partial<SongSection>) => {
    await db.songSections.update(sectionId, patch);
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
    const anyChordTokens = (s.phrases ?? []).some(p => p.chords.trim() !== '');
    const anyAlt = (s.alternateChords ?? '').trim() !== '' || (s.alternateNote ?? '').trim() !== '';
    const anyNotes = (s.notes ?? '').trim() !== '';
    const legacyChords = (s.basicChords ?? '').trim() !== '';
    return anyChordTokens || anyAlt || anyNotes || legacyChords;
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
    await db.transaction('rw', [
      db.songs, db.songSections, db.songChords, db.songPracticeLog, db.songCrossKeyProgress,
    ], async () => {
      const [sectionRows, chordRows, logRows, ckRows] = await Promise.all([
        db.songSections.where('songId').equals(song.id).toArray(),
        db.songChords.where('songId').equals(song.id).toArray(),
        db.songPracticeLog.where('songId').equals(song.id).toArray(),
        db.songCrossKeyProgress.where('songId').equals(song.id).toArray(),
      ]);
      await Promise.all([
        db.songSections.bulkDelete(sectionRows.map(r => r.id)),
        db.songChords.bulkDelete(chordRows.map(r => r.id)),
        db.songPracticeLog.bulkDelete(logRows.map(r => r.id)),
        db.songCrossKeyProgress.bulkDelete(ckRows.map(r => r.id)),
        db.songs.delete(song.id),
      ]);
    });
    toast({ message: `Removed "${song.title}" from repertoire.`, variant: 'warning' });
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
                <span className="text-neutral-500 text-xs uppercase tracking-wide">spotify link</span>
                <input value={spotifyDraft} onChange={e => setSpotifyDraft(e.target.value)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 font-mono text-xs" />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-neutral-500 text-xs uppercase tracking-wide">youtube link</span>
                <input value={youtubeDraft} onChange={e => setYoutubeDraft(e.target.value)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 font-mono text-xs" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={saveMeta} className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90">save</button>
              <button onClick={() => setEditingMeta(false)} className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs">cancel</button>
              <button onClick={() => setConfirmDeleteSong(true)} className="ml-auto px-3 py-1.5 rounded-md border border-needswork/40 text-needswork text-xs hover:bg-needswork/10">remove from repertoire</button>
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
              {song.spotifyLink && (
                <a href={song.spotifyLink} target="_blank" rel="noopener noreferrer" className="text-fluent hover:underline">spotify ↗</a>
              )}
              {song.youtubeLink && (
                <a href={song.youtubeLink} target="_blank" rel="noopener noreferrer" className="text-fluent hover:underline">youtube ↗</a>
              )}
            </div>

            {/* Why this song — collapsed by default; inline editor. */}
            <div className="pt-1">
              {whyEditing ? (
                <div className="space-y-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-neutral-500 text-xs uppercase tracking-wide">why this song</span>
                    <textarea
                      rows={3}
                      value={whyDraft}
                      autoFocus
                      onChange={e => setWhyDraft(e.target.value)}
                      placeholder="what drew you to it, what you want to learn from it"
                      className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button onClick={saveWhy} className="px-3 py-1 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90">save</button>
                    <button onClick={() => setWhyEditing(false)} className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs">cancel</button>
                  </div>
                </div>
              ) : hasDescription ? (
                <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">why this song</div>
                      <p className="whitespace-pre-wrap">{song.description}</p>
                    </div>
                    <button onClick={openWhyEditor} className="text-[11px] text-neutral-500 hover:text-fluent shrink-0">edit</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={openWhyEditor}
                  className="text-xs text-neutral-500 hover:text-fluent"
                >
                  + add a note about this song
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* Full lyrics reference */}
      <FullLyricsSection song={song} onSave={saveFullLyrics} />

      {/* Stage & guidance */}
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
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

      {/* Lead sheet */}
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">lead sheet</h3>
          <button
            onClick={addSection}
            className="text-xs text-neutral-500 hover:text-fluent"
          >
            + add section
          </button>
        </div>
        {sections.length === 0 ? (
          <p className="text-xs text-neutral-500 italic">no sections yet. click "+ add section" to start.</p>
        ) : (
          <div className="space-y-3">
            {sections.map((s, idx) => (
              <LeadSheetSection
                key={s.id}
                song={song}
                section={s}
                canMoveUp={idx > 0}
                canMoveDown={idx < sections.length - 1}
                highlighted={isHighlighted(`section-${s.id}`) || flashSectionId === s.id}
                highlightedPhraseId={flashPhraseId}
                onChange={patch => updateSection(s.id, patch)}
                onMoveUp={() => moveSection(s, -1)}
                onMoveDown={() => moveSection(s, 1)}
                onDelete={sections.length > 1 ? async () => { requestDeleteSection(s); } : undefined}
                onPhraseAdded={pid => {
                  setFlashPhraseId(pid);
                  requestAnimationFrame(() => flash(`phrase-${pid}`));
                }}
              />
            ))}
          </div>
        )}
      </section>

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
        title={`Delete "${song.title}" from your repertoire?`}
        message={
          <>
            <p>
              This removes all section data, notes, cross-key progress, and practice history for this song.
            </p>
            <p className="text-xs text-neutral-500">
              You can still undo from the toast right after, but only for 10 seconds.
            </p>
          </>
        }
        confirmLabel="Delete song"
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
                  const phraseCount = (s.phrases ?? []).filter(
                    p => p.chords.trim() !== '' || p.lyrics.trim() !== '',
                  ).length;
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

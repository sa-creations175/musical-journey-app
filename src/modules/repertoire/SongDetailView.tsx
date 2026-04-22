import { useMemo, useState } from 'react';
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
  // No song picked yet — show a picker so the user can open one. Keeps
  // the tab usable even if the dropdown-pref on first mount is stale.
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
      .reverse()
      .sortBy('timestamp')
      .then(arr => arr.slice().sort((a, b) => b.timestamp - a.timestamp)),
    [songId],
  ) ?? [];
  const crossKey = useLiveQuery<SongCrossKeyProgress[]>(
    () => db.songCrossKeyProgress.where('songId').equals(songId).toArray(),
    [songId],
  ) ?? [];

  const [editingMeta, setEditingMeta] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  // --- Metadata edit drafts --------------------------------------
  const [titleDraft, setTitleDraft] = useState('');
  const [artistDraft, setArtistDraft] = useState('');
  const [genreDraft, setGenreDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [tempoDraft, setTempoDraft] = useState('');
  const [spotifyDraft, setSpotifyDraft] = useState('');
  const [youtubeDraft, setYoutubeDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const openEdit = () => {
    if (!song) return;
    setTitleDraft(song.title);
    setArtistDraft(song.artist);
    setGenreDraft(song.genre ?? '');
    setKeyDraft(song.key ?? '');
    setTempoDraft(song.tempoLabel ?? (song.tempo ? String(song.tempo) : ''));
    setSpotifyDraft(song.spotifyLink ?? '');
    setYoutubeDraft(song.youtubeLink ?? '');
    setDescriptionDraft(song.description ?? '');
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
      description: descriptionDraft.trim() || undefined,
    };
    await db.songs.update(song.id, patch);
    setEditingMeta(false);
  };

  // --- Advancement evaluation ------------------------------------
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

  // --- Section CRUD helpers --------------------------------------
  const addSection = async () => {
    if (!song) return;
    const order = sections.length;
    await db.songSections.add({
      id: uid('section'),
      songId: song.id,
      name: `Section ${order + 1}`,
      order,
      lyrics: '',
    });
  };
  const updateSection = async (sectionId: string, patch: Partial<SongSection>) => {
    await db.songSections.update(sectionId, patch);
  };
  const deleteSection = async (sectionId: string) => {
    await db.transaction('rw', [db.songSections, db.songCrossKeyProgress], async () => {
      await db.songSections.delete(sectionId);
      // Clean up any cross-key progress rows that pointed at this section.
      const rows = await db.songCrossKeyProgress
        .where('[songId+sectionId]').equals([songId, sectionId])
        .toArray();
      if (rows.length > 0) {
        await db.songCrossKeyProgress.bulkDelete(rows.map(r => r.id));
      }
    });
  };

  const deleteSong = async () => {
    if (!song) return;
    if (!confirm(`Remove "${song.title}" from your repertoire? This also deletes its sections and practice log.`)) return;
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
    onBackToActive();
  };

  const setStage = async (stage: RepertoireStage) => {
    if (!song) return;
    await db.songs.update(song.id, { stage });
  };

  if (!song) {
    return (
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 p-5 text-sm text-neutral-500">
        loading song…
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* --- Top nav row -------------------------------------- */}
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

      {/* --- 2.1 Metadata ------------------------------------- */}
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
            <label className="flex flex-col gap-1">
              <span className="text-neutral-500 text-xs uppercase tracking-wide">description / why you're learning this</span>
              <textarea rows={2} value={descriptionDraft} onChange={e => setDescriptionDraft(e.target.value)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm" />
            </label>
            <div className="flex items-center gap-2">
              <button onClick={saveMeta} className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90">save</button>
              <button onClick={() => setEditingMeta(false)} className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs">cancel</button>
              <button onClick={deleteSong} className="ml-auto px-3 py-1.5 rounded-md border border-needswork/40 text-needswork text-xs hover:bg-needswork/10">remove from repertoire</button>
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
            {song.description && (
              <p className="text-sm text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">{song.description}</p>
            )}
          </>
        )}
      </section>

      {/* --- 2.2 Stage & guidance ------------------------------ */}
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

      {/* --- 2.3 Lead sheet ------------------------------------ */}
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
            {sections.map(s => (
              <LeadSheetSection
                key={s.id}
                song={song}
                section={s}
                onChange={patch => updateSection(s.id, patch)}
                onDelete={sections.length > 1 ? () => deleteSection(s.id) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {/* --- 2.4 Cross-key grid -------------------------------- */}
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

      {/* --- 2.5 + 2.6 practice history + heatmap -------------- */}
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
          onLogged={() => setShowLogModal(false)}
        />
      )}
    </div>
  );
}

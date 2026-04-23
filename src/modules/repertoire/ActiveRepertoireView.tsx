import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type Song,
  type SongCrossKeyProgress,
  type SongPracticeLog,
} from '../../lib/db';
import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_LABEL,
  evaluateAdvancement,
  freshnessFor,
  humanAgo,
} from './stage';
import SongCard, { formatAddedDate } from './SongCard';
import AddSongModal from './AddSongModal';
import { getPref, setPref } from '../../lib/userPrefs';

interface Props {
  songs: Song[];
  onOpenSong: (songId: string) => void;
}

type SortMode =
  | 'date-added'
  | 'recent-practice'
  | 'alphabetical'
  | 'by-stage'
  | 'by-freshness';

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: 'date-added',       label: 'date added (oldest first)' },
  { id: 'recent-practice',  label: 'recently practiced' },
  { id: 'alphabetical',     label: 'alphabetical (A–Z)' },
  { id: 'by-stage',         label: 'by stage' },
  { id: 'by-freshness',     label: 'by freshness (stalest first)' },
];

const PREF_SORT_MODE = 'repertoireSortMode';

// Rank used by the by-freshness sort — lower = shows earlier.
const FRESHNESS_RANK: Record<ReturnType<typeof freshnessFor>, number> = {
  stale: 0,
  aging: 1,
  recent: 2,
  fresh: 3,
};

export default function ActiveRepertoireView({ songs, onOpenSong }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('date-added');
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getPref<SortMode>(PREF_SORT_MODE, 'date-added');
      if (SORT_OPTIONS.some(o => o.id === s)) setSortMode(s);
      setPrefsLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (prefsLoaded) setPref(PREF_SORT_MODE, sortMode);
  }, [sortMode, prefsLoaded]);

  const logs = useLiveQuery<SongPracticeLog[]>(
    () => db.songPracticeLog.orderBy('timestamp').reverse().toArray(),
    [],
  ) ?? [];
  const crossKey = useLiveQuery<SongCrossKeyProgress[]>(
    () => db.songCrossKeyProgress.toArray(),
    [],
  ) ?? [];

  const logsBySong = useMemo(() => {
    const m = new Map<string, SongPracticeLog[]>();
    for (const l of logs) {
      const arr = m.get(l.songId) ?? [];
      arr.push(l);
      m.set(l.songId, arr);
    }
    return m;
  }, [logs]);

  const crossKeyBySong = useMemo(() => {
    const m = new Map<string, Array<{ sectionId: string; keyName: string; sessionCount: number }>>();
    for (const p of crossKey) {
      const arr = m.get(p.songId) ?? [];
      arr.push({ sectionId: p.sectionId, keyName: p.keyName, sessionCount: p.sessionCount });
      m.set(p.songId, arr);
    }
    return m;
  }, [crossKey]);

  // Per-song freshness/advancement derived once so the dashboard
  // header and the cards share the same computation.
  const perSong = useMemo(() => {
    return songs.map(song => {
      const songLogs = logsBySong.get(song.id) ?? [];
      const lastPractisedAt = songLogs[0]?.timestamp ?? null;
      const freshness = freshnessFor(lastPractisedAt);
      const advancement = evaluateAdvancement({
        currentStage: song.stage ?? DEFAULT_STAGE,
        logs: songLogs,
        originalKey: song.key,
        crossKeyPairs: crossKeyBySong.get(song.id) ?? [],
      });
      return { song, lastPractisedAt, freshness, readyToAdvance: advancement.suggest };
    });
  }, [songs, logsBySong, crossKeyBySong]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STAGES) counts[s] = 0;
    for (const { song } of perSong) {
      const stage = song.stage ?? DEFAULT_STAGE;
      counts[stage] = (counts[stage] ?? 0) + 1;
    }
    return counts;
  }, [perSong]);

  const needsAttentionCount = perSong.filter(
    p => p.freshness === 'aging' || p.freshness === 'stale',
  ).length;
  const readyToAdvanceCount = perSong.filter(p => p.readyToAdvance).length;

  const sortedSongs = useMemo(() => {
    const rows = [...perSong];
    const byDateAdded = (a: Song, b: Song) => a.addedDate - b.addedDate;
    switch (sortMode) {
      case 'date-added':
        rows.sort((a, b) => byDateAdded(a.song, b.song));
        break;
      case 'recent-practice':
        rows.sort((a, b) => (b.lastPractisedAt ?? 0) - (a.lastPractisedAt ?? 0));
        break;
      case 'alphabetical':
        rows.sort((a, b) => a.song.title.localeCompare(b.song.title));
        break;
      case 'by-stage':
        rows.sort((a, b) => {
          const sa = STAGES.indexOf(a.song.stage ?? DEFAULT_STAGE);
          const sb = STAGES.indexOf(b.song.stage ?? DEFAULT_STAGE);
          if (sa !== sb) return sa - sb;
          return byDateAdded(a.song, b.song);
        });
        break;
      case 'by-freshness':
        rows.sort((a, b) => {
          const ra = FRESHNESS_RANK[a.freshness];
          const rb = FRESHNESS_RANK[b.freshness];
          if (ra !== rb) return ra - rb;
          return (a.lastPractisedAt ?? 0) - (b.lastPractisedAt ?? 0);
        });
        break;
    }
    return rows;
  }, [perSong, sortMode]);

  // Stage one-liner formatted for humans.
  const stageLine = STAGES.map(s => `${STAGE_LABEL[s]}: ${stageCounts[s] ?? 0}`).join(' · ');

  const hasCallouts = needsAttentionCount > 0 || readyToAdvanceCount > 0;

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6 space-y-4">
      {/* Top-of-page: big count + subtitle + stage line + optional
          callouts. Scales from big hero number down to muted details. */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-medium tabular-nums leading-none text-[2.5rem] sm:text-[3rem]">
            {songs.length}
          </span>
          <span className="text-lg sm:text-xl text-neutral-700 dark:text-neutral-200">
            {songs.length === 1 ? 'song' : 'songs'}
          </span>
        </div>
        <p className="text-sm text-neutral-500">
          {songs.length === 0
            ? 'your active repertoire is empty — click "+ add song" to start one.'
            : 'in your active repertoire'}
        </p>
      </div>

      {songs.length > 0 && (
        <p className="text-xs text-neutral-500">
          {stageLine}
        </p>
      )}

      {hasCallouts && (
        <div className="space-y-1.5 text-sm">
          {needsAttentionCount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-md border border-developing/30 bg-developing/10 text-developing px-3 py-1.5">
              <span aria-hidden>🟠</span>
              <span>
                <span className="font-medium font-mono tabular-nums">{needsAttentionCount}</span>{' '}
                {needsAttentionCount === 1 ? 'song needs' : 'songs need'} attention
              </span>
            </div>
          )}
          {readyToAdvanceCount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-md border border-fluent/30 bg-fluent/10 text-fluent px-3 py-1.5 ml-0 sm:ml-2">
              <span aria-hidden>✨</span>
              <span>
                <span className="font-medium font-mono tabular-nums">{readyToAdvanceCount}</span>{' '}
                ready to advance
              </span>
            </div>
          )}
        </div>
      )}

      <hr className="border-neutral-200 dark:border-neutral-800" />

      {/* Sort control */}
      <div className="flex items-center justify-end gap-2 flex-wrap text-xs">
        <label className="inline-flex items-center gap-1 text-neutral-500">
          sort by:
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Song cards grid */}
      {sortedSongs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-8 text-center text-sm text-neutral-500">
          no songs yet. starter songs seed automatically — if you've cleared your data, click
          "add song" below.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedSongs.map(({ song, lastPractisedAt, freshness, readyToAdvance }) => (
            <SongCard
              key={song.id}
              song={song}
              lastPractisedAt={lastPractisedAt}
              lastPractisedLabel={humanAgo(lastPractisedAt)}
              addedLabel={formatAddedDate(song.addedDate)}
              freshness={freshness}
              readyToAdvance={readyToAdvance}
              onOpen={() => onOpenSong(song.id)}
            />
          ))}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
        >
          + add song to repertoire
        </button>
      </div>

      {showAdd && (
        <AddSongModal
          onClose={() => setShowAdd(false)}
          onAdded={(songId) => { setShowAdd(false); onOpenSong(songId); }}
        />
      )}
    </section>
  );
}

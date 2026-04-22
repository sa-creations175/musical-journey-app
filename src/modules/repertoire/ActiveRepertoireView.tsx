import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Song, type SongPracticeLog } from '../../lib/db';
import {
  DEFAULT_STAGE,
  FRESHNESS_DOT_CLASS,
  FRESHNESS_LABEL,
  STAGES,
  STAGE_BADGE_CLASS,
  STAGE_LABEL,
  STAGE_TAGLINE,
  freshnessFor,
  humanAgo,
} from './stage';
import SongCard from './SongCard';
import AddSongModal from './AddSongModal';

interface Props {
  songs: Song[];
  onOpenSong: (songId: string) => void;
}

export default function ActiveRepertoireView({ songs, onOpenSong }: Props) {
  const [showAdd, setShowAdd] = useState(false);

  // All practice logs for the module. Pulled once here and indexed per
  // song so SongCard doesn't need to re-query. Live-updates after any
  // session logged elsewhere in the app.
  const logs = useLiveQuery<SongPracticeLog[]>(
    () => db.songPracticeLog.orderBy('timestamp').reverse().toArray(),
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

  // Stage distribution for the summary strip. A quick glance-bar that
  // answers "what kind of rep am I actually practising?".
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STAGES) counts[s] = 0;
    for (const song of songs) {
      const stage = song.stage ?? DEFAULT_STAGE;
      counts[stage] = (counts[stage] ?? 0) + 1;
    }
    return counts;
  }, [songs]);

  // Sort by freshness (freshest first), then by stage order, then by
  // title. Users generally want to see what's warmest at the top.
  const sortedSongs = useMemo(() => {
    const lastTouch = (songId: string): number => {
      const arr = logsBySong.get(songId) ?? [];
      return arr[0]?.timestamp ?? 0;
    };
    return [...songs].sort((a, b) => {
      const la = lastTouch(a.id);
      const lb = lastTouch(b.id);
      if (la !== lb) return lb - la;
      const sa = STAGES.indexOf(a.stage ?? DEFAULT_STAGE);
      const sb = STAGES.indexOf(b.stage ?? DEFAULT_STAGE);
      if (sa !== sb) return sa - sb;
      return a.title.localeCompare(b.title);
    });
  }, [songs, logsBySong]);

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">
          your active repertoire
        </h2>
        <span className="text-xs text-neutral-500">
          {songs.length} song{songs.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Stage distribution strip */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
        {STAGES.map(s => (
          <span
            key={s}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 border ${STAGE_BADGE_CLASS[s]}`}
            title={STAGE_TAGLINE[s]}
          >
            <span className="font-mono tabular-nums font-medium">{stageCounts[s] ?? 0}</span>
            <span>{STAGE_LABEL[s]}</span>
          </span>
        ))}
      </div>

      {/* Freshness legend (small, static) */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-neutral-500">
        <span className="uppercase tracking-wide">freshness:</span>
        {(['fresh', 'recent', 'aging', 'stale'] as const).map(f => (
          <span key={f} className="inline-flex items-center gap-1">
            <span aria-hidden className={`inline-block w-2 h-2 rounded-full ${FRESHNESS_DOT_CLASS[f]}`} />
            {FRESHNESS_LABEL[f]}
          </span>
        ))}
      </div>

      {/* Song cards grid */}
      {sortedSongs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-8 text-center text-sm text-neutral-500">
          no songs yet. starter songs seed automatically — if you've cleared your data, click
          "add a song" below.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedSongs.map(song => {
            const songLogs = logsBySong.get(song.id) ?? [];
            const lastPractised = songLogs[0]?.timestamp ?? null;
            return (
              <SongCard
                key={song.id}
                song={song}
                lastPractisedAt={lastPractised}
                lastPractisedLabel={humanAgo(lastPractised)}
                freshness={freshnessFor(lastPractised)}
                onOpen={() => onOpenSong(song.id)}
              />
            );
          })}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
        >
          + add a song to active repertoire
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

import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SongPracticeLog, type SongSection } from '../../lib/db';
import SongHeatmap from './SongHeatmap';
import PracticeHistory from './PracticeHistory';
import SectionGuidance from './SectionGuidance';

/**
 * One song's practice, as a calendar.
 *
 * ---------------------------------------------------------------
 * THIS IS A MOVE, NOT A NEW SURFACE.
 *
 * The song page carried a "practice history" card holding a heatmap
 * and a session list. Both are here now, unchanged in what they draw —
 * `SongHeatmap` at the calendar's zoom rather than the card's, and
 * `PracticeHistory` as the recent-sessions list. Rewriting either
 * would have made this a second way of showing the same rows.
 *
 * The card had to go because the status has to be visible without
 * scrolling, and a heatmap plus a session list is a lot of page for
 * something you consult occasionally rather than read every visit.
 * What is lost at a glance is smaller than it looks: the matrix cells
 * already fade with staleness, so "has this been touched recently"
 * stays readable in the grid.
 * ---------------------------------------------------------------
 *
 * SHAPED LIKE `ShapesAndPatternsCalendar`, deliberately — back link,
 * heading, the grid in a card, then the sessions. Six modules already
 * reach a calendar through a `view calendar →` link and land on this
 * layout; a seventh that looked different would be a second pattern
 * for one idea.
 *
 * ROUTED AS `/repertoire/calendar?songId=…`, following the deep-link
 * convention `Repertoire.tsx` already reads, rather than adding a
 * second way to name a song in a URL.
 */

/** Roughly six months, matching the S&P calendar's zoom. The card it
 *  replaces showed 91 days, which was sized for a card. */
const CALENDAR_DAYS = 26 * 7;

export default function SongPracticeCalendar() {
  const [searchParams] = useSearchParams();
  const songId = searchParams.get('songId');

  // Null when the id names nothing, undefined while the first read is
  // in flight. The two are different answers and the render below
  // treats them differently.
  const song = useLiveQuery(
    async () => (songId ? (await db.songs.get(songId)) ?? null : null),
    [songId],
  );
  const logs = useLiveQuery<SongPracticeLog[]>(
    () => (songId
      ? db.songPracticeLog.where('songId').equals(songId).toArray()
      : Promise.resolve([])),
    [songId],
  ) ?? [];
  const sections = useLiveQuery<SongSection[]>(
    () => (songId
      ? db.songSections.where('songId').equals(songId).sortBy('order')
      : Promise.resolve([])),
    [songId],
  ) ?? [];

  const sorted = useMemo(
    () => [...logs].sort((a, b) => b.timestamp - a.timestamp),
    [logs],
  );

  // Still reading. `useLiveQuery` returns undefined before its first
  // result, and rendering "no song" here would flash it on every
  // visit — a not-found that turns out to be a song is worse than a
  // moment of nothing.
  if (song === undefined) {
    return <p className="text-xs text-neutral-500">loading…</p>;
  }

  // No songId, or one that names nothing. Says so and offers the way
  // back, rather than rendering an empty calendar that would read as a
  // song nobody has practised.
  if (!songId || song === null) {
    return (
      <div className="space-y-3">
        <Link to="/repertoire" className="text-xs text-neutral-500 hover:text-fluent">
          ← back to repertoire
        </Link>
        <p className="text-sm text-neutral-500">
          {songId ? 'that song no longer exists.' : 'no song named in this link.'}
        </p>
      </div>
    );
  }

  const activeDays = new Set(
    logs.map(l => new Date(l.timestamp).toDateString()),
  ).size;
  const totalMinutes = logs.reduce((s, l) => s + (l.durationMin || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <Link
          to={`/repertoire?songId=${encodeURIComponent(songId)}`}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ← back to {song.title}
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">
          {song.title} · practice calendar
        </h1>
        <p className="text-neutral-500 text-sm">
          every day you practised this song lights up; darker cells = more minutes.
        </p>
      </div>

      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-6 space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2 text-sm">
          <span className="text-neutral-500">last 26 weeks</span>
          <span>
            <span className="font-mono tabular-nums font-medium">{totalMinutes}</span> total minutes
            <span className="text-neutral-400 mx-1.5">·</span>
            <span className="font-mono tabular-nums font-medium">{activeDays}</span> active day{activeDays === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <SongHeatmap logs={logs} days={CALENDAR_DAYS} />
        </div>
      </section>

      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-6 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
            practice history
          </h2>
          {/* The guidance moved with the thing it explains. Leaving it
              on the song page would have described a card that is no
              longer there. */}
          <SectionGuidance surface="practiceHistory" />
        </div>
        <PracticeHistory logs={sorted} sections={sections} />
      </section>
    </div>
  );
}

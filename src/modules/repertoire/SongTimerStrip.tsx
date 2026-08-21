import { useEffect, useState, type ReactNode } from 'react';
import type { Song } from '../../lib/db';
import {
  useSessionTimer,
  useSessionTimes,
} from '../../lib/sessionTimer/SessionTimerContext';
import { useSongTimer } from './useSongTimer';
import { inactivityMs } from './songTimer';
import {
  AMBER_CHOICES,
  getAmberMinutes,
  setAmberMinutes,
} from './songTimerPrefs';

/**
 * The two timers, side by side, in one glance.
 *
 * ---------------------------------------------------------------
 * THEY MEASURE DIFFERENT THINGS AND MUST NEVER BE SUMMED.
 *
 *   FULL PRACTICE SESSION — total time in this sitting, every module.
 *   SONG "…"              — time on this one song, whatever the work.
 *
 * Song minutes sit INSIDE session minutes, so adding them invents
 * time that did not happen. The labels are the defence: they share no
 * words, so they cannot blur at a glance, and "FULL" states the
 * containment in the label itself rather than in a sub-line.
 *
 * No sub-lines, deliberately. With the containment carried by the
 * labels, a second line under each would say the same thing twice in
 * a strip meant to be read at a glance. What a sub-line would have
 * said — that song time counts lead sheet work, drilling and testing,
 * not just playing — is in the tooltip.
 * ---------------------------------------------------------------
 *
 * THE TITLE WRAPS RATHER THAN TRUNCATING. A cut like "Never Would
 * Have Made…" lands one word short of the recognisable phrase, and an
 * unrecognisable song name is this strip failing at its only job. The
 * character budget existed to protect a layout that can absorb the
 * second line instead.
 */

interface Props {
  song: Song;
  /** Every song, so a timer belonging to another one can be named —
   *  and so a timer whose song has been deleted can be recognised as
   *  unresolvable rather than rendered as a blank name. */
  songs: ReadonlyArray<Song>;
}

export default function SongTimerStrip({ song, songs }: Props) {
  const { state: sessionState } = useSessionTimer();
  const sessionTimes = useSessionTimes();
  const timer = useSongTimer(song.id);
  const [busy, setBusy] = useState(false);
  const [amberMin, setAmberMinState] = useState<number | null>(null);
  const [prefLoaded, setPrefLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void getAmberMinutes().then(v => {
      if (live) { setAmberMinState(v); setPrefLoaded(true); }
    });
    return () => { live = false; };
  }, []);

  // Amber only once the preference has actually loaded. Defaulting to
  // 5 while the read is in flight would flash amber on a timer that
  // has been running for six minutes with the user right there.
  const amber = prefLoaded
    && amberMin !== null
    && timer.record !== null
    && timer.record.running
    && inactivityMs(timer.record, Date.now()) >= amberMin * 60_000;

  const sessionLive = sessionState.status === 'running' || sessionState.status === 'paused';

  const otherSong = timer.record !== null && !timer.isThisSong
    ? songs.find(s => s.id === timer.record!.songId) ?? null
    : null;
  // A timer whose song is gone. The delete cascade cannot reach
  // localStorage, so this render is the first moment anyone can
  // notice. Nothing can be logged against a song that no longer
  // exists and no user action would fix it, so it goes quietly.
  //
  // In an effect, not during render: `discard` writes state, and a
  // setState in a render body is a re-render loop rather than a
  // cleanup. The guard also waits for `songs` to be non-empty —
  // useLiveQuery returns [] on its first pass, and treating that as
  // "the song is deleted" would throw away a live timer every time
  // the page mounted.
  const orphaned = timer.record !== null
    && !timer.isThisSong
    && otherSong === null
    && songs.length > 0;
  const { discard } = timer;
  useEffect(() => {
    if (orphaned) discard();
  }, [orphaned, discard]);

  const run = async (fn: () => Promise<number>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 px-3 py-2 space-y-1.5">
      {sessionLive && (
        <Row
          label="FULL PRACTICE SESSION"
          title="Every module, this whole sitting. The song timer below is part of this, not extra to it."
          time={formatMs(sessionTimes.activeMs)}
        />
      )}

      {timer.isThisSong ? (
        <Row
          label={<SongLabel title={song.title} />}
          title="Time on this song — lead sheet work, getting it under the fingers, drilling a section, testing. All of it counts."
          time={formatMs(timer.elapsedMs)}
          amber={amber}
          action={
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(timer.stopAndLog)}
              className="shrink-0 px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium rounded bg-needswork text-white hover:opacity-90 disabled:opacity-40"
            >
              ■ stop
            </button>
          }
        />
      ) : otherSong !== null ? (
        /* THE SWAP, AND IT IS NEVER SILENT. sessionTimer refuses a
           second start by returning state unchanged; this states what
           is running, on what, for how long, and offers both ways
           out. Confirming LOGS the other song's minutes rather than
           discarding them. */
        <div className="space-y-1.5">
          <Row
            label={<SongLabel title={otherSong.title} />}
            title={`A timer is already running on ${otherSong.title}.`}
            time={formatMs(timer.elapsedMs)}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              already running on another song
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(timer.swapToThisSong)}
              className="px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium rounded bg-fluent text-white hover:opacity-90 disabled:opacity-40"
            >
              log it and start “{song.title}”
            </button>
            <span className="text-[11px] text-neutral-400">or leave it running</span>
          </div>
        </div>
      ) : (
        <Row
          label={<SongLabel title={song.title} />}
          title="Time on this song — lead sheet work, getting it under the fingers, drilling a section, testing. All of it counts."
          time="—"
          action={
            <button
              type="button"
              disabled={busy}
              onClick={timer.start}
              className="shrink-0 px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium rounded border border-fluent text-fluent hover:bg-fluent/10 disabled:opacity-40"
            >
              ▶ start
            </button>
          }
        />
      )}

      {/* Only while this song's timer is running. A dial for a thing
          that is not happening is clutter on every other song page. */}
      {timer.isThisSong && prefLoaded && (
        <div className="pt-1 border-t border-neutral-200 dark:border-neutral-800">
          <AmberSetting
            value={amberMin}
            onChange={next => {
              setAmberMinState(next);
              void setAmberMinutes(next);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  time,
  title,
  action,
  amber,
}: {
  label: ReactNode;
  time: string;
  title: string;
  action?: ReactNode;
  /** The app has seen nothing for longer than the threshold. Colours
   *  the NUMBER and nothing else — no modal, no sound, nothing
   *  blocked. If you are playing you ignore it; if you walked away
   *  you see it the moment you glance back. */
  amber?: boolean;
}) {
  return (
    <div className="flex items-start gap-3" title={title}>
      <span className="flex-1 min-w-0 text-[11px] uppercase tracking-wide font-medium text-neutral-600 dark:text-neutral-300">
        {label}
      </span>
      <span
        className={[
          'shrink-0 font-mono tabular-nums text-sm transition-colors',
          amber
            ? 'text-[#E88943]'
            : 'text-neutral-800 dark:text-neutral-100',
        ].join(' ')}
        title={amber ? 'No app activity for a while — the time is still counting.' : undefined}
      >
        {time}
      </span>
      {action}
    </div>
  );
}

/**
 * The amber threshold control.
 *
 * Inline rather than on a settings screen, because there is no
 * settings route and because this is exactly where you are standing
 * when you decide the question fires too often.
 */
function AmberSetting({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
      <span>go amber after</span>
      <select
        value={value === null ? 'never' : String(value)}
        onChange={e => onChange(e.target.value === 'never' ? null : Number(e.target.value))}
        className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1 py-0.5"
      >
        {AMBER_CHOICES.map(c => (
          <option key={String(c)} value={c === null ? 'never' : String(c)}>
            {c === null ? 'never' : `${c} min`}
          </option>
        ))}
      </select>
      <span>of no app activity</span>
    </label>
  );
}

/** `SONG "Title"`, wrapping. `break-words` rather than a character
 *  budget — see the header. */
function SongLabel({ title }: { title: string }) {
  return <span className="break-words">SONG “{title}”</span>;
}

/** `h:mm` past an hour, `m` below it. Seconds are noise on a timer
 *  you glance at while playing. */
function formatMs(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;
}

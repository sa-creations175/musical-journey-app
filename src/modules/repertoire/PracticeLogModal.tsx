import { useEffect, useRef, useState } from 'react';
import { db, type Song, type SongSection } from '../../lib/db';
import Modal from '../../components/Modal';
import { recordEngagement } from '../../lib/spacingState';

interface Props {
  song: Song;
  sections: SongSection[];
  onClose: () => void;
  onLogged: () => void;
}

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60] as const;
const FEELS: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string; emoji: string }> = [
  { value: 1, label: 'struggled',      emoji: '😓' },
  { value: 2, label: 'working on it',  emoji: '🧗' },
  { value: 3, label: 'comfortable',    emoji: '🙂' },
  { value: 4, label: 'in flow',        emoji: '🎶' },
  { value: 5, label: 'breakthrough',   emoji: '✨' },
];

/**
 * Map the 5-point feel scale onto the 3-categorical rating vocabulary
 * spacingState consumes. Integration memory (songs) calibrates more
 * leniently than procedural (Shapes & Patterns 4-point): "in flow" (4)
 * is still cruising, not flying — flying is reserved for genuine
 * breakthrough sessions (5). Promotion threshold remains "last 3
 * ratings all in {flying, cruising}", so 3-or-better keeps the streak
 * alive.
 *
 *   1 (struggled)      → crawling
 *   2 (working on it)  → crawling
 *   3 (comfortable)    → cruising
 *   4 (in flow)        → cruising
 *   5 (breakthrough)   → flying
 */
function feelToRating(feel: 1 | 2 | 3 | 4 | 5): 'flying' | 'cruising' | 'crawling' {
  if (feel >= 5) return 'flying';
  if (feel >= 3) return 'cruising';
  return 'crawling';
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function crossKeyRowId(songId: string, sectionId: string, keyName: string): string {
  return `${songId}:${sectionId}:${keyName}`;
}

/**
 * Modal for logging a practice session. Two-phase UX:
 *   · Start the timer (optional) and leave the modal open while you
 *     practise — click "finish session" when done.
 *   · Or skip the timer and fill in duration manually.
 *
 * Submit writes a songPracticeLog row AND bumps every
 * songCrossKeyProgress row that intersects (section × key).
 */
export default function PracticeLogModal({ song, sections, onClose, onLogged }: Props) {
  // Timer state. Seconds since start. Ticks via setInterval while
  // running; paused value preserved in pausedAt.
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSecs, setTimerSecs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!timerRunning) return;
    intervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const base = accumulatedRef.current;
      const started = startedAtRef.current ?? now;
      setTimerSecs(base + Math.floor((now - started) / 1000));
    }, 500);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timerRunning]);

  const startTimer = () => {
    if (timerRunning) return;
    startedAtRef.current = Date.now();
    setTimerRunning(true);
  };
  const pauseTimer = () => {
    if (!timerRunning) return;
    const now = Date.now();
    accumulatedRef.current += Math.floor((now - (startedAtRef.current ?? now)) / 1000);
    setTimerSecs(accumulatedRef.current);
    startedAtRef.current = null;
    setTimerRunning(false);
  };
  const resetTimer = () => {
    pauseTimer();
    accumulatedRef.current = 0;
    setTimerSecs(0);
  };

  const [duration, setDuration] = useState<number>(0);
  const [customDuration, setCustomDuration] = useState('');
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [feel, setFeel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [notes, setNotes] = useState('');
  const [atTargetTempo, setAtTargetTempo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // If the timer ran, use its value for the duration. User can override.
  const effectiveDurationMin = (() => {
    if (duration > 0) return duration;
    if (customDuration.trim() !== '') {
      const n = Number(customDuration);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    if (timerSecs > 0) return Math.max(1, Math.round(timerSecs / 60));
    return 0;
  })();

  const canSubmit = effectiveDurationMin > 0 && !submitting;

  const toggleId = (arr: string[], id: string): string[] => (
    arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
  );

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const now = Date.now();
      const logId = uid('plog');
      await db.transaction('rw', [db.songPracticeLog, db.songCrossKeyProgress], async () => {
        await db.songPracticeLog.add({
          id: logId,
          songId: song.id,
          timestamp: now,
          durationMin: effectiveDurationMin,
          sectionIds,
          keys,
          feelRating: feel,
          notes: notes.trim() || undefined,
          atTargetTempo,
        });

        // Bump cross-key progress rows for every (section × key)
        // pair touched. If the user practised the whole song (no
        // sections selected), apply to every section.
        const targetSections = sectionIds.length === 0
          ? sections.map(s => s.id)
          : sectionIds;
        const targetKeys = keys.length === 0 ? (song.key ? [song.key] : []) : keys;

        for (const sid of targetSections) {
          for (const k of targetKeys) {
            const rowId = crossKeyRowId(song.id, sid, k);
            const existing = await db.songCrossKeyProgress.get(rowId);
            if (existing) {
              await db.songCrossKeyProgress.put({
                ...existing,
                sessionCount: existing.sessionCount + 1,
                lastPracticed: now,
              });
            } else {
              await db.songCrossKeyProgress.add({
                id: rowId,
                songId: song.id,
                sectionId: sid,
                keyName: k,
                sessionCount: 1,
                lastPracticed: now,
                mastered: false,
              });
            }
          }
        }
      });
      // spacingState engagement (whole-song level for Phase 2 — cell-
      // level granularity ships in Phase 3). Outside the transaction
      // by design: a spacingState write failure must not roll back
      // the practice log. Multi-section / multi-key sessions still
      // produce a single engagement on songId — the user's overall
      // feel rating represents the whole session.
      await recordEngagement({
        itemRef: song.id,
        moduleRef: 'repertoire',
        signal: { kind: 'rating', rating: feelToRating(feel) },
        timestamp: now,
      });
      onLogged();
    } finally {
      setSubmitting(false);
    }
  };

  const mm = Math.floor(timerSecs / 60).toString().padStart(2, '0');
  const ss = (timerSecs % 60).toString().padStart(2, '0');

  return (
    <Modal
      open
      onClose={onClose}
      title={`log a practice session — ${song.title}`}
      description="takes a minute. duration + feel are the only required bits."
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              canSubmit ? 'bg-fluent hover:opacity-90' : 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
            }`}
          >
            save session
          </button>
        </div>
      )}
    >
      <div className="space-y-4 text-sm">
        {/* Timer */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl tabular-nums">
              {mm}:{ss}
            </span>
            <span className="text-[11px] text-neutral-500">
              optional — start while you practise, or skip and fill duration manually
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!timerRunning ? (
              <button
                onClick={startTimer}
                className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
              >
                {timerSecs > 0 ? 'resume' : 'start'} timer
              </button>
            ) : (
              <button
                onClick={pauseTimer}
                className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-xs font-medium hover:bg-fluent/10"
              >
                pause
              </button>
            )}
            {timerSecs > 0 && (
              <button
                onClick={resetTimer}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500"
              >
                reset
              </button>
            )}
          </div>
        </div>

        {/* Duration */}
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
            how long did you practise?
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {DURATION_PRESETS.map(m => (
              <button
                key={m}
                onClick={() => { setDuration(m); setCustomDuration(''); }}
                className={`px-2.5 py-1 rounded-md border text-xs ${
                  duration === m
                    ? 'bg-fluent text-white border-fluent'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                }`}
              >
                {m}m
              </button>
            ))}
            <input
              type="number"
              min={1}
              placeholder="custom"
              value={customDuration}
              onChange={e => { setCustomDuration(e.target.value); setDuration(0); }}
              className="w-20 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            />
            {timerSecs > 0 && duration === 0 && customDuration.trim() === '' && (
              <span className="text-[11px] text-neutral-500">
                timer → {Math.max(1, Math.round(timerSecs / 60))} min
              </span>
            )}
          </div>
        </div>

        {/* Sections */}
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
            which section(s) did you work on? <span className="normal-case text-neutral-400">(leave blank = whole song)</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {sections.filter(s => !s.hidden).map(s => (
              <button
                key={s.id}
                onClick={() => setSectionIds(v => toggleId(v, s.id))}
                className={`px-2.5 py-1 rounded-md border text-xs ${
                  sectionIds.includes(s.id)
                    ? 'bg-fluent text-white border-fluent'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Keys */}
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
            which key(s) did you practise in? <span className="normal-case text-neutral-400">(blank = original key)</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {KEYS.map(k => (
              <button
                key={k}
                onClick={() => setKeys(v => toggleId(v, k))}
                className={`px-2 py-1 rounded-md border text-xs font-mono ${
                  keys.includes(k)
                    ? 'bg-fluent text-white border-fluent'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* Feel */}
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
            how did it feel?
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FEELS.map(f => (
              <button
                key={f.value}
                onClick={() => setFeel(f.value)}
                className={`px-2.5 py-1 rounded-md border text-xs inline-flex items-center gap-1.5 ${
                  feel === f.value
                    ? 'bg-fluent text-white border-fluent'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                }`}
                title={f.label}
              >
                <span aria-hidden>{f.emoji}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Target-tempo flag — drives Learning → Comfortable suggestion */}
        <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={atTargetTempo}
            onChange={e => setAtTargetTempo(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-fluent focus:ring-fluent"
          />
          <span>I played at or near target tempo</span>
          <span className="text-neutral-400">
            (drives the learning → comfortable suggestion)
          </span>
        </label>

        {/* Notes */}
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="what worked, what didn't, sticky spots, voicings to try"
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
    </Modal>
  );
}

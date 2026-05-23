import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AttemptRecord } from '../../../lib/db';
import {
  pickAdaptive,
  RECENT_HISTORY_SIZE,
  ROLLING_WINDOW_SIZE,
  type AdaptiveCandidate,
} from '../../../lib/adaptiveSelection';
import { daysBetween, localDayKey } from '../../../lib/dailyGoal';
import { TIER_WEIGHT, computeTier } from '../../../lib/tier';
import { updateDailySummary } from '../../../lib/dailySummaries';
import { recordEngagement } from '../../../lib/spacingState';
import { getPref, setPref } from '../../../lib/userPrefs';
import SpeedControl from '../../../components/SpeedControl';
import FluencyProtectionNotice from '../../../components/FluencyProtectionNotice';
import AnswerVerdict from '../../../components/AnswerVerdict';
import { MODES, modeById, pickDecoys, type Mode } from './catalog';
import { playModalVamp, vampDurationSeconds, type ModePlaybackHandle } from './modeAudio';
import {
  MODULE_ID,
  PREF_LOOP_COUNT,
  PREF_ROOT_NOTE,
  PREF_VAMP_SPEED,
  ROOT_NOTES,
  midiToLabel,
  randomRootMidi,
  songSearchUrl,
  vampItemId,
} from './shared';

// Vamps default moderately slow — slow enough that the modal colour
// lands without rushing, but faster than the scale tab because a vamp
// needs rhythmic momentum to feel like music.
const VAMP_SPEED_DEFAULT = 0.75;

interface Props {
  attempts: AttemptRecord[];
  pool: Mode[];
  focusActive: boolean;
}

type RunState = 'idle' | 'playing' | 'answering' | 'reveal';
type LoopCount = 2 | 3 | 4 | 5 | 6 | 99;
const DEFAULT_LOOP: LoopCount = 4;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SitInsideTab({ attempts, pool, focusActive }: Props) {
  // Focus sessions with fewer than 4 items don't truly test fluency —
  // the user knows what's coming. Attempts still log (calendar, daily
  // goal, streaks unaffected) but the rolling-window tier math ignores
  // them.
  const focusProtected = focusActive && pool.length < 4;
  const [runState, setRunState] = useState<RunState>('idle');
  const [active, setActive] = useState<Mode | null>(null);
  const [rootMidi, setRootMidi] = useState<number>(() => randomRootMidi());
  const [choices, setChoices] = useState<Mode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [rootLock, setRootLockState] = useState<'random' | number>('random');
  const [loopCount, setLoopCountState] = useState<LoopCount>(DEFAULT_LOOP);
  // Loop count captured at round start — replay should use the value in
  // effect when the user heard the vamp, not whatever the dropdown says
  // at replay time. Settings apply forward via the next round.
  const [activeLoopCount, setActiveLoopCount] = useState<LoopCount>(DEFAULT_LOOP);

  useEffect(() => {
    (async () => {
      const storedRoot = await getPref<string | number>(PREF_ROOT_NOTE, 'random');
      if (typeof storedRoot === 'number') setRootLockState(storedRoot);
      else setRootLockState('random');
      const storedLoop = await getPref<LoopCount>(PREF_LOOP_COUNT, DEFAULT_LOOP);
      setLoopCountState(storedLoop);
    })();
  }, []);

  const setRootLock = async (v: 'random' | number) => {
    setRootLockState(v);
    await setPref(PREF_ROOT_NOTE, v === 'random' ? 'random' : v);
  };
  const setLoopCount = async (v: LoopCount) => {
    setLoopCountState(v);
    await setPref(PREF_LOOP_COUNT, v);
  };

  const speed = useLiveQuery(
    async () => getPref<number>(PREF_VAMP_SPEED, VAMP_SPEED_DEFAULT),
    [],
  ) ?? VAMP_SPEED_DEFAULT;
  const speedRef = useRef(speed); speedRef.current = speed;

  const playbackRef = useRef<ModePlaybackHandle | null>(null);
  const endTimerRef = useRef<number | null>(null);

  const groupedAttempts = useMemo(() => {
    const m = new Map<string, AttemptRecord[]>();
    for (const mode of MODES) m.set(vampItemId(mode), []);
    for (const a of attempts) {
      if (a.moduleId !== MODULE_ID) continue;
      if (a.excludeFromFluency) continue;
      const bucket = m.get(a.itemId);
      if (bucket) bucket.push(a);
    }
    for (const arr of m.values()) arr.sort((x, y) => y.timestamp - x.timestamp);
    return m;
  }, [attempts]);

  const recentHistory = useMemo(() => {
    const filtered = attempts
      .filter(a => a.moduleId === MODULE_ID && a.itemId.endsWith('-tab2'))
      .sort((a, b) => b.timestamp - a.timestamp);
    return new Set(filtered.slice(0, RECENT_HISTORY_SIZE).map(a => a.itemId));
  }, [attempts]);

  const buildCandidates = (): AdaptiveCandidate<Mode>[] => {
    const today = localDayKey();
    return pool.map(mode => {
      const keyed = groupedAttempts.get(vampItemId(mode)) ?? [];
      const recent = keyed.slice(0, ROLLING_WINDOW_SIZE);
      const correctN = recent.filter(a => a.correct).length;
      const latestTs = keyed[0]?.timestamp;
      const daysSince = latestTs ? daysBetween(localDayKey(new Date(latestTs)), today) : null;
      const tier = computeTier({
        windowCorrect: correctN,
        windowTotal: recent.length,
        daysSinceLastAttempt: daysSince,
      });
      return {
        item: mode,
        baseWeight: TIER_WEIGHT[tier],
        inRecentHistory: recentHistory.has(vampItemId(mode)),
      };
    });
  };

  const stopPlayback = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    if (endTimerRef.current !== null) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  };

  const startRound = async () => {
    stopPlayback();
    if (pool.length === 0) return;
    const candidates = buildCandidates();
    if (candidates.length === 0) return;
    const mode = pickAdaptive(candidates);
    const newRoot = rootLock === 'random' ? randomRootMidi() : rootLock;
    const decoyPool = pool.length >= 4 ? pool : MODES;
    const otherModes = decoyPool.filter(m => m.id !== mode.id);
    const decoys = otherModes.length >= 3
      ? pickDecoys(mode, 3)
      : shuffle(otherModes).slice(0, 3);
    const opts = shuffle([mode, ...decoys]).slice(0, 4);

    setActive(mode);
    setRootMidi(newRoot);
    setChoices(opts);
    setSelectedId(null);
    setSubmitted(false);
    setRunState('playing');

    // Snapshot loopCount into the active round so mid-flight dropdown
    // changes apply only to the next round, never retroactively.
    const roundLoop: LoopCount = loopCount === 99 ? 99 : loopCount;
    setActiveLoopCount(roundLoop);
    const handle = await playModalVamp(newRoot, mode.vamp, speedRef.current, roundLoop);
    playbackRef.current = handle;
    if (roundLoop !== 99) {
      const dur = vampDurationSeconds(mode.vamp, roundLoop, speedRef.current);
      endTimerRef.current = window.setTimeout(() => {
        playbackRef.current = null;
        endTimerRef.current = null;
        setRunState(prev => prev === 'playing' ? 'answering' : prev);
      }, dur * 1000 + 300);
    }
  };

  const handleStop = () => {
    stopPlayback();
    setRunState('answering');
  };

  const handleReplay = async () => {
    if (!active) return;
    stopPlayback();
    // Use the loop count that was in effect when this round started —
    // not whatever the dropdown says now.
    const effectiveLoop = activeLoopCount;
    const handle = await playModalVamp(rootMidi, active.vamp, speedRef.current, effectiveLoop);
    playbackRef.current = handle;
    if (effectiveLoop !== 99) {
      const dur = vampDurationSeconds(active.vamp, effectiveLoop, speedRef.current);
      endTimerRef.current = window.setTimeout(() => {
        playbackRef.current = null;
        endTimerRef.current = null;
      }, dur * 1000 + 300);
    }
  };

  const handleSubmit = async (choice: Mode) => {
    if (!active || submitted) return;
    stopPlayback();
    const correct = choice.id === active.id;
    setSelectedId(choice.id);
    setSubmitted(true);
    const timestamp = Date.now();
    const itemRef = vampItemId(active);
    await db.attempts.add({
      moduleId: MODULE_ID,
      itemId: itemRef,
      correct,
      timestamp,
      ...(focusProtected ? { excludeFromFluency: true } : {}),
    });
    await recordEngagement({
      itemRef,
      moduleRef: MODULE_ID,
      signal: { kind: 'attempt', correct },
      timestamp,
    });
    await updateDailySummary(MODULE_ID);
    setRunState('reveal');
  };

  const handleNext = () => {
    stopPlayback();
    setRunState('idle');
    setActive(null);
  };

  useEffect(() => () => { stopPlayback(); }, []);

  const wasCorrect = submitted && active && selectedId === active.id;
  const rootLabel = midiToLabel(rootMidi);
  const showRootHint = runState !== 'idle';

  return (
    <div className="space-y-4">
      {focusProtected && <FluencyProtectionNotice />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">root note</span>
          <select
            value={rootLock === 'random' ? 'random' : String(rootLock)}
            onChange={e => {
              const v = e.target.value;
              setRootLock(v === 'random' ? 'random' : Number(v));
            }}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
            <option value="random">random each round</option>
            {ROOT_NOTES.map(n => (
              <option key={n.midi} value={n.midi}>{n.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">loop count</span>
          <select
            value={String(loopCount)}
            onChange={e => setLoopCount(Number(e.target.value) as LoopCount)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="99">until stopped</option>
          </select>
        </label>
        <div className="flex items-end">
          <SpeedControl
            moduleId={MODULE_ID}
            prefKeyOverride={PREF_VAMP_SPEED}
            fallbackOverride={VAMP_SPEED_DEFAULT}
          />
        </div>
      </div>

      <div className="flex items-center justify-center flex-wrap gap-3">
        {showRootHint && (
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">root</div>
            <div className="text-2xl font-medium font-mono tabular-nums">{rootLabel}</div>
          </div>
        )}
        {runState === 'idle' && (
          <button
            onClick={startRound}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            play vamp
          </button>
        )}
        {runState === 'playing' && (
          <button
            onClick={handleStop}
            className="px-4 py-2 rounded-lg border border-needswork text-needswork text-sm font-medium hover:bg-needswork/10"
          >
            stop and answer
          </button>
        )}
        {(runState === 'answering' || runState === 'reveal') && (
          <button
            onClick={handleReplay}
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            replay vamp
          </button>
        )}
        {runState === 'reveal' && (
          <button
            onClick={handleNext}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-sm font-medium hover:opacity-90"
          >
            next →
          </button>
        )}
      </div>

      {runState === 'playing' && (
        <p className="text-xs text-neutral-500 text-center italic">
          sit inside it — answer when you're ready, or let the loop finish.
        </p>
      )}

      {(runState === 'answering' || runState === 'reveal') && active && (
        <div>
          <p className="text-xs text-neutral-500 text-center mb-2">
            what mode did you just sit inside?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {choices.map(opt => {
              let classes = 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent';
              if (submitted) {
                const isCorrect = opt.id === active.id;
                const isSelected = opt.id === selectedId;
                if (isCorrect) classes = 'border-fluent bg-fluent/10 text-fluent';
                else if (isSelected) classes = 'border-needswork bg-needswork/10 text-needswork';
                else classes = 'border-neutral-200 dark:border-neutral-700 opacity-50';
              }
              return (
                <button
                  key={opt.id}
                  disabled={submitted}
                  onClick={() => handleSubmit(opt)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${classes} disabled:cursor-default`}
                >
                  {opt.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {runState === 'reveal' && active && (
        <VampReveal mode={active} wasCorrect={!!wasCorrect} />
      )}
    </div>
  );
}

function VampReveal({ mode, wasCorrect }: { mode: Mode; wasCorrect: boolean }) {
  const topSongs = mode.songExamples.slice(0, 3);
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3 text-sm">
      <div className="text-center space-y-1">
        <AnswerVerdict state={wasCorrect ? 'correct' : 'incorrect'} />
        <span className="font-medium">{mode.name}</span>
        <span className="text-xs text-neutral-500">{mode.signatureAlteration}</span>
      </div>

      <p className="text-xs text-neutral-500">{mode.quickDefinition}</p>
      <p className="text-sm text-neutral-700 dark:text-neutral-200">{mode.starterDescription}</p>

      <div className="rounded-md bg-neutral-100/70 dark:bg-neutral-800/60 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 mr-1.5">vamp</span>
        {mode.vamp.description}
      </div>

      {topSongs.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">songs where you'll hear it</div>
          <ul className="space-y-1 text-xs">
            {topSongs.map((s, i) => (
              <li key={i} className="flex items-center gap-2 flex-wrap">
                <span>
                  <span className="font-medium">{s.title}</span>
                  <span className="text-neutral-500"> — {s.artist}</span>
                </span>
                <a href={songSearchUrl('spotify', s.title, s.artist)} target="_blank" rel="noopener noreferrer"
                   className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] hover:border-fluent hover:text-fluent">spotify</a>
                <a href={songSearchUrl('youtube', s.title, s.artist)} target="_blank" rel="noopener noreferrer"
                   className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] hover:border-fluent hover:text-fluent">youtube</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <a
        href={`#mode-card-${mode.id}`}
        className="inline-flex items-center gap-1 text-xs text-fluent hover:underline"
      >
        see full {mode.name} reference →
      </a>

      <CrossReferenceLink modeId={mode.id} />
    </div>
  );
}

function CrossReferenceLink({ modeId }: { modeId: string }) {
  const refs: Record<string, { label: string; href: string }> = {
    dorian: { label: 'Dorian lives in the "Dorian R&B vamp" progression (tier 5)', href: '/ear-training/chord-progressions' },
    lydian: { label: 'hear Lydian colors in the "floating Lydian" progression', href: '/ear-training/chord-progressions' },
    mixolydian: { label: 'the ♭VII backdoor cadence uses Mixolydian color', href: '/ear-training/chord-progressions' },
    'harmonic-minor': { label: 'minor jazz turnaround uses the raised 7', href: '/ear-training/chord-progressions' },
  };
  const ref = refs[modeId];
  // Reference the imported modeById even when no explicit cross-ref exists,
  // so the import stays used regardless of which entries are filled in.
  void modeById;
  if (!ref) return null;
  return (
    <div className="text-[11px] text-neutral-500">
      <Link to={ref.href} className="hover:text-fluent">{ref.label} →</Link>
    </div>
  );
}

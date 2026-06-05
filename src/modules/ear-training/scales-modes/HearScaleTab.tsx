import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { type AttemptRecord } from '../../../lib/db';
import { addAttempt } from '../../../lib/practiceWrites';
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
import { playModeScale, scaleDurationSeconds, type ModePlaybackHandle } from './modeAudio';
import {
  MODULE_ID,
  PREF_ROOT_NOTE,
  PREF_SCALE_SPEED,
  ROOT_NOTES,
  midiToLabel,
  randomRootMidi,
  scaleItemId,
  songSearchUrl,
} from './shared';

// Scale playback defaults slow — the whole point of this tab is
// catching the shape of each interval step, not speed-running the scale.
const SCALE_SPEED_DEFAULT = 0.5;

interface Props {
  attempts: AttemptRecord[];
  pool: Mode[];
  focusActive: boolean;
}

type RunState = 'idle' | 'playing' | 'answering' | 'reveal';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function HearScaleTab({ attempts, pool, focusActive }: Props) {
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

  // Root-note preference: empty string = "random each round", otherwise
  // a MIDI value is locked in.
  const [rootLock, setRootLockState] = useState<'random' | number>('random');
  useEffect(() => {
    (async () => {
      const stored = await getPref<string | number>(PREF_ROOT_NOTE, 'random');
      if (typeof stored === 'number') setRootLockState(stored);
      else setRootLockState('random');
    })();
  }, []);

  const setRootLock = async (v: 'random' | number) => {
    setRootLockState(v);
    await setPref(PREF_ROOT_NOTE, v === 'random' ? 'random' : v);
  };

  const speed = useLiveQuery(
    async () => getPref<number>(PREF_SCALE_SPEED, SCALE_SPEED_DEFAULT),
    [],
  ) ?? SCALE_SPEED_DEFAULT;
  const speedRef = useRef(speed); speedRef.current = speed;

  const playbackRef = useRef<ModePlaybackHandle | null>(null);
  const endTimerRef = useRef<number | null>(null);

  // --- Adaptive selection -------------------------------------------
  const groupedAttempts = useMemo(() => {
    const m = new Map<string, AttemptRecord[]>();
    for (const mode of MODES) m.set(scaleItemId(mode), []);
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
      .filter(a => a.moduleId === MODULE_ID && a.itemId.endsWith('-tab1'))
      .sort((a, b) => b.timestamp - a.timestamp);
    return new Set(filtered.slice(0, RECENT_HISTORY_SIZE).map(a => a.itemId));
  }, [attempts]);

  const buildCandidates = (): AdaptiveCandidate<Mode>[] => {
    const today = localDayKey();
    return pool.map(mode => {
      const keyed = groupedAttempts.get(scaleItemId(mode)) ?? [];
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
        inRecentHistory: recentHistory.has(scaleItemId(mode)),
      };
    });
  };

  // --- Actions -------------------------------------------------------
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

    // Pre-build decoys excluding anything not in the pool — but always
    // keep 4 options; fall back to any mode if the filtered pool is tiny.
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

    const handle = await playModeScale(newRoot, mode.scaleIntervals, speedRef.current);
    playbackRef.current = handle;
    const dur = scaleDurationSeconds(mode.scaleIntervals, speedRef.current);
    endTimerRef.current = window.setTimeout(() => {
      playbackRef.current = null;
      endTimerRef.current = null;
      setRunState(prev => prev === 'playing' ? 'answering' : prev);
    }, dur * 1000 + 200);
  };

  const handleReplay = async () => {
    if (!active) return;
    stopPlayback();
    const handle = await playModeScale(rootMidi, active.scaleIntervals, speedRef.current);
    playbackRef.current = handle;
    const dur = scaleDurationSeconds(active.scaleIntervals, speedRef.current);
    endTimerRef.current = window.setTimeout(() => {
      playbackRef.current = null;
      endTimerRef.current = null;
    }, dur * 1000 + 200);
  };

  const handleSubmit = async (choice: Mode) => {
    if (!active || submitted) return;
    const correct = choice.id === active.id;
    setSelectedId(choice.id);
    setSubmitted(true);
    const timestamp = Date.now();
    const itemRef = scaleItemId(active);
    await addAttempt({
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
        <div className="flex items-end">
          <SpeedControl
            moduleId={MODULE_ID}
            prefKeyOverride={PREF_SCALE_SPEED}
            fallbackOverride={SCALE_SPEED_DEFAULT}
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
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
          >
            play scale
          </button>
        )}
        {runState === 'playing' && (
          <button
            onClick={() => { stopPlayback(); setRunState('answering'); }}
            className="px-4 py-2 rounded-lg border border-needswork text-needswork text-sm font-medium hover:bg-needswork/10"
          >
            stop
          </button>
        )}
        {(runState === 'answering' || runState === 'reveal') && (
          <button
            onClick={handleReplay}
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            replay
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

      {(runState === 'answering' || runState === 'reveal') && active && (
        <div>
          <p className="text-xs text-neutral-500 text-center mb-2">
            which mode did you hear?
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
        <ScaleReveal mode={active} wasCorrect={!!wasCorrect} />
      )}
    </div>
  );
}

function ScaleReveal({ mode, wasCorrect }: { mode: Mode; wasCorrect: boolean }) {
  return (
    <div className="rounded-lg border border-black/[0.07] p-4 space-y-3 text-sm">
      <div className="text-center space-y-1">
        <AnswerVerdict state={wasCorrect ? 'correct' : 'incorrect'} />
        <span className="font-medium">{mode.name}</span>
        <span className="text-xs text-neutral-500">{mode.signatureAlteration}</span>
      </div>

      <p className="text-xs text-neutral-500">{mode.quickDefinition}</p>
      <p className="text-sm text-neutral-700 dark:text-neutral-200">{mode.starterDescription}</p>

      <ModeReferenceAnchor modeId={mode.id} />

      <CrossReferenceLink modeId={mode.id} />
    </div>
  );
}

function ModeReferenceAnchor({ modeId }: { modeId: string }) {
  const mode = modeById(modeId);
  if (!mode) return null;
  return (
    <a
      href={`#mode-card-${modeId}`}
      className="inline-flex items-center gap-1 text-xs text-fluent hover:underline"
    >
      see full {mode.name} reference →
    </a>
  );
}

// Contextual links from modes the user might practice elsewhere. Kept
// light — one pointer per mode where the tie-in is natural.
function CrossReferenceLink({ modeId }: { modeId: string }) {
  const crossRefs: Record<string, { label: string; href: string }> = {
    dorian: { label: 'practice the Dorian R&B vamp in Chord Progressions', href: '/ear-training/chord-progressions' },
    lydian: { label: 'hear the Lydian color in the "floating Lydian" progression', href: '/ear-training/chord-progressions' },
    mixolydian: { label: 'the ♭VII backdoor lives in Chord Progressions tier 2', href: '/ear-training/chord-progressions' },
  };
  const ref = crossRefs[modeId];
  if (!ref) return null;
  return (
    <div className="text-[11px] text-neutral-500">
      <Link to={ref.href} className="hover:text-fluent">{ref.label} →</Link>
    </div>
  );
}

// Expose the song link helper from inside this module for consistency
// — some reveal surfaces render song lists directly.
export { songSearchUrl };

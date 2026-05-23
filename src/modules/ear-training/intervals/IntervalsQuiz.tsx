import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { playInterval } from '../../../lib/audio';
import { db, type AttemptRecord, type IntervalData } from '../../../lib/db';
import {
  pickAdaptive,
  ROLLING_WINDOW_SIZE,
  RECENT_HISTORY_SIZE,
  type AdaptiveCandidate,
} from '../../../lib/adaptiveSelection';
import { getPref, setPref } from '../../../lib/userPrefs';
import { daysBetween, localDayKey } from '../../../lib/dailyGoal';
import { TIER_WEIGHT, computeTier } from '../../../lib/tier';
import { updateDailySummary } from '../../../lib/dailySummaries';
import { recordEngagement } from '../../../lib/spacingState';
import { defaultSpeed, speedPrefKey } from '../../../lib/goalConfig';
import ItemSelectionPanel, { type SelectionSection } from '../../../components/ItemSelectionPanel';
import SpeedControl from '../../../components/SpeedControl';
import FluencyProtectionNotice from '../../../components/FluencyProtectionNotice';
import PianoKeyboard, {
  keyCenterX,
  keyboardViewBoxWidth,
} from '../../../components/PianoKeyboard';

const MODULE_ID = 'intervals';
const PREF_FOCUS_SELECTION = 'intervalsFocusSelection';

type DirectionFilter = 'both' | 'asc' | 'desc';
type PlayDirection = 'asc' | 'desc';

interface PoolItem { interval: IntervalData; direction: PlayDirection; }

function pickRootMidi(): number {
  // Keep ascending intervals under MIDI 79 (G5) even for octaves.
  return 55 + Math.floor(Math.random() * 12); // G3..F#4
}

function keyOf(itemId: string, direction: PlayDirection): string {
  return `${itemId}|${direction}`;
}

interface Props {
  intervals: IntervalData[];
  attempts: AttemptRecord[];
}

export default function IntervalsQuiz({ intervals, attempts }: Props) {
  const [filter, setFilter] = useState<DirectionFilter>('both');
  const [current, setCurrent] = useState<{ interval: IntervalData; rootMidi: number; direction: PlayDirection } | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showLifetime, setShowLifetime] = useState(false);
  const [showFocusPanel, setShowFocusPanel] = useState(false);
  const [focusActive, setFocusActive] = useState(false);
  const [focusKeys, setFocusKeys] = useState<string[]>([]);

  const filterRef = useRef(filter);
  filterRef.current = filter;
  const focusActiveRef = useRef(focusActive);
  focusActiveRef.current = focusActive;
  const focusKeysRef = useRef(focusKeys);
  focusKeysRef.current = focusKeys;

  const persistedFocus = useLiveQuery(
    async () => getPref<string[]>(PREF_FOCUS_SELECTION, []),
    [],
  ) ?? [];

  const speedFallback = defaultSpeed(MODULE_ID);
  const speed = useLiveQuery(
    async () => getPref<number>(speedPrefKey(MODULE_ID), speedFallback),
    [],
  ) ?? speedFallback;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const sortedIntervals = useMemo(
    () => [...intervals].sort((a, b) => a.semitones - b.semitones),
    [intervals],
  );

  // Only fluency-tracked attempts feed the rolling window. Small-pool
  // focus sessions log with excludeFromFluency=true so they don't
  // artificially boost tiers for items the user was already cued into.
  const groupedAttempts = useMemo(() => {
    const map = new Map<string, AttemptRecord[]>();
    for (const a of attempts) {
      if (!a.direction) continue;
      if (a.excludeFromFluency) continue;
      const k = keyOf(a.itemId, a.direction);
      const arr = map.get(k);
      if (arr) arr.push(a); else map.set(k, [a]);
    }
    for (const arr of map.values()) arr.sort((x, y) => y.timestamp - x.timestamp);
    return map;
  }, [attempts]);

  const recentHistoryKeys = useMemo(() => {
    const sorted = [...attempts].sort((a, b) => b.timestamp - a.timestamp);
    const slice = sorted.slice(0, RECENT_HISTORY_SIZE);
    return new Set(slice.filter(a => a.direction).map(a => keyOf(a.itemId, a.direction!)));
  }, [attempts]);

  const groupedRef = useRef(groupedAttempts);
  groupedRef.current = groupedAttempts;
  const recentHistoryKeysRef = useRef(recentHistoryKeys);
  recentHistoryKeysRef.current = recentHistoryKeys;
  const intervalsRef = useRef(sortedIntervals);
  intervalsRef.current = sortedIntervals;

  const tierForPair = (ivId: string, dir: PlayDirection, today: string) => {
    const keyed = groupedRef.current.get(keyOf(ivId, dir)) ?? [];
    const recent = keyed.slice(0, ROLLING_WINDOW_SIZE);
    const correctN = recent.filter(a => a.correct).length;
    const total = recent.length;
    const latestTs = keyed[0]?.timestamp;
    const daysSince = latestTs ? daysBetween(localDayKey(new Date(latestTs)), today) : null;
    return computeTier({ windowCorrect: correctN, windowTotal: total, daysSinceLastAttempt: daysSince });
  };

  const buildCandidates = (): AdaptiveCandidate<PoolItem>[] => {
    const today = localDayKey();
    const focusSet = focusActiveRef.current ? new Set(focusKeysRef.current) : null;
    const allDirs: PlayDirection[] = ['asc', 'desc'];
    const candidates: AdaptiveCandidate<PoolItem>[] = [];
    for (const iv of intervalsRef.current) {
      for (const dir of allDirs) {
        const k = keyOf(iv.id, dir);
        if (focusSet) {
          if (!focusSet.has(k)) continue;
        } else {
          if (filterRef.current === 'asc' && dir === 'desc') continue;
          if (filterRef.current === 'desc' && dir === 'asc') continue;
        }
        const tier = tierForPair(iv.id, dir, today);
        candidates.push({
          item: { interval: iv, direction: dir },
          baseWeight: TIER_WEIGHT[tier],
          inRecentHistory: recentHistoryKeysRef.current.has(k),
        });
      }
    }
    return candidates;
  };

  const startNew = async () => {
    if (intervalsRef.current.length === 0) return;
    const candidates = buildCandidates();
    if (candidates.length === 0) return;
    const choice = pickAdaptive(candidates);
    const rootMidi = pickRootMidi();
    setCurrent({ interval: choice.interval, rootMidi, direction: choice.direction });
    setSelectedId(null);
    setAnswered(false);
    setHasPlayed(true);
    await playInterval(rootMidi, choice.interval.semitones, choice.direction === 'asc', speedRef.current);
  };

  const replay = async () => {
    if (!current) return;
    await playInterval(current.rootMidi, current.interval.semitones, current.direction === 'asc', speedRef.current);
  };

  const submitAnswer = async (chosen: IntervalData) => {
    if (!current || answered) return;
    const isCorrect = chosen.id === current.interval.id;
    setSelectedId(chosen.id);
    setAnswered(true);
    const record: AttemptRecord = {
      moduleId: MODULE_ID,
      itemId: current.interval.id,
      direction: current.direction,
      correct: isCorrect,
      timestamp: Date.now(),
      ...(focusProtected ? { excludeFromFluency: true } : {}),
    };
    await db.attempts.add(record);
    await recordEngagement({
      itemRef: `${current.interval.id}:${current.direction}`,
      moduleRef: MODULE_ID,
      signal: { kind: 'attempt', correct: isCorrect },
      timestamp: record.timestamp,
    });
    await updateDailySummary(MODULE_ID);
  };

  const renderButtonClass = (iv: IntervalData) => {
    const base = 'rounded-lg border text-sm font-medium transition px-2 py-3 text-center';
    if (!answered) {
      if (!hasPlayed) {
        return `${base} border-neutral-200 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 text-neutral-400`;
      }
      return `${base} border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-fluent hover:text-fluent`;
    }
    const correctId = current?.interval.id;
    const isCorrect = iv.id === correctId;
    const isSelected = iv.id === selectedId;
    if (isCorrect) {
      return `${base} border-fluent bg-fluent/10 text-fluent`;
    }
    if (isSelected) {
      return `${base} border-needswork bg-needswork/10 text-needswork`;
    }
    return `${base} border-neutral-200 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 text-neutral-400 opacity-60`;
  };

  // Focus sessions with fewer than 4 items don't truly test fluency —
  // the user knows what's coming. We still log the attempt (so daily
  // goal, calendar, and streaks all keep working), but flag it so it
  // doesn't inflate the rolling-window tier calculation.
  const focusProtected = focusActive && focusKeys.length < 4;

  const directionLabel = current?.direction === 'asc' ? 'ascending' : 'descending';
  const activeAnchor = current && (current.direction === 'asc'
    ? (current.interval.ascAnchorCustom ?? current.interval.ascAnchorDefault)
    : (current.interval.descAnchorCustom ?? current.interval.descAnchorDefault));
  const anchorIsCustom = current && Boolean(
    current.direction === 'asc' ? current.interval.ascAnchorCustom : current.interval.descAnchorCustom,
  );
  const wasWrong = answered && current && selectedId !== current.interval.id;
  const wasCorrect = answered && current && selectedId === current.interval.id;

  useEffect(() => {
    if (!showLifetime) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowLifetime(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLifetime]);

  const focusSections: SelectionSection[] = useMemo(() => [
    {
      title: 'Ascending',
      items: sortedIntervals.map(iv => ({ key: keyOf(iv.id, 'asc'), label: iv.id })),
    },
    {
      title: 'Descending',
      items: sortedIntervals.map(iv => ({ key: keyOf(iv.id, 'desc'), label: iv.id })),
    },
  ], [sortedIntervals]);

  const suggestWeakSpots = (): string[] => {
    const today = localDayKey();
    const keys: string[] = [];
    for (const iv of sortedIntervals) {
      for (const dir of ['asc', 'desc'] as const) {
        const tier = tierForPair(iv.id, dir, today);
        if (tier === 'developing' || tier === 'needsWork') {
          keys.push(keyOf(iv.id, dir));
        }
      }
    }
    return keys;
  };

  const onStartFocus = async (keys: string[]) => {
    await setPref(PREF_FOCUS_SELECTION, keys);
    setFocusKeys(keys);
    setFocusActive(true);
    setShowFocusPanel(false);
  };

  const onExitFocus = () => {
    setFocusActive(false);
  };

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">interval quiz</h2>
      </div>

      {/* Focus button + dynamic scope description. Direction tabs sit
          below as a sub-axis; they're hidden while focus mode is active
          because the focus selection already pins direction per item. */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setShowFocusPanel(true)}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ⊞ focus on specific intervals
        </button>
        <p className="text-[11px] text-neutral-500 inline-flex items-center gap-2">
          {focusActive ? (
            <>
              <span>
                focused practice — {focusKeys.length} interval{focusKeys.length === 1 ? '' : 's'} selected
              </span>
              <button
                onClick={onExitFocus}
                className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline"
              >
                exit focus
              </button>
            </>
          ) : filter === 'asc' ? (
            'ascending only — 13 combinations active'
          ) : filter === 'desc' ? (
            'descending only — 13 combinations active'
          ) : (
            'full quiz — all 26 interval combinations active'
          )}
        </p>
        {!focusActive && (
          <div className="inline-flex items-center gap-2 flex-wrap justify-center">
            <span className="text-[11px] text-neutral-500 uppercase tracking-wide">direction:</span>
            <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
              {([
                { id: 'both', label: 'both' },
                { id: 'asc', label: 'ascending' },
                { id: 'desc', label: 'descending' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md transition ${
                    filter === tab.id
                      ? 'bg-fluent text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {focusProtected && (
        <FluencyProtectionNotice />
      )}

      <div className="flex justify-center">
        <SpeedControl moduleId={MODULE_ID} />
      </div>

      {/* Play / Next */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {!hasPlayed ? (
          <button
            onClick={startNew}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            play interval
          </button>
        ) : (
          <button
            onClick={replay}
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            replay {directionLabel}
          </button>
        )}
        {answered && (
          <button
            onClick={startNew}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-sm font-medium hover:opacity-90"
          >
            next interval →
          </button>
        )}
      </div>

      {/* Feedback area */}
      <div className="min-h-[1.5rem]">
        {answered && current ? (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-medium uppercase tracking-wide ${
                  wasCorrect ? 'text-fluent' : 'text-needswork'
                }`}
              >
                {wasCorrect ? 'correct' : 'not quite'}
              </span>
              <span className="text-neutral-400">·</span>
              <span className="text-sm">
                <span className="font-medium">{current.interval.name}</span>
                <span className="text-neutral-400 ml-1.5 font-mono text-xs">{current.interval.id}</span>
                <span className="text-neutral-500 ml-2">({directionLabel})</span>
              </span>
            </div>
            {/* The two notes you heard, on a keyboard: root + the interval
                above it (same keys for both directions — see playInterval).
                A horizontal arrow spans between the two highlighted keys —
                right for ascending, left for descending — its length
                proportional to the interval (derived from the keyboard's own
                key geometry so it stays aligned). */}
            <div className="space-y-1">
              <PianoKeyboard
                rootPc={((current.rootMidi % 12) + 12) % 12}
                voicing={[0, current.interval.semitones]}
                absoluteOffsets
                octaves={3}
                preferFlats={false}
              />
              {current.interval.semitones > 0 &&
                (() => {
                  const OCT = 3;
                  const rootPc = ((current.rootMidi % 12) + 12) % 12;
                  const semis = current.interval.semitones;
                  const xRoot = keyCenterX(0, rootPc, OCT);
                  const xInterval = keyCenterX(semis, rootPc, OCT);
                  const asc = current.direction === 'asc';
                  // Interval note is higher → always right of the root.
                  const xTail = asc ? xRoot : xInterval;
                  const xHead = asc ? xInterval : xRoot;
                  const y = 8;
                  const h = 6; // arrowhead size (viewBox units)
                  const dir = Math.sign(xHead - xTail) || 1;
                  return (
                    <svg
                      viewBox={`0 0 ${keyboardViewBoxWidth(OCT)} 16`}
                      width="100%"
                      preserveAspectRatio="xMidYMid meet"
                      aria-hidden
                      className="text-neutral-400 block"
                    >
                      <line
                        x1={xTail}
                        y1={y}
                        x2={xHead}
                        y2={y}
                        stroke="currentColor"
                        strokeWidth={2.5}
                      />
                      <path
                        d={`M ${xHead} ${y} L ${xHead - dir * h} ${y - h * 0.8} M ${xHead} ${y} L ${xHead - dir * h} ${y + h * 0.8}`}
                        stroke="currentColor"
                        strokeWidth={2.5}
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  );
                })()}
            </div>
            <div className={anchorIsCustom ? 'italic' : ''}>
              <span className="text-neutral-500 text-xs uppercase tracking-wide mr-2">anchor</span>
              {activeAnchor}
              {anchorIsCustom && <span className="ml-2 text-xs text-neutral-500 not-italic">(your reference)</span>}
            </div>
            {wasWrong && (
              <p className="italic text-xs text-neutral-500">
                You'll see this one again soon to reinforce it.
              </p>
            )}
          </div>
        ) : hasPlayed ? (
          <p className="text-xs text-neutral-500 text-center">pick the interval you heard below</p>
        ) : (
          <p className="text-xs text-neutral-500 text-center">press play to start</p>
        )}
      </div>

      {/* Horizontal interval timeline */}
      <div className="overflow-x-auto pb-1">
        <div className="grid grid-cols-[repeat(13,minmax(52px,1fr))] gap-1">
          {sortedIntervals.map(iv => (
            <button
              key={iv.id}
              disabled={!hasPlayed || answered}
              onClick={() => submitAnswer(iv)}
              className={`${renderButtonClass(iv)} ${(!hasPlayed || answered) ? 'cursor-default' : 'cursor-pointer'} disabled:cursor-default`}
              title={iv.name}
            >
              <span className="font-mono">{iv.id}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(13,minmax(52px,1fr))] gap-1 mt-2 border-t border-neutral-200 dark:border-neutral-800 pt-1">
          {sortedIntervals.map((iv, i) => (
            <div key={iv.id} className="flex flex-col items-center">
              <div className="w-px h-2 bg-neutral-300 dark:bg-neutral-700 -mt-1" />
              <div className="text-[10px] font-mono text-neutral-400 mt-0.5">{i}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end text-xs">
        <button
          onClick={() => setShowLifetime(true)}
          className="text-neutral-500 hover:text-fluent"
        >
          view lifetime stats
        </button>
      </div>

      {showLifetime && <LifetimeStatsModal onClose={() => setShowLifetime(false)} />}
      {showFocusPanel && (
        <ItemSelectionPanel
          title="focus on specific intervals"
          description="drill only the intervals and directions you pick. adaptive weighting still applies inside your selection."
          note={focusActive ? (
            <div className="rounded-lg border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
              <span className="font-medium text-fluent">focus mode is active</span> with these selections.
              modify below and click <span className="font-medium">update focus session</span>, or{' '}
              <button
                type="button"
                onClick={() => { setFocusActive(false); setShowFocusPanel(false); }}
                className="text-fluent underline hover:opacity-80"
              >
                exit focus
              </button>
              {' '}to return to the full quiz.
            </div>
          ) : (
            <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/60 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
              your last selection is shown below. you're currently in the full quiz — click{' '}
              <span className="font-medium">start focus session</span> to narrow the quiz to the selected intervals.
            </div>
          )}
          sections={focusSections}
          initialSelection={persistedFocus}
          onStart={onStartFocus}
          onCancel={() => setShowFocusPanel(false)}
          startLabel={focusActive ? 'update focus session' : 'start focus session'}
          suggestWeakSpots={suggestWeakSpots}
        />
      )}
    </section>
  );
}

function LifetimeStatsModal({ onClose }: { onClose: () => void }) {
  const all = useLiveQuery(() => db.attempts.toArray(), []) ?? [];
  const total = all.length;
  const correct = all.filter(a => a.correct).length;
  const wrong = total - correct;
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
  const first = total === 0 ? null : new Date(Math.min(...all.map(a => a.timestamp)));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-card border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-medium">lifetime stats</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100" aria-label="close">×</button>
        </div>
        <dl className="text-sm space-y-1.5">
          <div className="flex justify-between"><dt className="text-neutral-500">total correct</dt><dd className="font-mono">{correct}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500">total wrong</dt><dd className="font-mono">{wrong}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500">overall accuracy</dt><dd className="font-mono">{total === 0 ? '—' : `${accuracy}%`}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500">first session</dt><dd className="font-mono">{first ? first.toLocaleDateString() : '—'}</dd></div>
        </dl>
      </div>
    </div>
  );
}

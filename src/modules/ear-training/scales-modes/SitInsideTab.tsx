import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { type AttemptRecord, type ChordMovement } from '../../../lib/db';
import { addAttempt } from '../../../lib/practiceWrites';
import SessionCardCount from '../../../components/SessionCardCount';
import { answerTimingFields, type AskedContext } from '../../../lib/attemptTiming';
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
import AidsFold from '../../../components/AidsFold';
import FluencyProtectionNotice from '../../../components/FluencyProtectionNotice';
import { FLUENCY_POOL_MINIMUM } from '../../../lib/fluencyPool';
import AnswerVerdict from '../../../components/AnswerVerdict';
import { MODES, modeById, pickDecoys, type Mode } from './catalog';
import type { PlaybackHandle } from '../../../lib/musicalPlayback';
import { panelBeats, playPanel } from '../../../lib/builtAnswers/play';
import { usePlayerSettings } from '../../../lib/player/usePlayerSettings';
import type { PlayerChord } from '../../../lib/player/voices';
import { listMovements } from '../../shapes-and-patterns/movements/movementStore';
import { movementChords } from '../../shapes-and-patterns/movements/movementChords';
import { movementTagValue } from '../../shapes-and-patterns/movements/movementTag';
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
import { spellNote } from '../../../lib/spelling';
import { useSpelling } from '../../../lib/spellingPref';

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

/**
 * The key name for a round's root, as a movement stores keys.
 *
 * `ROOT_NOTES` is this tab's own vocabulary and its labels are exactly
 * the catalog's key names, so the two line up without a second table.
 * Falls back to C, which is what a movement with no key would take.
 */
function keyNameOf(midi: number): string {
  return ROOT_NOTES.find(r => r.midi === midi)?.label ?? 'C';
}

/** One of a list, at random. Module level, like `shuffle` below. */
function pickOne<T>(list: ReadonlyArray<T>): T | undefined {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SitInsideTab({ attempts, pool, focusActive }: Props) {
  const [spelling] = useSpelling();
  // Focus sessions with fewer than 4 items don't truly test fluency —
  // the user knows what's coming. Attempts still log (calendar, daily
  // goal, streaks unaffected) but the rolling-window tier math ignores
  // them.
  const [settings, setSettings] = usePlayerSettings();
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  /** The movement this round is playing, and its chords. */
  const [activeMovement, setActiveMovement] = useState<ChordMovement | null>(null);
  const [activeChords, setActiveChords] = useState<PlayerChord[]>([]);
  /**
   * What this tab has to play, which since 10 Sep 2026 is only what
   * Silas has recorded.
   *
   * =====================================================================
   * THE BUILT-IN VAMPS RETIRED AND THE MOVEMENTS TOOK THEIR PLACE.
   *
   * A mode plays a movement he has recorded and tagged with that mode,
   * and nothing else. Until a mode has one it plays nothing and says so
   * — an empty drill is the honest state, and a loop the app wrote is
   * not the sound he is trying to learn to recognise.
   * =====================================================================
   */
  const movements = useLiveQuery(() => listMovements(), []);
  const taggedByMode = useMemo(() => {
    const out = new Map<string, ChordMovement[]>();
    for (const mode of MODES) {
      const want = movementTagValue({ kind: 'mode', id: mode.id });
      const mine = (movements ?? []).filter(m => m.tag === want);
      if (mine.length > 0) out.set(mode.id, mine);
    }
    return out;
  }, [movements]);
  /** The modes this tab can actually serve. */
  const playable = useMemo(
    () => pool.filter(m => taggedByMode.has(m.id)),
    [pool, taggedByMode],
  );
  const focusProtected = focusActive && playable.length < FLUENCY_POOL_MINIMUM;
  const [runState, setRunState] = useState<RunState>('idle');
  const [active, setActive] = useState<Mode | null>(null);
  /** What was in force when this round was presented. */
  const asked = useRef<AskedContext | null>(null);
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

  const playbackRef = useRef<PlaybackHandle | null>(null);
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
    return playable.map(mode => {
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
    if (playable.length === 0) return;
    const candidates = buildCandidates();
    if (candidates.length === 0) return;
    const mode = pickAdaptive(candidates);
    const newRoot = rootLock === 'random' ? randomRootMidi() : rootLock;
    const decoyPool = playable.length >= 4 ? playable : MODES;
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
    // ONE OF THE MOVEMENTS TAGGED WITH THIS MODE. More than one is the
    // point — a mode Silas has recorded three times has three things to
    // sit inside, and always playing the oldest would waste two.
    const mine = taggedByMode.get(mode.id) ?? [];
    const movement = pickOne(mine);
    setActiveMovement(movement ?? null);
    const chords = movement === undefined
      ? []
      // THE ROUND'S ROOT IS THE KEY IT IS PLAYED IN. A movement stores
      // its chords as degrees, so handing it a different key transposes
      // the whole thing — the mechanism `movementPlayback` describes.
      : movementChords(movement, { spelling, key: keyNameOf(newRoot) });
    setActiveChords(chords);
    if (chords.length === 0) { setRunState('answering'); return; }
    playbackRef.current = await playPanel(chords, settingsRef.current, {
      loop: roundLoop === 99 ? 'untilStopped' : roundLoop,
    });
    // A LOOPING PASSAGE HAS NO END, so the clock starts when the FIRST
    // pass finishes — the point at which the reader has heard the whole
    // shape once and could answer. Set to loop for ever (99) it is the
    // same question with more repetitions available, not a different
    // one, so it is measured from the same place rather than going
    // unmeasured.
    const onePass = panelBeats(chords) * (60 / settingsRef.current.bpm) * 1000;
    asked.current = {
      playbackEndsAt: Date.now() + onePass,
      playbackBpm: settingsRef.current.bpm,
      drillTab: 'vamp',
    };
    if (roundLoop !== 99) {
      endTimerRef.current = window.setTimeout(() => {
        playbackRef.current = null;
        endTimerRef.current = null;
        setRunState(prev => prev === 'playing' ? 'answering' : prev);
      }, onePass * roundLoop + 300);
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
    if (activeChords.length === 0) return;
    playbackRef.current = await playPanel(activeChords, settingsRef.current, {
      loop: effectiveLoop === 99 ? 'untilStopped' : effectiveLoop,
    });
    if (effectiveLoop !== 99) {
      const onePass = panelBeats(activeChords) * (60 / settingsRef.current.bpm) * 1000;
      endTimerRef.current = window.setTimeout(() => {
        playbackRef.current = null;
        endTimerRef.current = null;
      }, onePass * effectiveLoop + 300);
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
    await addAttempt({
      moduleId: MODULE_ID,
      itemId: itemRef,
      correct,
      timestamp,
      ...(focusProtected ? { excludeFromFluency: true } : {}),
      ...answerTimingFields(asked.current, timestamp),
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
  const rootLabel = midiToLabel(rootMidi, spelling);
  const showRootHint = runState !== 'idle';

  return (
    <div data-testid="scales-tab-vamp" className="space-y-4">
      <SessionCardCount moduleId={MODULE_ID} />
      {focusProtected && <FluencyProtectionNotice />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Root Note</span>
          <select
            value={rootLock === 'random' ? 'random' : String(rootLock)}
            onChange={e => {
              const v = e.target.value;
              setRootLock(v === 'random' ? 'random' : Number(v));
            }}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
            <option value="random">Random Each Round</option>
            {ROOT_NOTES.map(n => (
              // The VALUE is the midi number — the identity — and the text
              // is the spelling. Unlike the key pickers, this one could
              // never store a name even by accident.
              <option key={n.midi} value={n.midi}>{spellNote(n.midi % 12, spelling)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Loop Count</span>
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
            <option value="99">Until Stopped</option>
          </select>
        </label>
      </div>

      {/* THE SPEED CONTROL WAS HERE. Tempo is beats per minute on every
          surface now, and it lives in the aids fold with the octave and
          Listen to — the same four rows every quiz offers. */}
      <AidsFold settings={settings} onSettings={setSettings} showListen={false} />

      {/* NOTHING RECORDED YET is the honest empty state, and on the day
          the vamps retired it is what every mode says. A mode plays what
          Silas has recorded and tagged with it; the app has nothing of
          its own to put there. */}
      {playable.length === 0 && (
        <p
          data-testid="no-movements"
          className="rounded-lg border border-dashed border-black/10 dark:border-white/15 px-3 py-3 text-xs text-neutral-500 dark:text-neutral-400"
        >
          Nothing recorded for this mode yet. Record a movement you know from a
          song in Chord Movements &amp; Passes and tag it with the mode, and it
          will play here.
        </p>
      )}

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
            play vamp
          </button>
        )}
        {runState === 'playing' && (
          <button
            onClick={handleStop}
            className="px-4 py-2 rounded-lg border border-needswork text-needswork text-sm font-medium hover:bg-needswork/10"
          >
            Stop and Answer
          </button>
        )}
        {(runState === 'answering' || runState === 'reveal') && (
          <button
            onClick={handleReplay}
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            Replay Vamp
          </button>
        )}
        {runState === 'reveal' && (
          <button
            onClick={handleNext}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-sm font-medium hover:opacity-90"
          >
            Next →
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
        <VampReveal
          mode={active}
          wasCorrect={!!wasCorrect}
          movement={activeMovement}
        />
      )}
    </div>
  );
}

function VampReveal({ mode, wasCorrect, movement }: {
  mode: Mode; wasCorrect: boolean; movement: ChordMovement | null;
}) {
  const topSongs = mode.songExamples.slice(0, 3);
  return (
    <div className="rounded-lg border border-black/[0.07] p-4 space-y-3 text-sm">
      <div className="text-center space-y-1">
        <AnswerVerdict state={wasCorrect ? 'correct' : 'incorrect'} />
        <span className="font-medium">{mode.name}</span>
        <span className="text-xs text-neutral-500">{mode.signatureAlteration}</span>
      </div>

      <p className="text-xs text-neutral-500">{mode.quickDefinition}</p>
      <p className="text-sm text-neutral-700 dark:text-neutral-200">{mode.starterDescription}</p>

      {/* WHAT YOU JUST HEARD IS SILAS'S OWN, so the reveal names it
          rather than describing a loop the app wrote. */}
      {movement !== null && (
        <div className="rounded-md bg-neutral-100/70 dark:bg-neutral-800/60 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 mr-1.5">
            you recorded
          </span>
          {movement.name === '' ? 'an untitled movement' : movement.name}
          {movement.description === '' ? null : ` — ${movement.description}`}
        </div>
      )}

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
                   className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] hover:border-fluent hover:text-fluent">Spotify</a>
                <a href={songSearchUrl('youtube', s.title, s.artist)} target="_blank" rel="noopener noreferrer"
                   className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] hover:border-fluent hover:text-fluent">YouTube</a>
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

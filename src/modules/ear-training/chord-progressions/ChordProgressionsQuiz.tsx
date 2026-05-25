import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  defaultSpeed,
  focusSelectionKey,
  speedPrefKey,
} from '../../../lib/goalConfig';
import SpeedControl from '../../../components/SpeedControl';
import FluencyProtectionNotice from '../../../components/FluencyProtectionNotice';
import AnswerVerdict from '../../../components/AnswerVerdict';
import ItemSelectionPanel, {
  type FilterConfig,
  type FilterOption,
  type SelectionSection,
} from '../../../components/ItemSelectionPanel';
import {
  MUST_KNOW_IDS,
  PROGRESSIONS,
  TIER_NAMES,
  progressionById,
  type Progression,
} from './catalog';
import AssociationsEditor from './AssociationsEditor';
import ModeLinkify from '../scales-modes/ModeLinkify';
import {
  KEYS,
  chordDisplay,
  containsSlashChords,
  keyToRootMidi,
  numeralOffset,
  parseSlashChord,
  playProgression,
  splitAnswer,
  tonicLeadInSeconds,
  voicingFor,
  type Complexity,
  type ListeningMode,
  type PlaybackHandle,
  type ProgressionStep,
  type TonicContext,
} from './progressionTheory';

const MODULE_ID = 'chord-progressions';
const PREF_FOCUS = focusSelectionKey(MODULE_ID);
const PREF_KEY = 'chordProgressionsKey';
const PREF_TIER = 'chordProgressionsTier';
const PREF_COMPLEXITY = 'chordProgressionsComplexity';
const PREF_LISTENING = 'chordProgressionsListeningMode';
const PREF_TEMPO = 'chordProgressionsTempo';
const PREF_TONIC = 'chordProgressionsTonicContext';
const DEFAULT_TEMPO = 60;

const NUMERAL_POOL = [
  'I', 'i', 'bII', 'II', 'ii', 'bIII', 'III', 'iii', 'IV', 'iv',
  'V', 'v', 'bVI', 'VI', 'vi', 'bVII', 'VII', 'vii°', 'viiø',
];

// Labels pair the tier number with its data-driven name so users don't
// have to memorize the tier structure. `title` is retained for tooltip
// parity with the previous numeric-only labels.
const TIER_TABS: Array<{ id: 'all' | number; label: string; title?: string }> = [
  { id: 'all', label: 'all progressions' },
  { id: 1, label: `Tier 1: ${TIER_NAMES[1]}`, title: TIER_NAMES[1] },
  { id: 2, label: `Tier 2: ${TIER_NAMES[2]}`, title: TIER_NAMES[2] },
  { id: 3, label: `Tier 3: ${TIER_NAMES[3]}`, title: TIER_NAMES[3] },
  { id: 4, label: `Tier 4: ${TIER_NAMES[4]}`, title: TIER_NAMES[4] },
  { id: 5, label: `Tier 5: ${TIER_NAMES[5]}`, title: TIER_NAMES[5] },
  { id: 6, label: `Tier 6: ${TIER_NAMES[6]}`, title: TIER_NAMES[6] },
  { id: 7, label: `Tier 7: ${TIER_NAMES[7]}`, title: TIER_NAMES[7] },
  { id: 8, label: `Tier 8: ${TIER_NAMES[8]}`, title: TIER_NAMES[8] },
];

type RunState = 'idle' | 'playing' | 'identifying' | 'pattern' | 'reveal';
type TierFilter = 'all' | number;
type LoopCount = 1 | 2 | 3 | 4 | 99;

interface Props {
  attempts: AttemptRecord[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function songSearchUrl(service: 'spotify' | 'youtube', title: string, artist: string): string {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  return service === 'spotify'
    ? `https://open.spotify.com/search/${q}`
    : `https://www.youtube.com/results?search_query=${q}`;
}

export default function ChordProgressionsQuiz({ attempts }: Props) {
  // --- Persisted config ------------------------------------------------
  const [key, setKeyState] = useState<string>('C');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [complexity, setComplexity] = useState<Complexity>('seventh');
  const [listening, setListening] = useState<ListeningMode>('bass-chords');
  const [bpm, setBpm] = useState<number>(DEFAULT_TEMPO);
  const [tonicContext, setTonicContext] = useState<TonicContext>('singleNote');

  // Prefs hydration — load once, then writes go through setters below.
  useEffect(() => {
    (async () => {
      const k = await getPref<string>(PREF_KEY, 'C');
      const t = await getPref<TierFilter>(PREF_TIER, 'all');
      const c = await getPref<Complexity>(PREF_COMPLEXITY, 'seventh');
      const l = await getPref<ListeningMode>(PREF_LISTENING, 'bass-chords');
      const b = await getPref<number>(PREF_TEMPO, DEFAULT_TEMPO);
      const tc = await getPref<TonicContext>(PREF_TONIC, 'singleNote');
      setKeyState(k); setTierFilter(t); setComplexity(c); setListening(l); setBpm(b);
      setTonicContext(tc);
    })();
  }, []);
  useEffect(() => { setPref(PREF_KEY, key); }, [key]);
  useEffect(() => { setPref(PREF_TIER, tierFilter); }, [tierFilter]);
  useEffect(() => { setPref(PREF_COMPLEXITY, complexity); }, [complexity]);
  useEffect(() => { setPref(PREF_LISTENING, listening); }, [listening]);
  useEffect(() => { setPref(PREF_TEMPO, bpm); }, [bpm]);
  useEffect(() => { setPref(PREF_TONIC, tonicContext); }, [tonicContext]);

  const speedFallback = defaultSpeed(MODULE_ID);
  const speed = useLiveQuery(
    async () => getPref<number>(speedPrefKey(MODULE_ID), speedFallback),
    [],
  ) ?? speedFallback;
  const speedRef = useRef(speed); speedRef.current = speed;

  // --- Ephemeral session state ----------------------------------------
  const [loopOn, setLoopOn] = useState(false);
  const [loopCount, setLoopCount] = useState<LoopCount>(1);
  const [runState, setRunState] = useState<RunState>('idle');
  const [active, setActive] = useState<Progression | null>(null);
  // Settings captured at round start. Replay, feedback rendering, and
  // the transition timer all read from here instead of the live pill /
  // select state, so toggling key / complexity / listening / bpm /
  // tonicContext mid-round (or during feedback) applies forward via
  // "next progression" and never retroactively to the current one.
  const [activeConfig, setActiveConfig] = useState<{
    key: string;
    complexity: Complexity;
    listening: ListeningMode;
    bpm: number;
    tonicContext: TonicContext;
    loopOn: boolean;
    loopCount: LoopCount;
  } | null>(null);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [currentSlot, setCurrentSlot] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);
  const [patternOptions, setPatternOptions] = useState<Progression[]>([]);
  const [patternAnswered, setPatternAnswered] = useState<string | null>(null);
  const [patternCorrect, setPatternCorrect] = useState<boolean | null>(null);
  const [replayedInReveal, setReplayedInReveal] = useState(false);

  const [showFocusPanel, setShowFocusPanel] = useState(false);
  const [focusActive, setFocusActive] = useState(false);
  const [focusKeys, setFocusKeys] = useState<string[]>([]);

  const persistedFocus = useLiveQuery(
    async () => getPref<string[]>(PREF_FOCUS, []),
    [],
  ) ?? [];

  const playbackRef = useRef<PlaybackHandle | null>(null);
  const endTimerRef = useRef<number | null>(null);

  // --- Derived: grouped attempts + history ----------------------------
  const groupedAttempts = useMemo(() => {
    const m = new Map<string, AttemptRecord[]>();
    for (const a of attempts) {
      if (a.moduleId !== MODULE_ID) continue;
      // Chord-level attempts use raw progression id. Pattern attempts use
      // `${id}-pattern` as itemId. Both contribute to separate rolling
      // windows — for adaptive selection, use the chord-level set only.
      if (a.itemId.endsWith('-pattern')) continue;
      // Small-pool focus sessions log attempts but are excluded from the
      // rolling-window tier math to avoid cueing-driven inflation.
      if (a.excludeFromFluency) continue;
      const arr = m.get(a.itemId);
      if (arr) arr.push(a); else m.set(a.itemId, [a]);
    }
    for (const arr of m.values()) arr.sort((x, y) => y.timestamp - x.timestamp);
    return m;
  }, [attempts]);

  const recentHistoryKeys = useMemo(() => {
    const sorted = attempts
      .filter(a => a.moduleId === MODULE_ID && !a.itemId.endsWith('-pattern'))
      .sort((a, b) => b.timestamp - a.timestamp);
    return new Set(sorted.slice(0, RECENT_HISTORY_SIZE).map(a => a.itemId));
  }, [attempts]);

  // --- Candidate pool + adaptive selection ----------------------------
  const pool = useMemo(() => {
    if (focusActive) {
      const set = new Set(focusKeys);
      return PROGRESSIONS.filter(p => set.has(p.id));
    }
    if (tierFilter === 'all') return PROGRESSIONS;
    return PROGRESSIONS.filter(p => p.tier === tierFilter);
  }, [focusActive, focusKeys, tierFilter]);

  // Focus sessions with fewer than 4 items don't truly test fluency —
  // the user knows what's coming. Attempts still log so the calendar
  // and daily goal keep working, but the rolling-window tier math
  // ignores them.
  const focusProtected = focusActive && focusKeys.length < 4;

  const tierForProg = (id: string): ReturnType<typeof computeTier> => {
    const keyed = groupedAttempts.get(id) ?? [];
    const recent = keyed.slice(0, ROLLING_WINDOW_SIZE);
    const correctN = recent.filter(a => a.correct).length;
    const total = recent.length;
    const latestTs = keyed[0]?.timestamp;
    const daysSince = latestTs ? daysBetween(localDayKey(new Date(latestTs)), today()) : null;
    return computeTier({ windowCorrect: correctN, windowTotal: total, daysSinceLastAttempt: daysSince });
  };

  const buildCandidates = (): AdaptiveCandidate<Progression>[] => {
    return pool.map(p => ({
      item: p,
      baseWeight: TIER_WEIGHT[tierForProg(p.id)],
      inRecentHistory: recentHistoryKeys.has(p.id),
    }));
  };

  // --- Actions ---------------------------------------------------------
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
    const prog = pickAdaptive(candidates);
    // Capture every setting the round depends on into a snapshot the
    // rest of the lifecycle reads from. Live pill / select changes
    // reach the *next* round via startRound(), never the current one.
    const cfg = {
      key,
      complexity,
      listening,
      bpm,
      tonicContext,
      loopOn: prog.loopDefault,
      loopCount,
    };
    setActive(prog);
    setActiveConfig(cfg);
    setAnswers(new Array(prog.numerals.length).fill(null));
    setCurrentSlot(0);
    setSubmitted(false);
    setPatternAnswered(null);
    setPatternCorrect(null);
    setReplayedInReveal(false);
    setLoopOn(prog.loopDefault);

    const count = cfg.loopOn ? cfg.loopCount : 1;
    await playWith(prog, count, cfg);
    setRunState('playing');
  };

  const playWith = async (
    prog: Progression,
    count: number,
    cfg: NonNullable<typeof activeConfig>,
  ) => {
    const rootMidi = keyToRootMidi(cfg.key);
    const steps: ProgressionStep[] = prog.numerals.map((numeral, i) => {
      const parsed = parseSlashChord(numeral);
      const chordRootMidi = rootMidi + numeralOffset(parsed.chord);
      const isSlash = parsed.bassOffset !== undefined;
      const bassMidi = isSlash
        ? (rootMidi + parsed.bassOffset!) - 12
        : chordRootMidi - 12;
      return {
        rootMidi: chordRootMidi,
        bassMidi,
        isSlash,
        quality: prog.chordQualities[i] ?? 'major',
        beats: prog.durationPattern[i] ?? 1,
      };
    });
    const handle = await playProgression(
      steps, cfg.bpm, cfg.complexity, cfg.listening, speedRef.current, count,
      cfg.tonicContext, rootMidi, prog.requiresDominant ?? false,
    );
    playbackRef.current = handle;
    // Schedule transition to identifying after total duration.
    const totalBeats = prog.durationPattern.reduce((s, b) => s + b, 0) * count;
    const leadInSecs = tonicLeadInSeconds(cfg.tonicContext);
    const totalMs = ((totalBeats * 60 / (cfg.bpm * Math.max(0.1, speedRef.current))) + leadInSecs) * 1000 + 300;
    endTimerRef.current = window.setTimeout(() => {
      playbackRef.current = null;
      endTimerRef.current = null;
      setRunState(prev => prev === 'playing' ? 'identifying' : prev);
    }, totalMs);
  };

  const handlePlayClick = async () => {
    if (runState === 'idle' || runState === 'reveal') {
      await startRound();
    } else if (runState === 'playing') {
      // Stop
      stopPlayback();
      setRunState('identifying');
    }
  };

  const handleReplay = async () => {
    if (!active || !activeConfig) return;
    stopPlayback();
    // Replay uses the round's captured config, not whatever the pills
    // currently say. Mid-round changes to key / complexity / listening
    // / tempo / tonic context never alter what the user just heard.
    const count = activeConfig.loopOn ? activeConfig.loopCount : 1;
    await playWith(active, count, activeConfig);
    // Audio plays in the background; leave runState alone so the user's
    // current UI (slot strip, pattern options, reveal card) stays visible.
    if (runState === 'reveal') setReplayedInReveal(true);
  };

  const handleNext = () => {
    stopPlayback();
    setRunState('idle');
  };

  const handleNumeralTap = (numeral: string) => {
    if (runState !== 'identifying' || !active || submitted) return;
    const next = [...answers];
    next[currentSlot] = numeral;
    setAnswers(next);
    // Auto-advance focus to the next empty slot (wrap around). If every
    // slot is filled, keep focus on the last slot so the user can tweak.
    const total = next.length;
    let target = -1;
    for (let k = 1; k <= total; k++) {
      const idx = (currentSlot + k) % total;
      if (next[idx] === null) { target = idx; break; }
    }
    setCurrentSlot(target === -1 ? total - 1 : target);
  };

  const handleSlotTap = (i: number) => {
    if (runState !== 'identifying' || submitted) return;
    setCurrentSlot(i);
  };

  const handleClearAll = () => {
    if (!active || submitted) return;
    setAnswers(new Array(active.numerals.length).fill(null));
    setCurrentSlot(0);
  };

  // Apply / clear a slash inversion on the focused slot. Empty token
  // strips the slash entirely (root position).
  const applyInversion = (token: string) => {
    if (runState !== 'identifying' || submitted) return;
    const current = answers[currentSlot];
    if (current === null) return;
    const base = current.split('/')[0];
    const next = [...answers];
    next[currentSlot] = token ? `${base}/${token}` : base;
    setAnswers(next);
  };

  const handleSubmitAll = async () => {
    if (!active || submitted) return;
    if (!answers.every(a => a !== null)) return;
    // Grade per-slot and split by chord-correctness vs inversion-
    // correctness. One attempt per chord slot always goes to the main
    // itemId; slash progressions also log a parallel inversion stream so
    // the tracker can show "chord X% / inversion Y%".
    const now = Date.now();
    const hasSlash = containsSlashChords(active.numerals);
    const records: AttemptRecord[] = [];
    const fluencyFlag = focusProtected ? { excludeFromFluency: true } : {};
    answers.forEach((ans, i) => {
      const user = splitAnswer(ans!);
      const correct = splitAnswer(active!.numerals[i]);
      records.push({
        moduleId: MODULE_ID,
        itemId: active!.id,
        correct: user.chord === correct.chord,
        timestamp: now + i,
        ...fluencyFlag,
      });
      if (hasSlash) {
        records.push({
          moduleId: MODULE_ID,
          itemId: `${active!.id}-inversion`,
          correct: user.slash === correct.slash,
          timestamp: now + i,
          ...fluencyFlag,
        });
      }
    });
    await db.attempts.bulkAdd(records);
    // One spacingState engagement per chord position. The -inversion
    // sub-records are sub-skill grades, not catalog items, so they
    // don't get spacingState rows (see Phase 2 1c report). Calls are
    // serial: recordEngagement reads-then-writes, so concurrent calls
    // on the same row would race.
    for (let i = 0; i < answers.length; i++) {
      const user = splitAnswer(answers[i]!);
      const correctSplit = splitAnswer(active!.numerals[i]);
      await recordEngagement({
        itemRef: active!.id,
        moduleRef: MODULE_ID,
        signal: { kind: 'attempt', correct: user.chord === correctSplit.chord },
        timestamp: now + i,
      });
    }
    await updateDailySummary(MODULE_ID);
    setSubmitted(true);

    // Set up pattern recognition bonus round
    const decoys = shuffle(
      PROGRESSIONS.filter(p =>
        p.id !== active.id && Math.abs(p.tier - active.tier) <= 1,
      ),
    ).slice(0, 4);
    setPatternOptions(shuffle([active, ...decoys]));
    setRunState('pattern');
  };

  const handlePatternChoice = async (choiceId: string | null) => {
    if (!active) return;
    if (choiceId !== null) {
      const isCorrect = choiceId === active.id;
      setPatternAnswered(choiceId);
      setPatternCorrect(isCorrect);
      const timestamp = Date.now();
      await db.attempts.add({
        moduleId: MODULE_ID,
        itemId: `${active.id}-pattern`,
        correct: isCorrect,
        timestamp,
        ...(focusProtected ? { excludeFromFluency: true } : {}),
      });
      // Pattern recognition is a different angle on the same catalog
      // item — credit the engagement against the progression itself
      // (not the `-pattern` sub-id, which stays as a sub-skill attempt
      // record only).
      await recordEngagement({
        itemRef: active.id,
        moduleRef: MODULE_ID,
        signal: { kind: 'attempt', correct: isCorrect },
        timestamp,
      });
    }
    setReplayedInReveal(false);
    setRunState('reveal');
  };

  const onStartFocus = async (keys: string[]) => {
    await setPref(PREF_FOCUS, keys);
    setFocusKeys(keys);
    setFocusActive(true);
    setShowFocusPanel(false);
  };

  useEffect(() => () => { stopPlayback(); }, []);

  // --- Rendering -------------------------------------------------------
  const isLoopable = !!active && active.loopDefault;
  const numeralChoices = useMemo(() => {
    const set = new Set<string>(NUMERAL_POOL);
    if (active) for (const n of active.numerals) set.add(n);
    return [...set].sort((a, b) => numeralOffset(a) - numeralOffset(b) || a.localeCompare(b));
  }, [active]);

  // Feedback-card chord sequence. Reads the round's snapshot so the
  // displayed transposition + voicing always match what the user heard,
  // even if they've since changed the key or complexity pills in
  // preparation for the next round.
  const chordSequenceDisplay = useMemo(() => {
    if (!active || !activeConfig) return '';
    const rootMidi = keyToRootMidi(activeConfig.key);
    const requiresDominant = active.requiresDominant ?? false;
    return active.numerals.map((n, i) => {
      const parsed = parseSlashChord(n);
      const chordRoot = rootMidi + numeralOffset(parsed.chord);
      const slashBassMidi = parsed.bassOffset !== undefined
        ? rootMidi + parsed.bassOffset
        : undefined;
      return chordDisplay(
        chordRoot,
        active.chordQualities[i] ?? 'major',
        activeConfig.complexity,
        { requiresDominant, slashBassMidi },
      );
    }).join(' → ');
  }, [active, activeConfig]);

  const activeHasSlash = active ? containsSlashChords(active.numerals) : false;

  // Split score: base-chord accuracy + inversion accuracy.
  const chordCorrectCount = active
    ? answers.filter((a, i) => {
        if (a === null) return false;
        return splitAnswer(a).chord === splitAnswer(active.numerals[i]).chord;
      }).length
    : 0;
  const inversionCorrectCount = active && activeHasSlash
    ? answers.filter((a, i) => {
        if (a === null) return false;
        return splitAnswer(a).slash === splitAnswer(active.numerals[i]).slash;
      }).length
    : 0;
  const totalSlots = active?.numerals.length ?? 0;

  // Focus panel sections (grouped by tier)
  const focusSections: SelectionSection[] = useMemo(() => (
    Object.keys(TIER_NAMES)
      .map(n => Number(n))
      .sort((a, b) => a - b)
      .map(tier => ({
        title: `Tier ${tier} — ${TIER_NAMES[tier]}`,
        items: PROGRESSIONS.filter(p => p.tier === tier)
          .map(p => ({ key: p.id, label: p.name })),
      }))
  ), []);

  const tierFilterOptions: FilterOption[] = useMemo(() => (
    Object.keys(TIER_NAMES).map(n => Number(n)).sort((a, b) => a - b).map(tier => ({
      key: String(tier),
      label: `${tier} · ${TIER_NAMES[tier]}`,
    }))
  ), []);

  const focusFilter: FilterConfig = useMemo(() => ({
    label: 'filter by tier:',
    options: tierFilterOptions,
    isVisible: (progId, activeTiers) => {
      const prog = progressionById(progId);
      return prog ? activeTiers.has(String(prog.tier)) : false;
    },
  }), [tierFilterOptions]);

  const suggestWeakSpots = (): string[] => {
    const keys: string[] = [];
    for (const p of PROGRESSIONS) {
      const t = tierForProg(p.id);
      if (t === 'developing' || t === 'needsWork' || t === 'untouched') {
        keys.push(p.id);
      }
    }
    return keys;
  };

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">chord progressions quiz</h2>
      </div>

      {/* Scope tabs (all-first) + focus button + dynamic status line. */}
      <div className="flex flex-col items-center gap-2">
        {!focusActive && (
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs flex-wrap justify-center">
            {TIER_TABS.map(tab => (
              <button
                key={String(tab.id)}
                onClick={() => setTierFilter(tab.id)}
                title={tab.title}
                className={`px-2.5 py-1.5 rounded-md transition ${
                  tierFilter === tab.id
                    ? 'bg-fluent text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowFocusPanel(true)}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ⊞ focus on specific progressions
        </button>
        <p className="text-[11px] text-neutral-500 inline-flex items-center gap-2">
          <span>
            {focusActive
              ? `focused practice — ${focusKeys.length} progression${focusKeys.length === 1 ? '' : 's'} selected`
              : tierFilter === 'all'
                ? `all progressions — ${pool.length} in pool`
                : `Tier ${tierFilter}: ${TIER_NAMES[tierFilter as number]} — ${pool.length} in pool`}
          </span>
          {focusActive && (
            <button
              onClick={() => setFocusActive(false)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline"
            >
              exit focus
            </button>
          )}
        </p>
      </div>

      {focusProtected && <FluencyProtectionNotice />}

      {/* Config grid: key + complexity + listening + loop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">key</span>
          <select
            value={key}
            onChange={e => setKeyState(e.target.value)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
            {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">chord complexity</span>
          <select
            value={complexity}
            onChange={e => setComplexity(e.target.value as Complexity)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
            <option value="triad">triads</option>
            <option value="seventh">seventh chords</option>
            <option value="jazz">jazz voicings</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">listening mode</span>
          <select
            value={listening}
            onChange={e => setListening(e.target.value as ListeningMode)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
            <option value="bass-chords">bass + chords</option>
            <option value="chords">chords only</option>
            <option value="bass">bass only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">tempo · {bpm} bpm</span>
          <input
            type="range"
            min={40}
            max={120}
            step={4}
            value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            className="accent-fluent h-2 cursor-pointer"
            aria-label="tempo"
          />
        </label>
      </div>

      {/* Loop controls + speed */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={loopOn}
              onChange={e => setLoopOn(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-fluent focus:ring-fluent"
            />
            <span>loop</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <span className="text-neutral-500">plays</span>
            <select
              value={loopCount}
              disabled={!loopOn}
              onChange={e => setLoopCount(Number(e.target.value) as LoopCount)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-0.5 disabled:opacity-40"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={99}>until stopped</option>
            </select>
          </label>
          {active && isLoopable && (
            <span className="text-[10px] text-neutral-400">(default for this progression)</span>
          )}
          <label className="inline-flex items-center gap-1.5">
            <span className="text-neutral-500">tonic</span>
            <select
              value={tonicContext}
              onChange={e => setTonicContext(e.target.value as TonicContext)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-0.5"
              title="reference note played before the progression"
            >
              <option value="singleNote">single note</option>
              <option value="none">none</option>
            </select>
          </label>
        </div>
        <div className="sm:ml-auto">
          <SpeedControl moduleId={MODULE_ID} />
        </div>
      </div>

      {/* Play / Stop / Replay / Next */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {runState === 'idle' && (
          <button
            onClick={handlePlayClick}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            play progression
          </button>
        )}
        {runState === 'playing' && (
          <button
            onClick={handlePlayClick}
            className="px-4 py-2 rounded-lg border border-needswork text-needswork text-sm font-medium hover:bg-needswork/10"
          >
            stop
          </button>
        )}
        {(runState === 'identifying' || runState === 'pattern') && (
          <button
            onClick={handleReplay}
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            replay
          </button>
        )}
        {runState === 'reveal' && (
          <>
            <button
              onClick={handleReplay}
              className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
            >
              {replayedInReveal ? 'replay' : 'play progression'}
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-sm font-medium hover:opacity-90"
            >
              next progression →
            </button>
          </>
        )}
      </div>

      {/* Slot strip — tap any slot to refocus; filled slots show pending-blue */}
      {active && runState !== 'idle' && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {active.numerals.map((correct, i) => {
            const answer = answers[i];
            const isCurrent = runState === 'identifying' && !submitted && i === currentSlot;
            const filled = answer !== null;
            const graded = submitted || runState === 'pattern' || runState === 'reveal';
            const isCorrect = graded && filled && answer === correct;
            const isWrong = graded && filled && answer !== correct;

            let stateClass: string;
            if (graded && filled) {
              stateClass = isCorrect
                ? 'border-fluent bg-fluent/10 text-fluent'
                : 'border-needswork bg-needswork/10 text-needswork';
            } else if (isCurrent) {
              stateClass = filled
                ? 'border-info bg-info/10 text-info ring-2 ring-info/30'
                : 'border-fluent bg-fluent/5 text-fluent ring-2 ring-fluent/30';
            } else if (filled) {
              stateClass = 'border-info bg-info/10 text-info';
            } else {
              stateClass = 'border-neutral-200 dark:border-neutral-700 text-neutral-400';
            }

            const label = filled ? answer! : isCurrent ? '·' : '?';
            const clickable = runState === 'identifying' && !submitted;

            return (
              <div key={i} className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleSlotTap(i)}
                  disabled={!clickable}
                  className={`min-w-[56px] px-2 py-2 rounded-md border text-sm font-mono text-center transition ${stateClass} ${clickable ? 'cursor-pointer' : 'cursor-default'} disabled:cursor-default`}
                >
                  <div className="text-[9px] text-neutral-400 leading-none mb-0.5">chord {i + 1}</div>
                  <div>{label}</div>
                </button>
                {graded && isWrong && (
                  <span className="text-[9px] text-fluent font-mono mt-0.5">↑ {correct}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Numeral picker — fills focused slot + auto-advances */}
      {runState === 'identifying' && active && !submitted && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500 text-center">
            tap a Roman numeral to fill chord <span className="font-mono">{currentSlot + 1}</span> · tap any slot above to refocus
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {numeralChoices.map(n => (
              <button
                key={n}
                onClick={() => handleNumeralTap(n)}
                className="px-2 py-2 rounded-md border text-sm font-mono transition border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent"
              >
                {n}
              </button>
            ))}
          </div>
          {activeHasSlash && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-neutral-500 text-center">
                optional: pick an inversion / slash bass for the focused slot
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {([
                  { token: '', label: 'root' },
                  { token: '3', label: '/3' },
                  { token: '4', label: '/4' },
                  { token: '5', label: '/5' },
                  { token: '6', label: '/6' },
                  { token: 'b7', label: '/b7' },
                  { token: '7', label: '/7' },
                ] as const).map(opt => {
                  const current = answers[currentSlot];
                  const currentSlash = current ? splitAnswer(current).slash : '';
                  const selected = currentSlash === opt.token;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => applyInversion(opt.token)}
                      disabled={current === null}
                      className={`px-2 py-1 rounded-md border text-xs font-mono transition ${
                        selected
                          ? 'border-fluent bg-fluent/10 text-fluent'
                          : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={handleClearAll}
              disabled={!answers.some(a => a !== null)}
              className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm hover:border-neutral-400 disabled:opacity-40"
            >
              clear all
            </button>
            <button
              onClick={handleSubmitAll}
              disabled={!answers.every(a => a !== null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                answers.every(a => a !== null)
                  ? 'bg-fluent text-white hover:opacity-90'
                  : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
              }`}
            >
              submit all answers
            </button>
          </div>
        </div>
      )}

      {/* Pattern recognition round */}
      {runState === 'pattern' && active && (
        <div className="space-y-3">
          <div className="text-center text-sm">
            <div className="text-xs text-neutral-500">
              chords: <span className="font-mono">{chordCorrectCount}/{totalSlots}</span> correct
              {activeHasSlash && (
                <>
                  {' · '}
                  inversions: <span className="font-mono">{inversionCorrectCount}/{totalSlots}</span> correct
                </>
              )}
            </div>
            <p className="font-medium mt-2">what progression is this?</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {patternOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => handlePatternChoice(opt.id)}
                className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-left hover:border-fluent hover:text-fluent text-sm"
              >
                <div>{opt.name}</div>
                <div className="text-[10px] text-neutral-400 font-mono">{opt.numerals.join(' ')}</div>
              </button>
            ))}
          </div>
          <div className="text-center">
            <button
              onClick={() => handlePatternChoice(null)}
              className="text-xs text-neutral-500 hover:text-fluent"
            >
              skip — no penalty
            </button>
          </div>
        </div>
      )}

      {/* Reveal */}
      {runState === 'reveal' && active && (
        <RevealCard
          progression={active}
          chordCorrectCount={chordCorrectCount}
          inversionCorrectCount={inversionCorrectCount}
          hasSlash={activeHasSlash}
          totalSlots={totalSlots}
          patternAnswered={patternAnswered}
          patternCorrect={patternCorrect}
          keyLabel={activeConfig?.key ?? key}
          chordSequenceDisplay={chordSequenceDisplay}
        />
      )}

      {showFocusPanel && (
        <ItemSelectionPanel
          title="focus on specific progressions"
          description="drill only the progressions you pick. adaptive weighting still applies inside your selection."
          filter={focusFilter}
          sections={focusSections}
          initialSelection={persistedFocus}
          onStart={onStartFocus}
          onCancel={() => setShowFocusPanel(false)}
          startLabel={focusActive ? 'update focus session' : 'start focus session'}
          suggestWeakSpots={suggestWeakSpots}
          emptySuggestionMessage="you don't have any progressions in developing, needs-work, or untouched tiers yet."
          extraQuickSelects={[
            {
              label: 'must-knows only',
              compute: () => MUST_KNOW_IDS,
              emptyMessage: 'no must-know progressions match the current filter.',
            },
            {
              label: 'slash chord progressions',
              compute: () => PROGRESSIONS
                .filter(p => containsSlashChords(p.numerals))
                .map(p => p.id),
              emptyMessage: 'no slash-chord progressions match the current filter.',
            },
          ]}
        />
      )}
    </section>
  );
}

function today(): string {
  return localDayKey();
}

// --- Reveal card -------------------------------------------------------

interface RevealProps {
  progression: Progression;
  chordCorrectCount: number;
  inversionCorrectCount: number;
  hasSlash: boolean;
  totalSlots: number;
  patternAnswered: string | null;
  patternCorrect: boolean | null;
  keyLabel: string;
  chordSequenceDisplay: string;
}

function RevealCard({
  progression, chordCorrectCount, inversionCorrectCount, hasSlash, totalSlots,
  patternAnswered, patternCorrect, keyLabel, chordSequenceDisplay,
}: RevealProps) {
  return (
    <div className="rounded-lg border border-black/[0.07] p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium">{progression.name}</span>
        <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-neutral-200 dark:border-neutral-700 text-neutral-500">
          tier {progression.tier} · {progression.tierName}
        </span>
        {progression.isMustKnow && (
          <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-fluent/40 bg-fluent/10 text-fluent">
            ★ must-know
          </span>
        )}
      </div>

      <div className="text-xs text-neutral-500 font-mono">
        {progression.numerals.join(' — ')}
      </div>

      <div className="text-xs">
        <span className="text-neutral-500 uppercase tracking-wide mr-2">in {keyLabel}:</span>
        <span className="font-mono">{chordSequenceDisplay}</span>
      </div>

      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span>
          <span className="text-neutral-500">chord accuracy:</span>{' '}
          <span className="font-mono">{chordCorrectCount}/{totalSlots}</span>
        </span>
        {hasSlash && (
          <span>
            <span className="text-neutral-500">inversion accuracy:</span>{' '}
            <span className="font-mono">{inversionCorrectCount}/{totalSlots}</span>
          </span>
        )}
        {patternAnswered !== null && (
          <AnswerVerdict
            state={patternCorrect ? 'correct' : 'incorrect'}
            size="sm"
            label="pattern"
          />
        )}
      </div>

      {progression.theoryNote && (
        <div className="rounded-md bg-neutral-100/70 dark:bg-neutral-800/60 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 mr-1.5">theory</span>
          <ModeLinkify text={progression.theoryNote} />
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">song examples</div>
        <ul className="space-y-1 text-xs">
          {progression.songExamples.map((s, i) => (
            <li key={i} className="flex items-center gap-2 flex-wrap">
              <span>
                <span className="font-medium">{s.title}</span>
                <span className="text-neutral-500"> — {s.artist}</span>
                {s.year && <span className="text-neutral-400 font-mono"> ({s.year})</span>}
              </span>
              <a
                href={songSearchUrl('spotify', s.title, s.artist)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] hover:border-fluent hover:text-fluent"
              >
                spotify
              </a>
              <a
                href={songSearchUrl('youtube', s.title, s.artist)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] hover:border-fluent hover:text-fluent"
              >
                youtube
              </a>
            </li>
          ))}
        </ul>
      </div>

      <AssociationsEditor progressionId={progression.id} alwaysEditing />
    </div>
  );
}

// Keep `voicingFor` imported to avoid unused-import errors while still
// exposing the type helpers above. (Re-exported to encourage future callers
// — e.g. a visual overlay — to go through this module.)
export { voicingFor };

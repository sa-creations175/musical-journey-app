import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { playChordBlocked, playChordBroken } from '../../../lib/audio';
import { db, type AttemptRecord, type ChordData } from '../../../lib/db';
import {
  pickAdaptive,
  RECENT_HISTORY_SIZE,
  ROLLING_WINDOW_SIZE,
  type AdaptiveCandidate,
} from '../../../lib/adaptiveSelection';
import { getPref, setPref } from '../../../lib/userPrefs';
import { daysBetween, localDayKey } from '../../../lib/dailyGoal';
import { TIER_WEIGHT, computeTier, type Tier } from '../../../lib/tier';
import { updateDailySummary } from '../../../lib/dailySummaries';
import { defaultSpeed, focusSelectionKey, speedPrefKey } from '../../../lib/goalConfig';
import ItemSelectionPanel, {
  type FilterConfig,
  type FilterOption,
  type SelectionSection,
} from '../../../components/ItemSelectionPanel';
import SpeedControl from '../../../components/SpeedControl';

const MODULE_ID = 'chord-recognition';
const PREF_FOCUS = focusSelectionKey(MODULE_ID);

type TierFilter = 'all' | ChordData['tier'];
type PlaybackStyle = 'blocked' | 'broken';

const TIER_ORDER: ChordData['tier'][] = ['foundational', 'seventh', 'dominant', 'extensions'];
const TIER_TAB_LABEL: Record<ChordData['tier'], string> = {
  foundational: 'foundational',
  seventh: 'seventh',
  dominant: 'dominant',
  extensions: 'extensions',
};
const TIER_SECTION_LABEL: Record<ChordData['tier'], string> = {
  foundational: 'Foundational Triads',
  seventh: 'Seventh Chords',
  dominant: 'Dominant Variations',
  extensions: 'Extensions & Colors',
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function pickRootMidi(): number {
  // C3..B3 — keeps Maj13 / Dom13 top notes in a comfortable range.
  return 48 + Math.floor(Math.random() * 12);
}

function midiToNoteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

const FAMILY_DOT: Record<ChordData['family'], string> = {
  major: 'bg-family-major-500',
  minor: 'bg-family-minor-500',
  dom: 'bg-family-dom-500',
  sus: 'bg-family-sus-500',
  dim: 'bg-family-dim-500',
  aug: 'bg-family-aug-500',
};

const FAMILY_FILTER_OPTIONS: FilterOption[] = [
  { key: 'major', label: 'Major',      colorClass: FAMILY_DOT.major },
  { key: 'minor', label: 'Minor',      colorClass: FAMILY_DOT.minor },
  { key: 'dom',   label: 'Dominant',   colorClass: FAMILY_DOT.dom },
  { key: 'sus',   label: 'Sus',        colorClass: FAMILY_DOT.sus },
  { key: 'dim',   label: 'Diminished', colorClass: FAMILY_DOT.dim },
  { key: 'aug',   label: 'Augmented',  colorClass: FAMILY_DOT.aug },
];

interface Props {
  chords: ChordData[];
  attempts: AttemptRecord[];
}

export default function ChordRecognitionQuiz({ chords, attempts }: Props) {
  const [tierFilter, setTierFilter] = useState<TierFilter>('foundational');
  const [playStyle, setPlayStyle] = useState<PlaybackStyle>('blocked');
  const [current, setCurrent] = useState<{ chord: ChordData; rootMidi: number } | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showFocusPanel, setShowFocusPanel] = useState(false);
  const [focusActive, setFocusActive] = useState(false);
  const [focusKeys, setFocusKeys] = useState<string[]>([]);
  const [showLifetime, setShowLifetime] = useState(false);

  const filterRef = useRef(tierFilter); filterRef.current = tierFilter;
  const playStyleRef = useRef(playStyle); playStyleRef.current = playStyle;
  const focusActiveRef = useRef(focusActive); focusActiveRef.current = focusActive;
  const focusKeysRef = useRef(focusKeys); focusKeysRef.current = focusKeys;
  const chordsRef = useRef(chords); chordsRef.current = chords;

  const persistedFocus = useLiveQuery(
    async () => getPref<string[]>(PREF_FOCUS, []),
    [],
  ) ?? [];

  const speedFallback = defaultSpeed(MODULE_ID);
  const speed = useLiveQuery(
    async () => getPref<number>(speedPrefKey(MODULE_ID), speedFallback),
    [],
  ) ?? speedFallback;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const groupedAttempts = useMemo(() => {
    const m = new Map<string, AttemptRecord[]>();
    for (const a of attempts) {
      if (a.moduleId !== MODULE_ID) continue;
      const arr = m.get(a.itemId);
      if (arr) arr.push(a); else m.set(a.itemId, [a]);
    }
    for (const arr of m.values()) arr.sort((x, y) => y.timestamp - x.timestamp);
    return m;
  }, [attempts]);

  const recentHistoryKeys = useMemo(() => {
    const sorted = attempts
      .filter(a => a.moduleId === MODULE_ID)
      .sort((a, b) => b.timestamp - a.timestamp);
    return new Set(sorted.slice(0, RECENT_HISTORY_SIZE).map(a => a.itemId));
  }, [attempts]);

  const groupedRef = useRef(groupedAttempts); groupedRef.current = groupedAttempts;
  const recentRef = useRef(recentHistoryKeys); recentRef.current = recentHistoryKeys;

  const tierForChord = (id: string, today: string): Tier => {
    const keyed = groupedRef.current.get(id) ?? [];
    const recent = keyed.slice(0, ROLLING_WINDOW_SIZE);
    const correctN = recent.filter(a => a.correct).length;
    const total = recent.length;
    const latestTs = keyed[0]?.timestamp;
    const daysSince = latestTs ? daysBetween(localDayKey(new Date(latestTs)), today) : null;
    return computeTier({ windowCorrect: correctN, windowTotal: total, daysSinceLastAttempt: daysSince });
  };

  const buildCandidates = (): AdaptiveCandidate<ChordData>[] => {
    const today = localDayKey();
    const focusSet = focusActiveRef.current ? new Set(focusKeysRef.current) : null;
    const filter = filterRef.current;
    const candidates: AdaptiveCandidate<ChordData>[] = [];
    for (const c of chordsRef.current) {
      if (focusSet) {
        if (!focusSet.has(c.id)) continue;
      } else if (filter !== 'all' && c.tier !== filter) {
        continue;
      }
      const t = tierForChord(c.id, today);
      candidates.push({
        item: c,
        baseWeight: TIER_WEIGHT[t],
        inRecentHistory: recentRef.current.has(c.id),
      });
    }
    return candidates;
  };

  const playChord = async (chord: ChordData, rootMidi: number) => {
    if (playStyleRef.current === 'broken') {
      await playChordBroken(rootMidi, chord.intervals, speedRef.current);
    } else {
      await playChordBlocked(rootMidi, chord.intervals, speedRef.current);
    }
  };

  const startNew = async () => {
    if (chordsRef.current.length === 0) return;
    const candidates = buildCandidates();
    if (candidates.length === 0) return;
    const chord = pickAdaptive(candidates);
    const rootMidi = pickRootMidi();
    setCurrent({ chord, rootMidi });
    setSelectedId(null);
    setAnswered(false);
    setHasPlayed(true);
    await playChord(chord, rootMidi);
  };

  const replay = async () => {
    if (!current) return;
    await playChord(current.chord, current.rootMidi);
  };

  const submitAnswer = async (chosen: ChordData) => {
    if (!current || answered) return;
    const isCorrect = chosen.id === current.chord.id;
    setSelectedId(chosen.id);
    setAnswered(true);
    await db.attempts.add({
      moduleId: MODULE_ID,
      itemId: current.chord.id,
      correct: isCorrect,
      timestamp: Date.now(),
    });
    await updateDailySummary(MODULE_ID);
  };

  const answerGrid = useMemo(() => {
    let list: ChordData[];
    if (focusActive) {
      const set = new Set(focusKeys);
      list = chords.filter(c => set.has(c.id));
    } else if (tierFilter === 'all') {
      list = chords;
    } else {
      list = chords.filter(c => c.tier === tierFilter);
    }
    // Sort by tier then by name for consistent layout.
    return [...list].sort((a, b) => {
      const t = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
      return t !== 0 ? t : a.name.localeCompare(b.name);
    });
  }, [chords, tierFilter, focusActive, focusKeys]);

  const renderButtonClass = (c: ChordData) => {
    const base = 'relative rounded-lg border text-xs font-medium transition px-3 py-3 text-left leading-snug';
    if (!answered) {
      if (!hasPlayed) {
        return `${base} border-neutral-200 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 text-neutral-400`;
      }
      return `${base} border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-fluent hover:text-fluent`;
    }
    const isCorrect = c.id === current?.chord.id;
    const isSelected = c.id === selectedId;
    if (isCorrect) return `${base} border-fluent bg-fluent/10 text-fluent`;
    if (isSelected) return `${base} border-needswork bg-needswork/10 text-needswork`;
    return `${base} border-neutral-200 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 text-neutral-400 opacity-60`;
  };

  const rootName = current ? midiToNoteName(current.rootMidi) : '';
  const wasCorrect = answered && current && selectedId === current.chord.id;
  const wasWrong = answered && current && selectedId !== current.chord.id;
  const activeDesc = current && (current.chord.soundCustom ?? current.chord.soundDefault);
  const descIsCustom = current && Boolean(current.chord.soundCustom);

  useEffect(() => {
    if (!showLifetime) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowLifetime(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLifetime]);

  const focusSections: SelectionSection[] = useMemo(() => (
    TIER_ORDER.map(tier => ({
      title: TIER_SECTION_LABEL[tier],
      items: chords
        .filter(c => c.tier === tier)
        .map(c => ({ key: c.id, label: c.name })),
    }))
  ), [chords]);

  const familyByChord = useMemo(() => {
    const m = new Map<string, ChordData['family']>();
    for (const c of chords) m.set(c.id, c.family);
    return m;
  }, [chords]);

  const familyFilter: FilterConfig = useMemo(() => ({
    label: 'filter by family:',
    options: FAMILY_FILTER_OPTIONS,
    isVisible: (chordId, activeFamilies) => {
      const fam = familyByChord.get(chordId);
      return fam ? activeFamilies.has(fam) : false;
    },
  }), [familyByChord]);

  const suggestWeakSpots = (): string[] => {
    const today = localDayKey();
    const keys: string[] = [];
    for (const c of chords) {
      const t = tierForChord(c.id, today);
      if (t === 'developing' || t === 'needsWork' || t === 'untouched') keys.push(c.id);
    }
    return keys;
  };

  const onStartFocus = async (keys: string[]) => {
    await setPref(PREF_FOCUS, keys);
    setFocusKeys(keys);
    setFocusActive(true);
    setShowFocusPanel(false);
  };

  const onExitFocus = () => setFocusActive(false);

  const scopeLabel = (() => {
    if (focusActive) return null;
    if (tierFilter === 'all') return `all chords — ${chords.length} in pool`;
    const count = chords.filter(c => c.tier === tierFilter).length;
    return `${TIER_SECTION_LABEL[tierFilter].toLowerCase()} — ${count} in pool`;
  })();

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">chord recognition quiz</h2>
      </div>

      {/* Tier filter tabs / focus banner */}
      {focusActive ? (
        <div className="rounded-lg border border-fluent/40 bg-fluent/10 px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-sm">
          <span>
            <span className="font-medium text-fluent">focus mode</span>
            <span className="text-neutral-500"> · {focusKeys.length} chord{focusKeys.length === 1 ? '' : 's'} selected</span>
          </span>
          <button
            onClick={onExitFocus}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            exit focus
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs flex-wrap justify-center">
            {([
              { id: 'foundational', label: TIER_TAB_LABEL.foundational },
              { id: 'seventh', label: TIER_TAB_LABEL.seventh },
              { id: 'dominant', label: TIER_TAB_LABEL.dominant },
              { id: 'extensions', label: TIER_TAB_LABEL.extensions },
              { id: 'all', label: 'all chords' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setTierFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md transition ${
                  tierFilter === tab.id
                    ? 'bg-fluent text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFocusPanel(true)}
            className="text-xs text-neutral-500 hover:text-fluent"
          >
            ⊞ focus on specific chords
          </button>
          {scopeLabel && (
            <p className="text-[11px] text-neutral-500">{scopeLabel}</p>
          )}
        </div>
      )}

      {/* Playback style + root + play/next */}
      <div className="flex flex-col items-center gap-3">
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
          {([
            { id: 'blocked', label: 'blocked' },
            { id: 'broken', label: 'broken' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => setPlayStyle(opt.id)}
              className={`px-3 py-1.5 rounded-md transition ${
                playStyle === opt.id
                  ? 'bg-fluent text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <SpeedControl moduleId={MODULE_ID} />

        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">root note</div>
          <div className="text-3xl sm:text-4xl font-medium font-mono tabular-nums min-h-[3rem]">
            {hasPlayed ? rootName : '—'}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {!hasPlayed ? (
            <button
              onClick={startNew}
              className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              play chord
            </button>
          ) : (
            <button
              onClick={replay}
              className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
            >
              replay {playStyle}
            </button>
          )}
          {answered && (
            <button
              onClick={startNew}
              className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-sm font-medium hover:opacity-90"
            >
              next chord →
            </button>
          )}
        </div>
      </div>

      {/* Feedback area */}
      <div className="min-h-[1.5rem]">
        {answered && current ? (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium uppercase tracking-wide ${wasCorrect ? 'text-fluent' : 'text-needswork'}`}>
                {wasCorrect ? 'correct' : 'not quite'}
              </span>
              <span className="text-neutral-400">·</span>
              <span>
                <span className="font-medium">{rootName} {current.chord.name}</span>
                <span className="text-neutral-400 ml-1.5 font-mono text-xs">{current.chord.formula}</span>
              </span>
            </div>
            <div className={descIsCustom ? 'italic' : ''}>
              <span className="text-neutral-500 text-xs uppercase tracking-wide mr-2">sound</span>
              {activeDesc}
              {descIsCustom && <span className="ml-2 text-xs text-neutral-500 not-italic">(your note)</span>}
            </div>
            {wasWrong && (
              <p className="italic text-xs text-neutral-500">
                You'll see this one again soon to reinforce it.
              </p>
            )}
          </div>
        ) : hasPlayed ? (
          <p className="text-xs text-neutral-500 text-center">pick the chord you heard below</p>
        ) : (
          <p className="text-xs text-neutral-500 text-center">press play to start</p>
        )}
      </div>

      {/* Answer grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {answerGrid.map(c => (
          <button
            key={c.id}
            disabled={!hasPlayed || answered}
            onClick={() => submitAnswer(c)}
            className={`${renderButtonClass(c)} ${(!hasPlayed || answered) ? 'cursor-default' : 'cursor-pointer'} disabled:cursor-default`}
            title={c.formula}
          >
            <span className="block pr-4">{c.name}</span>
            <span aria-hidden className={`absolute top-2 right-2 w-2 h-2 rounded-full ${FAMILY_DOT[c.family]}`} />
          </button>
        ))}
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
          title="focus on specific chords"
          description="drill only the chords you pick. adaptive weighting still applies inside your selection."
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
              <span className="font-medium">start focus session</span> to narrow the quiz to the selected chords.
            </div>
          )}
          filter={familyFilter}
          sections={focusSections}
          initialSelection={persistedFocus}
          onStart={onStartFocus}
          onCancel={() => setShowFocusPanel(false)}
          startLabel={focusActive ? 'update focus session' : 'start focus session'}
          suggestWeakSpots={suggestWeakSpots}
          emptySuggestionMessage="you don't have any chords in developing, needs-work, or untouched tiers yet."
        />
      )}
    </section>
  );
}

function LifetimeStatsModal({ onClose }: { onClose: () => void }) {
  const all = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).toArray(),
    [],
  ) ?? [];
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
          <h3 className="font-medium">lifetime stats · chord recognition</h3>
          <button onClick={onClose} aria-label="close" className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">×</button>
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

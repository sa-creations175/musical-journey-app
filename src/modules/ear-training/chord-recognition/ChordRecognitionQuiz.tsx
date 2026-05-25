import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  playChordBlocked,
  playChordBroken,
  type BrokenChordDirection,
} from '../../../lib/audio';
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
import { recordEngagement } from '../../../lib/spacingState';
import { defaultSpeed, focusSelectionKey, speedPrefKey } from '../../../lib/goalConfig';
import ItemSelectionPanel, {
  type FilterConfig,
  type FilterOption,
  type SelectionSection,
} from '../../../components/ItemSelectionPanel';
import SpeedControl from '../../../components/SpeedControl';
import FluencyProtectionNotice from '../../../components/FluencyProtectionNotice';
import PianoKeyboard from '../../../components/PianoKeyboard';
import AnswerVerdict from '../../../components/AnswerVerdict';
import {
  INVERSION_EXCLUDED_CHORD_IDS,
  INVERSION_LABEL,
  attemptItemId,
  inversionsForIntervalCount,
  normalizeAttemptItemId,
  rotateForInversion,
  rotateFormula,
  type Inversion,
} from './inversionUtils';
import {
  isTrackedItem,
  getTierForItem,
  type ChordRecognitionTier,
} from './chordRecognitionTiers';
import {
  computeUnlockedTier,
  getEligibleItems,
  MIX_WEIGHT,
} from './tierUnlock';
import { useToast } from '../../../components/Toaster';

const MODULE_ID = 'chord-recognition';
const PREF_FOCUS = focusSelectionKey(MODULE_ID);
const PREF_BROKEN_DIRECTION = 'chordRecognitionBrokenDirection';
const PREF_INVERSION_POSITIONS = 'chordRecognitionInversionPositions';
// Default: all three triad inversions enabled. Inversion training is
// the polish-build feature — surface it on by default; gear icon lets
// the user dial back to root only or any subset.
const DEFAULT_INVERSION_POSITIONS: Inversion[] = [0, 1, 2];

type QuizPhase =
  | 'awaiting-quality'
  | 'quality-correct-awaiting-inversion'
  | 'quality-wrong-revealed'
  | 'fully-revealed';

type TierFilter = 'all' | ChordData['tier'];
type PlaybackStyle = 'blocked' | 'broken';

const TIER_ORDER: ChordData['tier'][] = ['foundational', 'seventh', 'dominant', 'extensions'];
const TIER_SECTION_LABEL: Record<ChordData['tier'], string> = {
  foundational: 'Foundational Triads',
  seventh: 'Seventh Chords',
  dominant: 'Dominant Variations',
  extensions: 'Extensions & Colors',
};
// Scope tabs show the full descriptive label — no abbreviation. Same
// strings as TIER_SECTION_LABEL; kept as a separate alias so the focus
// panel's section headers can diverge later without affecting the tabs.
const TIER_TAB_LABEL: Record<ChordData['tier'], string> = {
  foundational: TIER_SECTION_LABEL.foundational,
  seventh: TIER_SECTION_LABEL.seventh,
  dominant: TIER_SECTION_LABEL.dominant,
  extensions: TIER_SECTION_LABEL.extensions,
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
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [playStyle, setPlayStyle] = useState<PlaybackStyle>('blocked');
  const [brokenDir, setBrokenDir] = useState<BrokenChordDirection>('asc');
  const [current, setCurrent] = useState<{
    chord: ChordData;
    rootMidi: number;
    inversion: Inversion;
  } | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInversion, setSelectedInversion] = useState<Inversion | null>(null);
  const [phase, setPhase] = useState<QuizPhase>('awaiting-quality');
  const [showFocusPanel, setShowFocusPanel] = useState(false);
  const [focusActive, setFocusActive] = useState(false);
  const [focusKeys, setFocusKeys] = useState<string[]>([]);
  const [showLifetime, setShowLifetime] = useState(false);
  const [showInversionSettings, setShowInversionSettings] = useState(false);
  const [inversionPositions, setInversionPositions] = useState<Inversion[]>(
    DEFAULT_INVERSION_POSITIONS,
  );

  const filterRef = useRef(tierFilter); filterRef.current = tierFilter;
  const playStyleRef = useRef(playStyle); playStyleRef.current = playStyle;
  const brokenDirRef = useRef(brokenDir); brokenDirRef.current = brokenDir;
  const focusActiveRef = useRef(focusActive); focusActiveRef.current = focusActive;
  const focusKeysRef = useRef(focusKeys); focusKeysRef.current = focusKeys;
  const chordsRef = useRef(chords); chordsRef.current = chords;
  const inversionPositionsRef = useRef(inversionPositions);
  inversionPositionsRef.current = inversionPositions;

  const persistedFocus = useLiveQuery(
    async () => getPref<string[]>(PREF_FOCUS, []),
    [],
  ) ?? [];

  // Hydrate broken-chord direction + inversion positions from userPrefs.
  useEffect(() => {
    (async () => {
      const stored = await getPref<BrokenChordDirection>(PREF_BROKEN_DIRECTION, 'asc');
      setBrokenDir(stored === 'desc' || stored === 'both' ? stored : 'asc');

      const positions = await getPref<number[]>(
        PREF_INVERSION_POSITIONS,
        DEFAULT_INVERSION_POSITIONS,
      );
      // Defensively coerce: any stored entry not in 0–3 is dropped, dedupe,
      // and clamp empty to root-only.
      const sanitized = (Array.from(new Set(positions))
        .filter((n): n is Inversion => n === 0 || n === 1 || n === 2 || n === 3)
        .sort() as Inversion[]);
      setInversionPositions(sanitized.length > 0 ? sanitized : [0]);
    })();
  }, []);

  const saveInversionPositions = async (next: Inversion[]) => {
    const sanitized = (Array.from(new Set(next)).sort() as Inversion[]);
    const final: Inversion[] = sanitized.length > 0 ? sanitized : [0];
    setInversionPositions(final);
    await setPref(PREF_INVERSION_POSITIONS, final);
  };

  const saveBrokenDir = async (d: BrokenChordDirection) => {
    setBrokenDir(d);
    await setPref(PREF_BROKEN_DIRECTION, d);
  };

  const speedFallback = defaultSpeed(MODULE_ID);
  const speed = useLiveQuery(
    async () => getPref<number>(speedPrefKey(MODULE_ID), speedFallback),
    [],
  ) ?? speedFallback;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // Only fluency-tracked attempts feed the rolling window. Small-pool
  // focus sessions log with excludeFromFluency=true so they don't
  // artificially boost tiers for items the user was already cued into.
  // Keys are normalized to canonical 'chordId:inversion' shape so legacy
  // attempts (logged as bare 'maj' before the inversion build) bucket
  // alongside new root-position attempts under 'maj:0'.
  const groupedAttempts = useMemo(() => {
    const m = new Map<string, AttemptRecord[]>();
    for (const a of attempts) {
      if (a.moduleId !== MODULE_ID) continue;
      if (a.excludeFromFluency) continue;
      const key = normalizeAttemptItemId(a.itemId);
      const arr = m.get(key);
      if (arr) arr.push(a); else m.set(key, [a]);
    }
    for (const arr of m.values()) arr.sort((x, y) => y.timestamp - x.timestamp);
    return m;
  }, [attempts]);

  const recentHistoryKeys = useMemo(() => {
    const sorted = attempts
      .filter(a => a.moduleId === MODULE_ID)
      .sort((a, b) => b.timestamp - a.timestamp);
    return new Set(
      sorted.slice(0, RECENT_HISTORY_SIZE).map(a => normalizeAttemptItemId(a.itemId)),
    );
  }, [attempts]);

  const groupedRef = useRef(groupedAttempts); groupedRef.current = groupedAttempts;
  const recentRef = useRef(recentHistoryKeys); recentRef.current = recentHistoryKeys;

  // --- Progressive-difficulty tier gate ----------------------------
  // Reads chord-recognition spacingState rows (the "introduced"
  // signal) + attempts (the unlock walk's volume + accuracy signal).
  // Both queries live alongside the rest of the quiz's data layer so
  // they stay reactive to recordEngagement/attempt writes mid-session.
  const spacingStateRows = useLiveQuery(
    () => db.spacingState.where('moduleRef').equals(MODULE_ID).toArray(),
    [],
  );

  const unlockedTier: ChordRecognitionTier = useMemo(() => {
    const stats = new Map<string, { correct: number; total: number }>();
    for (const a of attempts) {
      if (a.moduleId !== MODULE_ID) continue;
      if (a.excludeFromFluency) continue;
      const cur = stats.get(a.itemId) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (a.correct) cur.correct += 1;
      stats.set(a.itemId, cur);
    }
    return computeUnlockedTier(stats);
  }, [attempts]);

  /** Eligible item-refs (attempt form) per the staged-introduction
   *  rules. `null` while the spacingState query is hydrating —
   *  buildCandidates treats null as "no filter applied" so the
   *  quiz doesn't freeze with an empty candidate pool on first
   *  paint. */
  const eligibleItems = useMemo<ReadonlySet<string> | null>(() => {
    if (!spacingStateRows) return null;
    return new Set(getEligibleItems(unlockedTier, spacingStateRows));
  }, [unlockedTier, spacingStateRows]);

  /** Set of itemRefs (attempt form) that have at least one
   *  spacingState row — used to distinguish "current tier
   *  introduced" from "current tier fresh" for the mix-weight
   *  multiplier. */
  const introducedItems = useMemo<ReadonlySet<string>>(() => {
    if (!spacingStateRows) return new Set();
    return new Set(spacingStateRows.map(r => r.itemRef));
  }, [spacingStateRows]);

  const unlockedTierRef = useRef(unlockedTier); unlockedTierRef.current = unlockedTier;
  const eligibleItemsRef = useRef(eligibleItems); eligibleItemsRef.current = eligibleItems;
  const introducedItemsRef = useRef(introducedItems); introducedItemsRef.current = introducedItems;

  // Toast on tier advancement. The previous-tier ref baselines on
  // first paint so we don't fire a phantom toast for the user's
  // existing unlock state — only NEW crossings trigger.
  const { toast } = useToast();
  const previousTierRef = useRef<ChordRecognitionTier | null>(null);
  useEffect(() => {
    if (previousTierRef.current !== null && unlockedTier > previousTierRef.current) {
      toast({
        message: `Tier ${unlockedTier} unlocked — new chord types available!`,
        variant: 'success',
      });
    }
    previousTierRef.current = unlockedTier;
  }, [unlockedTier, toast]);

  // Per-(chord, inversion) tier. Each (chord, inversion) pair has its
  // own rolling-window accuracy now that AttemptRecord.itemId carries
  // the inversion suffix. Replaces the chord-only tierForChord.
  const tierForChordInversion = (
    chordId: string,
    inversion: Inversion,
    today: string,
  ): Tier => {
    const keyed = groupedRef.current.get(attemptItemId(chordId, inversion)) ?? [];
    const recent = keyed.slice(0, ROLLING_WINDOW_SIZE);
    const correctN = recent.filter(a => a.correct).length;
    const total = recent.length;
    const latestTs = keyed[0]?.timestamp;
    const daysSince = latestTs ? daysBetween(localDayKey(new Date(latestTs)), today) : null;
    return computeTier({ windowCorrect: correctN, windowTotal: total, daysSinceLastAttempt: daysSince });
  };

  const buildCandidates = (): AdaptiveCandidate<{
    chord: ChordData;
    inversion: Inversion;
  }>[] => {
    const today = localDayKey();
    const focusSet = focusActiveRef.current ? new Set(focusKeysRef.current) : null;
    const filter = filterRef.current;
    const positions = inversionPositionsRef.current;
    const candidates: AdaptiveCandidate<{ chord: ChordData; inversion: Inversion }>[] = [];

    for (const c of chordsRef.current) {
      if (focusSet) {
        if (!focusSet.has(c.id)) continue;
      } else if (filter !== 'all' && c.tier !== filter) {
        continue;
      }

      // Inversion training is foundational-only AND requires 2+
      // positions enabled to be meaningful. Sus2 / Sus4 are also
      // excluded — their character is voicing-defined rather than
      // triad-stacked, so identifying inversions of them isn't a
      // useful ear target. Other tiers always play root.
      const stepTwoEligible =
        c.tier === 'foundational' &&
        !INVERSION_EXCLUDED_CHORD_IDS.has(c.id) &&
        positions.length >= 2;
      const validInversions = inversionsForIntervalCount(c.intervals.length);
      const inversionsForCard: Inversion[] = stepTwoEligible
        ? positions.filter(p => validInversions.includes(p))
        : [0];
      // Fallback if filter eliminates everything (shouldn't happen for
      // triads + standard positions, but defensive).
      const finalInversions: Inversion[] =
        inversionsForCard.length > 0 ? inversionsForCard : [0];

      for (const inv of finalInversions) {
        const itemRef = attemptItemId(c.id, inv);

        // Progressive-difficulty gate. eligibleItemsRef === null
        // means the spacingState live query hasn't resolved yet —
        // pass everything through so the quiz doesn't freeze on
        // initial mount. Once loaded, locked tiers + not-yet-
        // introduced items in the current tier drop here.
        const eligible = eligibleItemsRef.current;
        if (eligible !== null && !eligible.has(itemRef)) continue;

        const t = tierForChordInversion(c.id, inv, today);

        // Mix-weight multiplier — boosts current-tier introduced
        // items (×0.7) over prior-tier review (×0.2) and fresh
        // introductions (×0.1) per the design spec. Items outside
        // the tier system (defensive; shouldn't reach here once
        // the eligibility gate is on) get a 1.0 passthrough.
        let mixMult = 1.0;
        if (isTrackedItem(itemRef)) {
          const itemTier = getTierForItem(itemRef);
          if (itemTier < unlockedTierRef.current) {
            mixMult = MIX_WEIGHT.review;
          } else if (introducedItemsRef.current.has(itemRef)) {
            mixMult = MIX_WEIGHT.current;
          } else {
            mixMult = MIX_WEIGHT.fresh;
          }
        }

        candidates.push({
          item: { chord: c, inversion: inv },
          baseWeight: TIER_WEIGHT[t] * mixMult,
          inRecentHistory: recentRef.current.has(itemRef),
        });
      }
    }
    return candidates;
  };

  const playChord = async (
    chord: ChordData,
    rootMidi: number,
    inversion: Inversion,
  ) => {
    const intervals = rotateForInversion(chord.intervals, inversion);
    if (playStyleRef.current === 'broken') {
      await playChordBroken(rootMidi, intervals, speedRef.current, brokenDirRef.current);
    } else {
      await playChordBlocked(rootMidi, intervals, speedRef.current);
    }
  };

  const startNew = async () => {
    if (chordsRef.current.length === 0) return;
    const candidates = buildCandidates();
    if (candidates.length === 0) return;
    const picked = pickAdaptive(candidates);
    const rootMidi = pickRootMidi();
    setCurrent({ chord: picked.chord, rootMidi, inversion: picked.inversion });
    setSelectedId(null);
    setSelectedInversion(null);
    setPhase('awaiting-quality');
    setHasPlayed(true);
    await playChord(picked.chord, rootMidi, picked.inversion);
  };

  const replay = async () => {
    if (!current) return;
    await playChord(current.chord, current.rootMidi, current.inversion);
  };

  // Step-two eligibility for the *current* card. Independent of the
  // inversion-positions setting at submit time so a mid-card settings
  // change can't strand the user (we use the inversion picked at
  // startNew, which is already constrained by the settings of that
  // moment). Sus2 / Sus4 are excluded from inversion training and
  // never trigger step 2.
  const stepTwoFiresFor = (chord: ChordData): boolean =>
    chord.tier === 'foundational' &&
    !INVERSION_EXCLUDED_CHORD_IDS.has(chord.id) &&
    inversionPositionsRef.current.length >= 2;

  const submitAnswer = async (chosen: ChordData) => {
    if (!current || phase !== 'awaiting-quality') return;
    const isCorrect = chosen.id === current.chord.id;
    setSelectedId(chosen.id);

    if (isCorrect && stepTwoFiresFor(current.chord)) {
      // Defer logging until step 2 completes — we log a single combined
      // attempt per card, and step 2's inversion verdict is part of
      // the combined `correct` value. Phase transitions to step 2.
      setPhase('quality-correct-awaiting-inversion');
      return;
    }

    // Either quality wrong, or quality correct with no step 2. Log
    // immediately. Combined `correct` for the no-step-2 branch is just
    // the quality verdict.
    const timestamp = Date.now();
    const itemId = attemptItemId(current.chord.id, current.inversion);
    await db.attempts.add({
      moduleId: MODULE_ID,
      itemId,
      correct: isCorrect,
      timestamp,
      ...(focusProtected ? { excludeFromFluency: true } : {}),
    });
    await recordEngagement({
      itemRef: itemId,
      moduleRef: MODULE_ID,
      signal: { kind: 'attempt', correct: isCorrect },
      timestamp,
    });
    await updateDailySummary(MODULE_ID);

    setPhase(isCorrect ? 'fully-revealed' : 'quality-wrong-revealed');
  };

  const submitInversion = async (chosen: Inversion) => {
    if (!current || phase !== 'quality-correct-awaiting-inversion') return;
    setSelectedInversion(chosen);
    // Combined attempt: quality is already known correct in this
    // branch, so the combined verdict reduces to the inversion
    // verdict alone.
    const isCorrect = chosen === current.inversion;
    const timestamp = Date.now();
    const itemId = attemptItemId(current.chord.id, current.inversion);
    await db.attempts.add({
      moduleId: MODULE_ID,
      itemId,
      correct: isCorrect,
      timestamp,
      ...(focusProtected ? { excludeFromFluency: true } : {}),
    });
    await recordEngagement({
      itemRef: itemId,
      moduleRef: MODULE_ID,
      signal: { kind: 'attempt', correct: isCorrect },
      timestamp,
    });
    await updateDailySummary(MODULE_ID);
    setPhase('fully-revealed');
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

  // Quality-side answer grid is interactive only during step 1.
  // From quality-correct-awaiting-inversion onward, the grid is
  // disabled and styled with the result so the user reads the verdict
  // while picking an inversion.
  const qualityLocked =
    phase === 'quality-correct-awaiting-inversion' ||
    phase === 'quality-wrong-revealed' ||
    phase === 'fully-revealed';

  const renderButtonClass = (c: ChordData) => {
    const base = 'relative rounded-lg border text-xs font-medium transition px-3 py-3 text-left leading-snug';
    if (!qualityLocked) {
      if (!hasPlayed) {
        return `${base} border-neutral-200 dark:border-neutral-700 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] text-neutral-400`;
      }
      return `${base} border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-fluent hover:text-fluent`;
    }
    const isCorrect = c.id === current?.chord.id;
    const isSelected = c.id === selectedId;
    if (isCorrect) return `${base} border-fluent bg-fluent/10 text-fluent`;
    if (isSelected) return `${base} border-needswork bg-needswork/10 text-needswork`;
    return `${base} border-neutral-200 dark:border-neutral-700 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] text-neutral-400 opacity-60`;
  };

  // Focus sessions with fewer than 4 items don't truly test fluency.
  // Attempts still log (calendar, daily goal, streaks unaffected) but
  // are skipped from the rolling-window tier calculation.
  const focusProtected = focusActive && focusKeys.length < 4;

  const rootName = current ? midiToNoteName(current.rootMidi) : '';
  const qualityCorrect = qualityLocked && current && selectedId === current.chord.id;
  const qualityWrong = phase === 'quality-wrong-revealed';
  const inversionAnswered = phase === 'fully-revealed' && selectedInversion !== null;
  const inversionCorrect =
    inversionAnswered && current && selectedInversion === current.inversion;
  const activeDesc = current && (current.chord.soundCustom ?? current.chord.soundDefault);
  const descIsCustom = current && Boolean(current.chord.soundCustom);

  const cardIsTerminal = phase === 'quality-wrong-revealed' || phase === 'fully-revealed';

  // True when the current card was generated under active inversion
  // training — drives the inline inversion label on the wrong-quality
  // reveal AND the rotated formula on terminal phases.
  const cardUsesInversionTraining =
    current !== null &&
    current.chord.tier === 'foundational' &&
    !INVERSION_EXCLUDED_CHORD_IDS.has(current.chord.id) &&
    inversionPositions.length >= 2;

  // Inline inversion label for the wrong-quality reveal. Surfaces the
  // inversion alongside chord identity so the user can learn what they
  // were hearing. Skipped on quality-correct-awaiting-inversion (would
  // spoil step 2) and on fully-revealed (the dedicated inversion-
  // verdict line below already discloses it).
  const showInversionInline =
    phase === 'quality-wrong-revealed' && cardUsesInversionTraining;

  // Chord identity text — derived as a plain string so the inversion
  // suffix can't get lost in JSX whitespace nuances. Always shows
  // root + name; appends ", <inversion label>" on the wrong-quality
  // path when training was active.
  const chordIdentityText = current
    ? showInversionInline
      ? `${rootName} ${current.chord.name}, ${INVERSION_LABEL[current.inversion]}`
      : `${rootName} ${current.chord.name}`
    : '';

  // Displayed formula — shows the actual played intervals (rotated
  // for inversion) on terminal phases when training was active for
  // this card. quality-correct-awaiting-inversion stays on root
  // formula so the formula doesn't spoil the inversion question.
  const cardIsTerminalForFormula =
    phase === 'quality-wrong-revealed' || phase === 'fully-revealed';
  const displayedFormula =
    current && cardIsTerminalForFormula && cardUsesInversionTraining
      ? rotateFormula(current.chord.formula, current.inversion)
      : current?.chord.formula ?? '';

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
    // Per-chord weakness check: a chord is "weak" if any of its
    // tracked inversions (or root, for non-foundational) sits in
    // developing / needsWork / untouched. Conservative — surfaces
    // chords that need work in any inversion the user has practised.
    for (const c of chords) {
      const inversionsToCheck: Inversion[] =
        c.tier === 'foundational' && !INVERSION_EXCLUDED_CHORD_IDS.has(c.id)
          ? inversionsForIntervalCount(c.intervals.length)
          : [0];
      const isWeak = inversionsToCheck.some(inv => {
        const t = tierForChordInversion(c.id, inv, today);
        return t === 'developing' || t === 'needsWork' || t === 'untouched';
      });
      if (isWeak) keys.push(c.id);
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

  // Dynamic status line shown directly under the focus button. Mirrors
  // the pattern used by every other ear-training module.
  const scopeLabel = (() => {
    if (focusActive) {
      return `focused practice — ${focusKeys.length} chord${focusKeys.length === 1 ? '' : 's'} selected`;
    }
    if (tierFilter === 'all') return `all chords — ${chords.length} in pool`;
    const count = chords.filter(c => c.tier === tierFilter).length;
    return `${TIER_SECTION_LABEL[tierFilter].toLowerCase()} — ${count} in pool`;
  })();

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">chord recognition quiz</h2>
      </div>

      {/* Scope selector (all-first) + focus button + dynamic status line.
          Foundational Triads tab carries an inline gear that opens the
          inversion-training settings drawer. The gear is always visible
          on that tab regardless of which tab is selected — configuring
          inversion training is independent of scoping the pool. */}
      <div className="flex flex-col items-center gap-2">
        {!focusActive && (
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs flex-wrap justify-center">
            {([
              { id: 'all', label: 'all chords' },
              { id: 'foundational', label: TIER_TAB_LABEL.foundational },
              { id: 'seventh', label: TIER_TAB_LABEL.seventh },
              { id: 'dominant', label: TIER_TAB_LABEL.dominant },
              { id: 'extensions', label: TIER_TAB_LABEL.extensions },
            ] as const).map(tab => {
              const active = tierFilter === tab.id;
              const isFoundational = tab.id === 'foundational';
              // Each tab is a wrapper with one or two buttons inside —
              // a button for the label, and (foundational only) a
              // sibling button for the gear. Avoids nesting interactive
              // elements while still rendering the gear as part of the
              // tab's visual unit.
              const wrapperClass = `inline-flex items-center rounded-md transition ${
                active ? 'bg-fluent text-white' : ''
              }`;
              const labelClass = `px-3 py-1.5 rounded-md transition ${
                active
                  ? 'text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              } ${isFoundational ? 'pr-1.5' : ''}`;
              const gearClass = `inline-flex items-center justify-center pr-2 py-1.5 text-[12px] leading-none rounded-md transition ${
                active
                  ? 'text-white opacity-90 hover:opacity-100'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`;
              return (
                <span key={tab.id} className={wrapperClass}>
                  <button
                    type="button"
                    onClick={() => setTierFilter(tab.id)}
                    className={labelClass}
                  >
                    {tab.label}
                  </button>
                  {isFoundational && (
                    <button
                      type="button"
                      aria-label="inversion training settings"
                      title="inversion training settings"
                      onClick={e => {
                        e.stopPropagation();
                        setShowInversionSettings(v => !v);
                      }}
                      className={gearClass}
                    >
                      ⚙
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {showInversionSettings && (
          <InversionSettingsDrawer
            positions={inversionPositions}
            onSave={saveInversionPositions}
            onClose={() => setShowInversionSettings(false)}
          />
        )}
        <button
          onClick={() => setShowFocusPanel(true)}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ⊞ focus on specific chords
        </button>
        <p className="text-[11px] text-neutral-500 inline-flex items-center gap-2">
          <span>{scopeLabel}</span>
          {focusActive && (
            <button
              onClick={onExitFocus}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline"
            >
              exit focus
            </button>
          )}
        </p>
      </div>

      {focusProtected && <FluencyProtectionNotice />}

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

        {/* Arpeggio direction — only meaningful for broken playback. Kept
            visible and disabled when blocked is selected so the control
            stays discoverable. "Both" plays ascending then descending
            without re-striking the apex. */}
        <div
          className={`inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs transition-opacity ${
            playStyle === 'broken' ? '' : 'opacity-40'
          }`}
          aria-disabled={playStyle !== 'broken'}
        >
          {([
            { id: 'asc', label: 'ascending' },
            { id: 'desc', label: 'descending' },
            { id: 'both', label: 'both' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => { if (playStyle === 'broken') saveBrokenDir(opt.id); }}
              disabled={playStyle !== 'broken'}
              className={`px-3 py-1.5 rounded-md transition ${
                brokenDir === opt.id
                  ? 'bg-fluent text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              } disabled:cursor-not-allowed disabled:hover:text-neutral-500`}
              title={playStyle === 'broken' ? opt.label : 'switch to broken playback to change direction'}
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
          {cardIsTerminal && (
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
        {qualityLocked && current ? (
          <div className="rounded-lg border border-black/[0.07] p-4 text-sm space-y-2">
            <div className="text-center space-y-1">
              <AnswerVerdict state={qualityCorrect ? 'correct' : 'incorrect'} />
              <span>
                <span className="font-medium">{chordIdentityText}</span>
                <span className="text-neutral-400 ml-1.5 font-mono text-xs">{displayedFormula}</span>
              </span>
            </div>
            {/* The exact chord that was played — root + quality + inversion,
                colored by interval. Terminal phases only, so it never spoils
                the inversion question on quality-correct-awaiting-inversion. */}
            {cardIsTerminal && (
              <div className="pt-1">
                <PianoKeyboard
                  rootPc={((current.rootMidi % 12) + 12) % 12}
                  voicing={rotateForInversion(current.chord.intervals, current.inversion)}
                  absoluteOffsets
                  octaves={4}
                  preferFlats={false}
                />
              </div>
            )}
            <div className={descIsCustom ? 'italic' : ''}>
              <span className="text-neutral-500 text-xs uppercase tracking-wide mr-2">sound</span>
              {activeDesc}
              {descIsCustom && <span className="ml-2 text-xs text-neutral-500 not-italic">(your note)</span>}
            </div>
            {qualityWrong && (
              <p className="italic text-xs text-neutral-500">
                You'll see this one again soon to reinforce it.
              </p>
            )}
            {phase === 'quality-correct-awaiting-inversion' && (
              <p className="text-xs text-neutral-500">
                Now identify the inversion you heard.
              </p>
            )}
            {inversionAnswered && current && (
              <AnswerVerdict
                state={inversionCorrect ? 'correct' : 'incorrect'}
                size="sm"
                label={
                  inversionCorrect
                    ? `inversion: ${INVERSION_LABEL[current.inversion]}`
                    : `that was ${INVERSION_LABEL[current.inversion].toLowerCase()}`
                }
              />
            )}
          </div>
        ) : hasPlayed ? (
          <p className="text-xs text-neutral-500 text-center">pick the chord you heard below</p>
        ) : (
          <p className="text-xs text-neutral-500 text-center">press play to start</p>
        )}
      </div>

      {/* Inversion picker — surfaces during step 2 (quality correct,
          awaiting inversion identification) and stays visible (disabled
          with verdict styling) once the user answers. Rendered ABOVE the
          answer grid so the step-2 prompt is seen immediately, without
          scrolling past the (now-locked) quality options. */}
      {current && (phase === 'quality-correct-awaiting-inversion' || (phase === 'fully-revealed' && stepTwoFiresFor(current.chord) && selectedInversion !== null)) && (
        <InversionPicker
          enabled={inversionPositions.filter(p =>
            inversionsForIntervalCount(current.chord.intervals.length).includes(p),
          )}
          correctInversion={current.inversion}
          selectedInversion={selectedInversion}
          locked={phase === 'fully-revealed'}
          onPick={submitInversion}
        />
      )}

      {/* Answer grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {answerGrid.map(c => (
          <button
            key={c.id}
            disabled={!hasPlayed || qualityLocked}
            onClick={() => submitAnswer(c)}
            className={`${renderButtonClass(c)} ${(!hasPlayed || qualityLocked) ? 'cursor-default' : 'cursor-pointer'} disabled:cursor-default`}
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
        className="w-full max-w-sm rounded-2xl border border-black/[0.07] bg-white dark:bg-neutral-900 p-5 space-y-3"
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

// ---------------------------------------------------------------------
// Inversion picker — surfaces during step 2 and stays visible (locked)
// once the user answers. Only renders the inversions present in the
// current settings, so e.g. "Root + 1st only" omits the 2nd-inv button.
// ---------------------------------------------------------------------

interface InversionPickerProps {
  enabled: Inversion[];
  correctInversion: Inversion;
  selectedInversion: Inversion | null;
  locked: boolean;
  onPick: (inv: Inversion) => void;
}

function InversionPicker({
  enabled,
  correctInversion,
  selectedInversion,
  locked,
  onPick,
}: InversionPickerProps) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 text-center">
        identify the inversion
      </div>
      <div className="flex justify-center gap-2 flex-wrap">
        {enabled.map(inv => {
          const isCorrect = inv === correctInversion;
          const isSelected = inv === selectedInversion;
          const base =
            'px-3 py-2 rounded-lg border text-xs font-medium transition';
          let cls: string;
          if (!locked) {
            cls = `${base} border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-fluent hover:text-fluent cursor-pointer`;
          } else if (isCorrect) {
            cls = `${base} border-fluent bg-fluent/10 text-fluent cursor-default`;
          } else if (isSelected) {
            cls = `${base} border-needswork bg-needswork/10 text-needswork cursor-default`;
          } else {
            cls = `${base} border-neutral-200 dark:border-neutral-700 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] text-neutral-400 opacity-60 cursor-default`;
          }
          return (
            <button
              key={inv}
              type="button"
              disabled={locked}
              onClick={() => onPick(inv)}
              className={cls}
            >
              {INVERSION_LABEL[inv]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Inversion settings drawer — inline below tab strip. Opens from the
// gear icon on the Foundational Triads tab. Multi-select; saves on
// every toggle so there's no separate save button. Click the close
// button to dismiss.
// ---------------------------------------------------------------------

interface InversionSettingsDrawerProps {
  positions: Inversion[];
  onSave: (next: Inversion[]) => void | Promise<void>;
  onClose: () => void;
}

function InversionSettingsDrawer({
  positions,
  onSave,
  onClose,
}: InversionSettingsDrawerProps) {
  const isEnabled = (inv: Inversion) => positions.includes(inv);
  const toggle = async (inv: Inversion) => {
    const next = isEnabled(inv)
      ? positions.filter(p => p !== inv)
      : [...positions, inv];
    await onSave(next);
  };

  const stepTwoActive = positions.length >= 2;

  return (
    <div className="w-full max-w-md rounded-2xl border border-black/[0.07] bg-white/80 dark:bg-neutral-900/80 backdrop-blur p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium tracking-tight">
            Foundational Triads — inversion training
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {stepTwoActive
              ? 'After each correct chord answer, you’ll be asked to identify the inversion.'
              : 'Enable two or more positions to turn on inversion training.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([0, 1, 2] as Inversion[]).map(inv => {
          const enabled = isEnabled(inv);
          return (
            <button
              key={inv}
              type="button"
              onClick={() => void toggle(inv)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition ${
                enabled
                  ? 'border-fluent bg-fluent/10 text-fluent'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
              }`}
              aria-pressed={enabled}
            >
              {INVERSION_LABEL[inv]}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-500">
        Per-inversion accuracy feeds tier ratings separately — your{' '}
        <span className="font-medium">C major root</span> tier and{' '}
        <span className="font-medium">C major 1st inversion</span> tier are tracked
        independently.
      </p>
    </div>
  );
}

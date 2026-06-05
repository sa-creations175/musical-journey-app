import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { type AttemptRecord } from '../../../lib/db';
import { bulkAddAttempts } from '../../../lib/practiceWrites';
import { ensureRunning, midiToFreq, playNote } from '../../../lib/audio';
import { updateDailySummary } from '../../../lib/dailySummaries';
import { getPref, setPref } from '../../../lib/userPrefs';
import { defaultSpeed, speedPrefKey } from '../../../lib/goalConfig';
import SpeedControl from '../../../components/SpeedControl';
import KeyboardVisual, { type HighlightedNote } from '../../../components/KeyboardVisual';
import ItemSelectionPanel, { type SelectionSection } from '../../../components/ItemSelectionPanel';
import FluencyProtectionNotice from '../../../components/FluencyProtectionNotice';
import AnswerVerdict from '../../../components/AnswerVerdict';
import AssociationsEditor from './AssociationsEditor';
import IntervalDescriptionEditor from './IntervalDescriptionEditor';
import {
  defaultIntervalDescription,
  intervalDescriptionKey,
  intervalFromSemitones,
} from './intervalQuality';
import {
  KEYS,
  cadenceDurationSeconds,
  chordDisplay,
  keyToRootMidi,
  playCadence,
  voicingFor,
  type Complexity,
  type ListeningMode,
  type PlaybackHandle,
} from './progressionTheory';
import type { ChordQuality } from './catalog';

const MODULE_ID = 'chord-progressions';

// --- Types + tables ---------------------------------------------------

type Direction = 'asc' | 'desc';
type DistanceFilter = 'all' | 2 | 3 | 4 | 5 | 6 | 7;
type DirectionFilter = 'both' | Direction;
type NoteContext = 'diatonic' | 'chromatic';
type Scaffolding = 'full' | 'partial' | 'minimal';

const INTERVAL_NAME: Record<2 | 3 | 4 | 5 | 6 | 7, string> = {
  2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th',
};

const SCAFFOLD_LABEL: Record<Scaffolding, string> = {
  full: 'full',
  partial: 'partial',
  minimal: 'minimal',
};

// 12 positions in the chromatic scale relative to the tonic of a major
// key. Diatonic positions are 1-7 (offsets 0,2,4,5,7,9,11); the five
// chromatic slots fill the gaps with borrowed-quality defaults:
//   b2 / b3 / b6 / b7 as majors (Neapolitan + borrowed-from-minor
//   majors) and #4 as diminished (tritone / vii° of V).
// This is the universe of motion endpoints across both scope settings;
// the pool filters at runtime by entry.diatonic when the user is in
// "diatonic only" mode.
export type DegreeLabel =
  | '1' | 'b2' | '2' | 'b3' | '3' | '4' | '#4' | '5' | 'b6' | '6' | 'b7' | '7';

interface DegreeEntry {
  label: DegreeLabel;
  semi: number;
  diatonic: boolean;
  quality: ChordQuality;
}

const DEGREE_TABLE: DegreeEntry[] = [
  { label: '1',  semi: 0,  diatonic: true,  quality: 'major' },
  { label: 'b2', semi: 1,  diatonic: false, quality: 'major' },
  { label: '2',  semi: 2,  diatonic: true,  quality: 'minor' },
  { label: 'b3', semi: 3,  diatonic: false, quality: 'major' },
  { label: '3',  semi: 4,  diatonic: true,  quality: 'minor' },
  { label: '4',  semi: 5,  diatonic: true,  quality: 'major' },
  { label: '#4', semi: 6,  diatonic: false, quality: 'diminished' },
  { label: '5',  semi: 7,  diatonic: true,  quality: 'dominant' },
  { label: 'b6', semi: 8,  diatonic: false, quality: 'major' },
  { label: '6',  semi: 9,  diatonic: true,  quality: 'minor' },
  { label: 'b7', semi: 10, diatonic: false, quality: 'major' },
  { label: '7',  semi: 11, diatonic: true,  quality: 'diminished' },
];

const DEGREE_BY_LABEL = new Map<string, DegreeEntry>(DEGREE_TABLE.map(e => [e.label, e]));

function degreeEntry(label: string): DegreeEntry | undefined {
  return DEGREE_BY_LABEL.get(label);
}

// Module-level complexity for Chord Motion playback. Default is seventh
// (richer sound; matches what the audio engine actually renders).
// Kept as a const for v1 — exposing a user-facing complexity toggle
// lives in the Chord Motion roadmap.
const MOTION_COMPLEXITY: Complexity = 'seventh';

// Approximate musical-interval count (2..7) from a semitone span. Keeps
// the scope filter buckets sensible across both diatonic and chromatic
// endpoints. The boundary cases (tritone at 6 st, mediant overlaps) are
// not strict music-theory spellings — they're just scope buckets.
function intervalCountFromSemi(semi: number): 2 | 3 | 4 | 5 | 6 | 7 {
  const s = Math.abs(semi);
  if (s <= 2) return 2;
  if (s <= 4) return 3;
  if (s <= 5) return 4;
  if (s <= 7) return 5;
  if (s <= 9) return 6;
  return 7;
}

// --- Motion pool + encoding ------------------------------------------

interface Motion {
  startLabel: DegreeLabel;
  destLabel: DegreeLabel;
  /** Semitones above the tonic for start / destination. Preserved on
   *  the motion so callers don't need to re-look-up the degree table. */
  startSemi: number;
  destSemi: number;
  direction: Direction;
  /** Musical interval count (2..7). Used only for the scope filter
   *  buckets; feedback quality (major 3rd vs minor 3rd, perfect 5th vs
   *  tritone, etc.) is computed separately from the actual semitone
   *  delta via intervalFromSemitones(). */
  distance: 2 | 3 | 4 | 5 | 6 | 7;
  /** True when BOTH endpoints are diatonic (scale degrees 1..7 of the
   *  major scale). Drives the diatonic-only scope filter. */
  isDiatonic: boolean;
}

function motionId(m: Pick<Motion, 'startLabel' | 'destLabel' | 'direction'>): string {
  return `motion:${m.startLabel}-${m.destLabel}-${m.direction}`;
}
function parseMotionId(id: string): Motion | null {
  // Labels can contain b/# plus a digit, so we lean on a non-hyphen
  // match rather than \d+. Legacy ids stored as `motion:1-5-asc` parse
  // cleanly because "1" and "5" are valid DegreeLabel entries.
  const m = id.match(/^motion:([^-]+)-([^-]+)-(asc|desc)$/);
  if (!m) return null;
  const startEntry = degreeEntry(m[1]);
  const destEntry = degreeEntry(m[2]);
  if (!startEntry || !destEntry) return null;
  const direction = m[3] as Direction;
  const distance = intervalCountFromSemi(Math.abs(destEntry.semi - startEntry.semi));
  return {
    startLabel: startEntry.label,
    destLabel: destEntry.label,
    startSemi: startEntry.semi,
    destSemi: destEntry.semi,
    direction,
    distance,
    isDiatonic: startEntry.diatonic && destEntry.diatonic,
  };
}

// Every in-octave motion between any two distinct chromatic-scale
// positions. The pool is generated once and filtered at call time by
// distance / direction / note-context (see filterMotions). Order is
// asc/desc by the underlying semitone offsets — no octave crossing.
function buildAllMotions(): Motion[] {
  const motions: Motion[] = [];
  for (const s of DEGREE_TABLE) {
    for (const d of DEGREE_TABLE) {
      if (s.label === d.label) continue;
      motions.push({
        startLabel: s.label,
        destLabel: d.label,
        startSemi: s.semi,
        destSemi: d.semi,
        direction: d.semi > s.semi ? 'asc' : 'desc',
        distance: intervalCountFromSemi(Math.abs(d.semi - s.semi)),
        isDiatonic: s.diatonic && d.diatonic,
      });
    }
  }
  return motions;
}

const ALL_MOTIONS = buildAllMotions();

// --- Pre-populated "starter" associations ----------------------------

// Tuned to gospel / R&B / soul / jazz / neo-soul / hip-hop vocabulary.
// Keyed by motion id. Missing entries fall back to a generic tag line.
const STARTER_ASSOCIATIONS: Record<string, string> = {
  'motion:1-4-asc':
    'the plagal lift — gospel amen, worship-key brightening, sunset opens into a porch. hits every Sunday service ever.',
  'motion:1-5-asc':
    'the question posed — V pulls forward without yet resolving. the tension that makes half the hooks in pop work.',
  'motion:1-6-asc':
    'the soft pivot into relative minor — that bittersweet "I\'m happy but…" colour behind neo-soul verses.',
  'motion:2-5-asc':
    'the ii–V setup. if your ear hears this, you\'re already hearing jazz. also backbone of motown and lite-funk.',
  'motion:5-1-asc':
    'the authentic cadence, but leaping up — feels triumphant and slightly unusual. the quasi-V-I in R&B hymns.',
  'motion:5-1-desc':
    'the classic V → I resolution — deliberate, churchy, final. every Stevie outro, every John Legend bridge.',
  'motion:4-1-desc':
    'plagal resolution falling into home — like "Let It Be" dissolves back to the tonic. very singable, very soul.',
  'motion:6-4-desc':
    'the vi → IV drop — Adele-level "here comes the chorus" feeling. one of the most heart-tugging motions in pop.',
  'motion:6-5-desc':
    'the subtle step down from relative minor to dominant — hip-hop loop tension, neo-soul verse swells.',
  'motion:2-1-desc':
    'supertonic letting go — a softer resolution than V–I. shows up in gospel outros and slow R&B fadeouts.',
  'motion:7-1-asc':
    'the leading-tone pull — half-step into home. biggest gravity of any motion in tonal music.',
  'motion:3-6-asc':
    'iii → vi — the jazzy side-step inside "3-6-2-5-1" cycles. the colour that makes turnarounds feel sophisticated.',
  'motion:6-2-desc':
    'part of the 6-2-5-1 turnaround. neo-soul ballads live on this motion — think Erykah Badu extended outros.',
  'motion:1-3-asc':
    'tonic stretching into mediant — warm, conversational lift. very common in soul verse openings.',
  'motion:1-7-desc':
    'stepping down from home to the leading tone — ominous, slightly unresolved. backdoor cadence territory.',
  'motion:4-5-asc':
    'IV → V — the "about to resolve" lift. this is what your ear is waiting for before every big hook.',
  'motion:5-4-desc':
    'reverse cadence — V falling into IV. blues territory; "Hey Joe," "All Along the Watchtower."',
};

function starterAssociation(m: Motion): string {
  const id = motionId(m);
  return (
    STARTER_ASSOCIATIONS[id] ??
    `a ${m.direction === 'asc' ? m.distance + 'th up' : m.distance + 'th down'} from the ${m.startLabel} to the ${m.destLabel} — sit inside this motion and see what feeling it leaves.`
  );
}

// --- Pref keys -------------------------------------------------------

const PREF_DISTANCE = 'chordProgressionsMotionDistance';
const PREF_DIRECTION = 'chordProgressionsMotionDirection';
const PREF_NOTE_CONTEXT = 'chordProgressionsMotionNoteContext';
const PREF_LISTENING = 'chordProgressionsMotionListening';
const PREF_SCAFFOLD = 'chordProgressionsMotionScaffolding';
const PREF_FOCUS = 'chordProgressionsMotionFocus';

// --- Audio helpers ---------------------------------------------------

function chordVoice(key: string, label: DegreeLabel) {
  const entry = degreeEntry(label);
  if (!entry) {
    // Should never happen — DegreeLabel is a closed union — but guard so
    // an invalid id can't blow up audio generation.
    return { root: keyToRootMidi(key), intervals: [0], quality: 'major' as ChordQuality };
  }
  const root = keyToRootMidi(key) + entry.semi;
  const intervals = voicingFor(entry.quality, MOTION_COMPLEXITY, false);
  return { root, intervals, quality: entry.quality };
}

// Midi pitch of a degree label in a given key (one-octave basis, tonic
// sits at keyToRootMidi(key)). Used everywhere the motion needs a
// concrete pitch — for the keyboard highlight math, for grading, and
// for scheduling the chord voicing.
function degreeMidi(key: string, label: DegreeLabel): number {
  const entry = degreeEntry(label);
  return keyToRootMidi(key) + (entry?.semi ?? 0);
}

// Play one step of the motion as a blocked voicing. Texture depends on
// the listening mode:
//   · 'bass'        → just the root note one octave below chord register
//   · 'chords'      → full chord voicing, no separate bass
//   · 'bass-chords' → chord voicing at normal register plus the bass
//                     note at the low octave (boosted slightly so it
//                     stays audible under the chord)
// Same internal shape used by playProgression in progressionTheory.ts
// — kept local here so volume tuning can diverge from the progression
// playback without affecting the main quiz.
async function playStep(
  rootMidi: number,
  intervals: number[],
  listening: ListeningMode,
  durationSecs = 1.4,
) {
  const context = await ensureRunning();
  const start = context.currentTime + 0.04;
  const notes: number[] = [];
  const bassSeparate = listening === 'bass' || listening === 'bass-chords';
  if (bassSeparate) notes.push(rootMidi - 12);
  if (listening === 'chords' || listening === 'bass-chords') {
    for (const iv of intervals) notes.push(rootMidi + iv);
  }
  const polyphony = Math.max(1, notes.length);
  const vol = Math.max(0.15, 0.3 / Math.sqrt(polyphony));
  notes.forEach((midi, i) => {
    const isBassVoice = bassSeparate && i === 0;
    playNote(midiToFreq(midi), start, durationSecs, context, vol * (isBassVoice ? 1.3 : 1));
  });
}

// --- Selection + randomization ---------------------------------------

function filterMotions(
  distance: DistanceFilter,
  direction: DirectionFilter,
  noteContext: NoteContext,
  focus: Set<string> | null,
): Motion[] {
  return ALL_MOTIONS.filter(m => {
    if (noteContext === 'diatonic' && !m.isDiatonic) return false;
    if (distance !== 'all' && m.distance !== distance) return false;
    if (direction !== 'both' && m.direction !== direction) return false;
    if (focus && !focus.has(motionId(m))) return false;
    return true;
  });
}

function randomKey(): string {
  return KEYS[Math.floor(Math.random() * KEYS.length)];
}

// --- Component -------------------------------------------------------

interface Props {
  attempts: AttemptRecord[];
}

type RunState = 'idle' | 'cadence' | 'motion' | 'answering' | 'reveal';

interface Round {
  motion: Motion;
  key: string;
  startMidi: number;
  destMidi: number;
  /** Scaffold mode captured at round start. Locked for the lifetime of
   *  the round so toggling the scaffolding pill mid-play or mid-feedback
   *  can't retroactively rewrite the current question's interaction
   *  rules — changes apply forward via nextRound().
   *
   *  NOTE: scaffold is a structural / interaction setting (it changes
   *  which clicks are required and what highlights show), so it stays
   *  locked. Audio-only settings (listening mode, speed, instrument)
   *  are NOT captured on the round — they're read live on every
   *  playback/replay so the user can switch textures and immediately
   *  hear the change on the next replay click. */
  scaffold: Scaffolding;
  /** True when this round is a "challenge-yourself" re-attempt at a
   *  harder scaffolding tier after a correct answer. Practice reps do
   *  not write to the attempts table, don't update daily summary, and
   *  don't affect streaks or rolling-window fluency. */
  isPracticeRep: boolean;
}

interface Verdict {
  firstCorrect: boolean; // only meaningful in Minimal mode
  destCorrect: boolean;
  fullCredit: boolean;
}

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};
function midiToNote(midi: number, useFlats: boolean): string {
  const pc = ((midi % 12) + 12) % 12;
  return (useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc];
}
function keyPrefersFlats(key: string): boolean {
  return /b$/.test(key) || key === 'F';
}
function clickedToMidi(note: string, octave: number): number {
  return (octave + 1) * 12 + SEMITONE[note];
}

export default function ChordMotionTab({ attempts }: Props) {
  const [distance, setDistance] = useState<DistanceFilter>('all');
  const [direction, setDirection] = useState<DirectionFilter>('both');
  // Diatonic-only is the default starting point — chromatic motion
  // without a key anchor essentially collapses to random guessing for
  // the Minimal scaffold. Users opt into chromatic explicitly.
  const [noteContext, setNoteContext] = useState<NoteContext>('diatonic');
  // Listening texture — bass only / chords only / both layered. Default
  // "both" so motions feel like actual music; bass-only is the ear-
  // training-purist setting.
  const [listening, setListening] = useState<ListeningMode>('bass-chords');
  const [scaffold, setScaffold] = useState<Scaffolding>('full');
  const [focusKeys, setFocusKeys] = useState<string[]>([]);
  const [focusActive, setFocusActive] = useState(false);
  const [showFocusPanel, setShowFocusPanel] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [runState, setRunState] = useState<RunState>('idle');
  const [round, setRound] = useState<Round | null>(null);
  const [clickedStart, setClickedStart] = useState<number | null>(null);
  const [clickedDest, setClickedDest] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [showChallengeOptions, setShowChallengeOptions] = useState(false);

  const playbackRef = useRef<PlaybackHandle | null>(null);
  const timerRef = useRef<number | null>(null);

  // --- Prefs hydration / persistence ---------------------------------
  useEffect(() => {
    (async () => {
      const d = await getPref<DistanceFilter>(PREF_DISTANCE, 'all');
      const dir = await getPref<DirectionFilter>(PREF_DIRECTION, 'both');
      const nc = await getPref<NoteContext>(PREF_NOTE_CONTEXT, 'diatonic');
      const ls = await getPref<ListeningMode>(PREF_LISTENING, 'bass-chords');
      const sc = await getPref<Scaffolding>(PREF_SCAFFOLD, 'full');
      const focus = await getPref<string[]>(PREF_FOCUS, []);
      setDistance(d);
      setDirection(dir);
      setNoteContext(nc === 'chromatic' ? 'chromatic' : 'diatonic');
      setListening(ls === 'bass' || ls === 'chords' ? ls : 'bass-chords');
      setScaffold(sc);
      setFocusKeys(focus);
      setPrefsLoaded(true);
    })();
  }, []);
  useEffect(() => { if (prefsLoaded) setPref(PREF_DISTANCE, distance); }, [distance, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) setPref(PREF_DIRECTION, direction); }, [direction, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) setPref(PREF_NOTE_CONTEXT, noteContext); }, [noteContext, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) setPref(PREF_LISTENING, listening); }, [listening, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) setPref(PREF_SCAFFOLD, scaffold); }, [scaffold, prefsLoaded]);

  const speedFallback = defaultSpeed(MODULE_ID);
  const speed = useLiveQuery(
    async () => getPref<number>(speedPrefKey(MODULE_ID), speedFallback),
    [],
  ) ?? speedFallback;
  const speedRef = useRef(speed); speedRef.current = speed;
  // Listening mode tracked via a ref so every audio generation reads
  // its CURRENT value at the moment of the click, not whatever was
  // captured when the round started. This is what makes "flip the
  // dropdown, press replay" work between replays.
  const listeningRef = useRef(listening); listeningRef.current = listening;

  const activePool = useMemo(
    () => filterMotions(distance, direction, noteContext, focusActive ? new Set(focusKeys) : null),
    [distance, direction, noteContext, focusActive, focusKeys],
  );

  const focusProtected = focusActive && focusKeys.length < 4;

  // --- Playback control ----------------------------------------------
  const stopAll = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => () => stopAll(), []);

  const nextRound = async () => {
    stopAll();
    if (activePool.length === 0) return;
    const motion = activePool[Math.floor(Math.random() * activePool.length)];
    const key = randomKey();
    const startMidi = degreeMidi(key, motion.startLabel);
    const destMidi = degreeMidi(key, motion.destLabel);
    const r: Round = {
      motion,
      key,
      startMidi,
      destMidi,
      scaffold,
      isPracticeRep: false,
    };
    await launchRound(r);
  };

  // Shared launch sequence used by both fresh rounds and practice reps.
  // Clears pre-round UI state, then runs the cadence-or-straight-to-motion
  // flow based on the round's captured scaffold.
  const launchRound = async (r: Round) => {
    setRound(r);
    setClickedStart(null);
    setClickedDest(null);
    setVerdict(null);
    setShowChallengeOptions(false);

    if (r.scaffold === 'minimal') {
      // Motion plays cold; no cadence, no key name, no pre-highlight.
      setRunState('motion');
      await playMotion(r);
    } else {
      setRunState('cadence');
      const handle = await playCadence(r.key, { speedMultiplier: speedRef.current });
      playbackRef.current = handle;
      const dur = cadenceDurationSeconds(100, speedRef.current) * 1000 + 350;
      timerRef.current = window.setTimeout(async () => {
        playbackRef.current = null;
        timerRef.current = null;
        setRunState('motion');
        await playMotion(r);
      }, dur);
    }
  };

  // "Challenge yourself" entry: same motion/key as the round the user
  // just answered, but at a harder scaffold tier. Marked as a practice
  // rep so grade() skips the DB write path. Listening mode is read
  // live at playback time (via listeningRef), so whatever the user has
  // selected when they click "try again" is what they'll hear.
  const startPracticeRep = async (targetScaffold: Scaffolding) => {
    if (!round) return;
    stopAll();
    const rep: Round = {
      motion: round.motion,
      key: round.key,
      startMidi: round.startMidi,
      destMidi: round.destMidi,
      scaffold: targetScaffold,
      isPracticeRep: true,
    };
    await launchRound(rep);
  };

  const playMotion = async (r: Round) => {
    const startChord = chordVoice(r.key, r.motion.startLabel);
    const destChord = chordVoice(r.key, r.motion.destLabel);
    const gapMs = 1400;
    // Read listening live so each replay reflects the most recent
    // dropdown setting — even if the user toggles mid-gap between the
    // two chords. Question identity (key, motion) stays locked in the
    // round; texture is live. Speed + instrument are already live
    // via speedRef / the audio lib's global instrument.
    await playStep(startChord.root, startChord.intervals, listeningRef.current);
    timerRef.current = window.setTimeout(async () => {
      await playStep(destChord.root, destChord.intervals, listeningRef.current);
      timerRef.current = window.setTimeout(() => {
        setRunState('answering');
      }, gapMs);
    }, gapMs);
  };

  const replayMotion = async () => {
    if (!round) return;
    stopAll();
    await playMotion(round);
  };

  const playCadenceAlone = async () => {
    if (!round) return;
    stopAll();
    playbackRef.current = await playCadence(round.key, { speedMultiplier: speedRef.current });
  };

  const playTonic = async () => {
    if (!round) return;
    const tonicMidi = keyToRootMidi(round.key);
    const context = await ensureRunning();
    const now = context.currentTime + 0.03;
    playNote(midiToFreq(tonicMidi), now, 1.4, context, 0.3);
  };

  // --- Keyboard click handling ---------------------------------------
  const onKeyClick = (note: string, octave: number) => {
    if (!round || runState !== 'answering') return;
    const midi = clickedToMidi(note, octave);
    if (round.scaffold === 'minimal') {
      if (clickedStart === null) {
        setClickedStart(midi);
        return;
      }
      setClickedDest(midi);
      grade({ first: clickedStart, dest: midi });
      return;
    }
    setClickedDest(midi);
    grade({ first: round.startMidi, dest: midi });
  };

  const grade = async ({ first, dest }: { first: number; dest: number }) => {
    if (!round) return;
    const firstCorrect = first === round.startMidi;
    const destCorrect = dest === round.destMidi;
    const fullCredit = firstCorrect && destCorrect;

    setVerdict({ firstCorrect, destCorrect, fullCredit });
    setRunState('reveal');

    // Practice reps are reinforcement only — they never touch the DB,
    // don't update the daily summary, and don't feed streaks or rolling
    // fluency. Grading here just drives the on-screen feedback.
    if (round.isPracticeRep) return;

    const now = Date.now();
    const mId = motionId(round.motion);
    const excludeFlag = focusProtected ? { excludeFromFluency: true } : {};

    // Primary record — destination correctness drives fluency per
    // motion type. Mirrors the convention used by ChordProgressionsQuiz
    // (main record per item + sub-records for sub-skills). Scaffold is
    // read from the round snapshot so toggling the pill after playback
    // can't swap which mode gets credited.
    const records: AttemptRecord[] = [
      {
        moduleId: MODULE_ID,
        itemId: mId,
        correct: destCorrect,
        timestamp: now,
        ...excludeFlag,
      },
      {
        moduleId: MODULE_ID,
        itemId: `motion-mode:${round.scaffold}`,
        correct: fullCredit,
        timestamp: now + 1,
        ...excludeFlag,
      },
    ];
    // Minimal mode grades the starting-note guess too; separate item id
    // so the fluency tracker can show "am I good at identifying where
    // the first chord is?" distinct from "…where the second is?".
    if (round.scaffold === 'minimal') {
      records.push({
        moduleId: MODULE_ID,
        itemId: `motion-first:${mId.slice('motion:'.length)}`,
        correct: firstCorrect,
        timestamp: now + 2,
        ...excludeFlag,
      });
    }
    await bulkAddAttempts(records);
    await updateDailySummary(MODULE_ID);
  };

  // --- Focus panel plumbing ------------------------------------------
  // Focus panel is scoped by the current noteContext: when the user is
  // in diatonic-only mode we hide chromatic motions from the picker so
  // they don't accidentally pin a pool that their active scope will
  // never surface.
  const focusSections: SelectionSection[] = useMemo(() => {
    const pool = noteContext === 'diatonic'
      ? ALL_MOTIONS.filter(m => m.isDiatonic)
      : ALL_MOTIONS;
    const asc = pool.filter(m => m.direction === 'asc');
    const desc = pool.filter(m => m.direction === 'desc');
    const item = (m: Motion) => ({
      key: motionId(m),
      label: `${m.startLabel} → ${m.destLabel} (${INTERVAL_NAME[m.distance]})`,
    });
    return [
      { title: 'Ascending motions', items: asc.map(item) },
      { title: 'Descending motions', items: desc.map(item) },
    ];
  }, [noteContext]);

  const onStartFocus = async (keys: string[]) => {
    await setPref(PREF_FOCUS, keys);
    setFocusKeys(keys);
    setFocusActive(true);
    setShowFocusPanel(false);
  };

  // --- Rendering -----------------------------------------------------
  const useFlats = round ? keyPrefersFlats(round.key) : false;
  const tonicMidi = round ? keyToRootMidi(round.key) : 48;
  const startOctave = Math.floor(tonicMidi / 12) - 1; // C3 is midi 48 → octave 3

  const highlights: HighlightedNote[] = useMemo(() => {
    if (!round) return [];
    const out: HighlightedNote[] = [];
    // First-note highlight (blue) shown in Full/Partial before click,
    // and always shown on reveal so the user sees their anchor. Uses
    // the round's snapshot scaffold so toggling the live pill after
    // playback can't flip highlights on the current question.
    const showFirst = round.scaffold !== 'minimal' || runState === 'reveal' || clickedStart !== null;
    if (showFirst) {
      const note = midiToNote(round.startMidi, useFlats);
      const oct = Math.floor(round.startMidi / 12) - 1;
      out.push({ note, octave: oct, color: 'blue' });
    }
    if (runState === 'reveal' && verdict) {
      // Destination: green if correct, red overlaid + green reveal if wrong.
      const destNote = midiToNote(round.destMidi, useFlats);
      const destOct = Math.floor(round.destMidi / 12) - 1;
      out.push({ note: destNote, octave: destOct, color: 'green' });
      if (!verdict.destCorrect && clickedDest !== null) {
        out.push({
          note: midiToNote(clickedDest, useFlats),
          octave: Math.floor(clickedDest / 12) - 1,
          color: 'red',
        });
      }
      if (round.scaffold === 'minimal' && !verdict.firstCorrect && clickedStart !== null) {
        out.push({
          note: midiToNote(clickedStart, useFlats),
          octave: Math.floor(clickedStart / 12) - 1,
          color: 'red',
        });
      }
    }
    return out;
  }, [round, runState, verdict, useFlats, clickedStart, clickedDest]);


  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-medium tracking-tight">chord motion</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            hear a two-chord motion, pick the destination on the keyboard. works in all 12 keys.
          </p>
        </div>
      </div>

      {/* Controls — two groups: "what you'll hear" (audio-shaping
          scopes) vs "how it's presented" (interaction-shaping).
          Hidden while focus mode is active so the focus summary
          stands on its own; scope-editing happens in the focus panel. */}
      {!focusActive && (
        <>
          <section className="space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium text-center">
              what you'll hear
            </div>
            <div className="mx-auto max-w-md grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 items-center text-sm">
              <label htmlFor="motion-distance" className="text-neutral-500 justify-self-end">
                distance:
              </label>
              <select
                id="motion-distance"
                value={String(distance)}
                onChange={e => {
                  const v = e.target.value;
                  setDistance(v === 'all' ? 'all' : Number(v) as DistanceFilter);
                }}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
              >
                <option value="all">all distances</option>
                {([2, 3, 4, 5, 6, 7] as const).map(d => (
                  <option key={d} value={d}>{INTERVAL_NAME[d]}s only</option>
                ))}
              </select>

              <label htmlFor="motion-direction" className="text-neutral-500 justify-self-end">
                direction:
              </label>
              <select
                id="motion-direction"
                value={direction}
                onChange={e => setDirection(e.target.value as DirectionFilter)}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
              >
                <option value="both">both directions</option>
                <option value="asc">ascending only</option>
                <option value="desc">descending only</option>
              </select>

              <label htmlFor="motion-notes" className="text-neutral-500 justify-self-end">
                notes:
              </label>
              <select
                id="motion-notes"
                value={noteContext}
                onChange={e => setNoteContext(e.target.value as NoteContext)}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
                title={noteContext === 'diatonic'
                  ? 'only motions between scale degrees 1–7 of the major scale'
                  : 'allow any of the 12 chromatic positions (b2, b3, #4, b6, b7 included)'}
              >
                <option value="diatonic">diatonic only</option>
                <option value="chromatic">all motions (incl. chromatic)</option>
              </select>

              <label htmlFor="motion-listening" className="text-neutral-500 justify-self-end">
                listening:
              </label>
              <select
                id="motion-listening"
                value={listening}
                onChange={e => setListening(e.target.value as ListeningMode)}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
                title="which layers to sound: just the bass roots, full chord voicings, or both layered"
              >
                <option value="bass">bass only</option>
                <option value="chords">chords only</option>
                <option value="bass-chords">bass + chords</option>
              </select>
            </div>
          </section>

          <hr className="border-neutral-200 dark:border-neutral-800" />

          <section className="space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium text-center">
              how it's presented
            </div>
            <div className="mx-auto max-w-md grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 items-center text-sm">
              <label htmlFor="motion-scaffold" className="text-neutral-500 justify-self-end">
                scaffolding:
              </label>
              <select
                id="motion-scaffold"
                value={scaffold}
                onChange={e => setScaffold(e.target.value as Scaffolding)}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
                title={scaffoldTitle(scaffold)}
              >
                {(['full', 'partial', 'minimal'] as const).map(opt => (
                  <option key={opt} value={opt}>{SCAFFOLD_LABEL[opt]}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-neutral-500 text-center">{scaffoldTitle(scaffold)}</p>
          </section>

          <hr className="border-neutral-200 dark:border-neutral-800" />
        </>
      )}

      {/* Focus mode entry + current-scope summary. Lives below both
          groups because focus is a cross-cutting tool that operates
          across the entire scope. Also the only control still visible
          while focus mode is active. */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setShowFocusPanel(true)}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ⊞ focus on specific motions
        </button>
        <p className="text-[11px] text-neutral-500 inline-flex items-center gap-2 flex-wrap justify-center">
          <span className="text-neutral-500">current scope:</span>
          <span>
            {focusActive
              ? `focused practice — ${focusKeys.length} motion${focusKeys.length === 1 ? '' : 's'} selected`
              : `${noteContext === 'diatonic' ? 'diatonic' : 'all motions'} · ${direction === 'both' ? 'both directions' : direction === 'asc' ? 'ascending' : 'descending'} · ${distance === 'all' ? 'all distances' : INTERVAL_NAME[distance] + 's'} · ${listening === 'bass' ? 'bass only' : listening === 'chords' ? 'chords only' : 'bass + chords'} · ${activePool.length} motion${activePool.length === 1 ? '' : 's'}`}
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

      {/* Playback speed — kept outside the focus-gated block so users
          can still adjust tempo while drilling a focused set. */}
      <div className="flex justify-center">
        <SpeedControl moduleId={MODULE_ID} />
      </div>

      {focusProtected && <FluencyProtectionNotice />}

      {/* Key label (Full mode only) — reads the round's snapshot
          scaffold so the label can't flicker away if the user toggles
          the pill mid-question. */}
      {round && round.scaffold === 'full' && runState !== 'idle' && (
        <p className="text-center text-sm">
          in <span className="font-medium">{round.key} major</span>:
        </p>
      )}

      {/* Play / replay / cadence-or-tonic helpers */}
      <div className="flex flex-wrap items-start justify-center gap-3">
        {runState === 'idle' && (
          <button
            onClick={nextRound}
            disabled={activePool.length === 0}
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            play motion
          </button>
        )}
        {(runState === 'answering' || runState === 'reveal') && (
          <>
            <button
              onClick={replayMotion}
              className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
            >
              replay motion
            </button>
            {round && round.scaffold !== 'minimal' ? (
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={playCadenceAlone}
                  className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs hover:border-fluent hover:text-fluent"
                >
                  play cadence
                </button>
                <span className="text-[0.85rem] italic text-neutral-500">
                  re-establishes the key
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={playTonic}
                  className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs hover:border-fluent hover:text-fluent"
                >
                  play tonic
                </button>
                <span className="text-[0.85rem] italic text-neutral-500">
                  your reference note
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {runState === 'cadence' && (
        <p className="text-xs text-neutral-500 text-center italic">
          {round?.scaffold === 'full' ? 'establishing ' + round?.key + ' major…' : 'listen for the tonal centre…'}
        </p>
      )}

      {/* Keyboard input surface */}
      {round && (runState === 'answering' || runState === 'reveal' || runState === 'motion') && (
        <div className="flex flex-col items-center gap-2">
          <KeyboardVisual
            keySignature={`${round.key} major`}
            keyLabel={round.scaffold === 'full' ? `Key of ${round.key} major` : undefined}
            octaves={2}
            startOctave={startOctave}
            width={Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 48 : 520)}
            highlightedNotes={highlights}
            onKeyClick={runState === 'answering' ? onKeyClick : undefined}
          />
          {runState === 'answering' && round.scaffold === 'minimal' && (
            <p className="text-[11px] text-neutral-500 text-center">
              click the starting note first, then the destination
              {clickedStart !== null && (
                <> — starting note captured, now pick the destination</>
              )}
            </p>
          )}
          {runState === 'answering' && round.scaffold !== 'minimal' && (
            <p className="text-[11px] text-neutral-500 text-center">
              the blue key is the starting note — click where the motion goes
            </p>
          )}
        </div>
      )}

      {/* Feedback + association */}
      {runState === 'reveal' && round && verdict && (() => {
        // Interval quality is derived from the actual MIDI semitone
        // delta (B → D in D major = 9 st = major 6th), NOT the
        // scale-degree distance. That distinction is the whole point of
        // showing major / minor / perfect / tritone labels here.
        const semitones = Math.abs(round.destMidi - round.startMidi);
        const quality = intervalFromSemitones(semitones);
        const directionWord = round.motion.direction === 'asc' ? 'up' : 'down';
        const arrow = round.motion.direction === 'asc' ? '→' : '←';
        const directionLong = round.motion.direction === 'asc' ? 'ascending' : 'descending';
        const descriptionKey = intervalDescriptionKey(quality.id, directionLong);
        const defaultDescription = defaultIntervalDescription(quality.id, directionLong);
        // Degree labels + chord names mirror the physical keyboard:
        // ascending reads left→right (origin → destination), descending
        // reads right→left (destination ← origin). Arrow always points
        // from origin toward destination, matching the hand motion.
        const leftLabel = round.motion.direction === 'asc' ? round.motion.startLabel : round.motion.destLabel;
        const rightLabel = round.motion.direction === 'asc' ? round.motion.destLabel : round.motion.startLabel;
        const startVoice = chordVoice(round.key, round.motion.startLabel);
        const destVoice = chordVoice(round.key, round.motion.destLabel);
        const startName = chordDisplay(startVoice.root, startVoice.quality, MOTION_COMPLEXITY, { requiresDominant: false });
        const destName = chordDisplay(destVoice.root, destVoice.quality, MOTION_COMPLEXITY, { requiresDominant: false });
        const leftName = round.motion.direction === 'asc' ? startName : destName;
        const rightName = round.motion.direction === 'asc' ? destName : startName;
        // Harder scaffolds available for "challenge yourself" re-reps.
        // Offered after every answer — even on a wrong one — because the
        // correct destination is visible on the keyboard by then, so a
        // replay reinforces the *right* motion while it's fresh rather
        // than entrenching the wrong guess.
        const harderScaffolds: Scaffolding[] =
          round.scaffold === 'full' ? ['partial', 'minimal']
          : round.scaffold === 'partial' ? ['minimal']
          : [];
        const offerChallenge = harderScaffolds.length > 0;
        return (
          <>
            {/* Primary action row — sits directly under the keyboard so
                the user can always see "what's next" without scrolling.
                Feedback text lives below; readers can pause there or
                press ahead. */}
            <div className="flex flex-wrap gap-3 items-start justify-center">
              <button
                onClick={nextRound}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-sm font-medium hover:opacity-90"
              >
                next motion →
              </button>
              {offerChallenge && (
                <div className="flex flex-col items-start gap-1">
                  <button
                    onClick={() => setShowChallengeOptions(v => !v)}
                    aria-expanded={showChallengeOptions}
                    className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
                  >
                    try again with less scaffolding {showChallengeOptions ? '▴' : '▼'}
                  </button>
                  {showChallengeOptions && (
                    <div className="flex flex-col gap-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1 shadow-sm">
                      {harderScaffolds.map(m => (
                        <button
                          key={m}
                          onClick={() => startPracticeRep(m)}
                          className="text-xs px-3 py-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
                          title={scaffoldTitle(m)}
                        >
                          {SCAFFOLD_LABEL[m]} mode
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Feedback text block — everything the user might want to
                read *after* they've seen the action row above. */}
            <div className="rounded-lg border border-black/[0.07] p-4 space-y-3 text-sm">
              {round.isPracticeRep && (
                <div className="text-[11px] italic text-neutral-500">
                  practice rep — not tracked
                </div>
              )}
              <AnswerVerdict
                state={
                  verdict.fullCredit
                    ? 'correct'
                    : verdict.firstCorrect || verdict.destCorrect
                      ? 'partial'
                      : 'incorrect'
                }
              />
              <div className="space-y-1">
                <div className="text-base">
                  You went{' '}
                  <span className="font-medium font-mono">{leftLabel}</span>
                  <span aria-hidden className="text-neutral-400 mx-2">{arrow}</span>
                  <span className="font-medium font-mono">{rightLabel}</span>
                </div>
                <div className="text-sm font-mono">
                  <span className="font-medium">{leftName}</span>
                  <span aria-hidden className="text-neutral-400 mx-2">{arrow}</span>
                  <span className="font-medium">{rightName}</span>
                </div>
                <div className="text-sm">
                  a <span className="font-medium">{quality.name} {directionWord}</span>
                </div>
                <p className="text-[0.85rem] italic text-neutral-500 leading-snug">
                  {directionLong} {quality.name.toLowerCase()} often feels like {defaultDescription}
                </p>
              </div>
              {round.scaffold === 'minimal' && verdict && (
                <div className="text-xs text-neutral-500 space-y-1">
                  <div className="flex items-center gap-1.5">
                    starting note:
                    <AnswerVerdict
                      state={verdict.firstCorrect ? 'correct' : 'incorrect'}
                      size="sm"
                      label=""
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    destination:
                    <AnswerVerdict
                      state={verdict.destCorrect ? 'correct' : 'incorrect'}
                      size="sm"
                      label=""
                    />
                  </div>
                </div>
              )}
              <div className="rounded-md bg-neutral-100/70 dark:bg-neutral-800/60 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
                <span className="text-[10px] uppercase tracking-wide text-neutral-500 mr-1.5">
                  starter association
                </span>
                {starterAssociation(round.motion)}
              </div>
              <IntervalDescriptionEditor
                intervalKey={descriptionKey}
                defaultText={defaultDescription}
              />
              <AssociationsEditor
                progressionId={motionId(round.motion)}
                alwaysEditing
              />
              <button
                onClick={async () => {
                  await setPref(PREF_FOCUS, [motionId(round.motion)]);
                  setFocusKeys([motionId(round.motion)]);
                  setFocusActive(true);
                }}
                className="text-xs text-fluent hover:underline self-start"
              >
                practice this motion specifically → focus mode
              </button>
            </div>
          </>
        );
      })()}

      {showFocusPanel && (
        <ItemSelectionPanel
          title="focus on specific motions"
          description="drill only the scale-degree motions you pick. scope filters still apply inside your selection."
          note={focusActive ? (
            <div className="rounded-lg border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
              <span className="font-medium text-fluent">focus mode is active</span> with {focusKeys.length} motion{focusKeys.length === 1 ? '' : 's'}.{' '}
              <button
                type="button"
                onClick={() => { setFocusActive(false); setShowFocusPanel(false); }}
                className="text-fluent underline hover:opacity-80"
              >
                exit focus
              </button>{' '}
              to return to the full scope.
            </div>
          ) : undefined}
          sections={focusSections}
          initialSelection={focusKeys}
          onStart={onStartFocus}
          onCancel={() => setShowFocusPanel(false)}
          startLabel={focusActive ? 'update focus session' : 'start focus session'}
          suggestWeakSpots={() => suggestWeakMotions(attempts)}
          emptySuggestionMessage="you don't have enough motion attempts yet to find weak spots."
        />
      )}
    </section>
  );
}

// Suggest motions with weak tier signal based on this module's attempts.
// "Weak" here is simply motions with <60% accuracy in the rolling
// window — the fluency tracker uses the same data via computeTier, but
// this is a lightweight version that avoids pulling the full tier math
// into the focus panel.
function suggestWeakMotions(attempts: AttemptRecord[]): string[] {
  const byId = new Map<string, { correct: number; total: number; latest: number }>();
  for (const a of attempts) {
    if (!a.itemId.startsWith('motion:')) continue;
    if (a.excludeFromFluency) continue;
    const rec = byId.get(a.itemId) ?? { correct: 0, total: 0, latest: 0 };
    rec.total += 1;
    if (a.correct) rec.correct += 1;
    rec.latest = Math.max(rec.latest, a.timestamp);
    byId.set(a.itemId, rec);
  }
  const weak: string[] = [];
  byId.forEach((stat, id) => {
    if (stat.total >= 4 && stat.correct / stat.total < 0.6) weak.push(id);
  });
  // Sprinkle in a few untouched motions so "weak spots" always returns
  // something useful.
  if (weak.length < 6) {
    for (const m of ALL_MOTIONS) {
      const id = motionId(m);
      if (!byId.has(id) && !weak.includes(id)) {
        weak.push(id);
        if (weak.length >= 8) break;
      }
    }
  }
  return weak;
}

function scaffoldTitle(mode: Scaffolding): string {
  switch (mode) {
    case 'full': return 'full: key name shown, cadence primes the ear, starting note highlighted';
    case 'partial': return 'partial: cadence primes the ear, starting note highlighted, key hidden';
    case 'minimal': return 'minimal: no key, no cadence — click both the starting note AND the destination';
  }
}

// Kept exported for the fluency tracker to parse motion ids back into
// distance/direction when grouping stats by sub-dimension.
export { parseMotionId, ALL_MOTIONS, INTERVAL_NAME };

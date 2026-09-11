/**
 * Chord Motion, on the shared player.
 *
 * =====================================================================
 * IT HAD A PLAYER OF ITS OWN, AND EVERY PART OF IT WAS A SECOND ANSWER.
 *
 * A cadence lead-in nothing else played, three listening modes where
 * the rest of the app has two, a speed MULTIPLIER where the rest has a
 * tempo, chords placed in root position from their own degree, and a
 * "no octave crossing" rule invented to stop that placement sounding
 * wrong. A reader met a different instrument here from the one every
 * other ear card uses.
 *
 * Silas's walked prototype of 10 Sep 2026 moves it onto the shared
 * player: the card names two chords, `motionChords` voices them by the
 * app's own bass rule and nearest voicing, and whichever inversion
 * falls out of that is the inversion. The lead-in is the single low
 * tonic every other surface plays.
 *
 * =====================================================================
 * THE ANSWER IS A DEGREE FIRST AND A KEY SECOND.
 *
 * The board asked the reader to translate a degree they heard into a
 * letter, in a key the card named, before they could say what they
 * heard. Degrees are the default now and the piano is still there for
 * anyone who would rather point at it.
 *
 * WHAT MAY DIFFER ON THIS SURFACE is written into the shared player's
 * own list; the four differences are the key always being named, the
 * two answer modes, the Starting note aid and the absent Compare row.
 * =====================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { type AttemptRecord } from '../../../lib/db';
import { addAttempt } from '../../../lib/practiceWrites';
import { recordEngagement } from '../../../lib/spacingState';
import { answerTimingFields, type AskedContext } from '../../../lib/attemptTiming';
import { updateDailySummary } from '../../../lib/dailySummaries';
import { getPref, setPref } from '../../../lib/userPrefs';
import { FLUENCY_POOL_MINIMUM } from '../../../lib/fluencyPool';
import ItemSelectionPanel, { type SelectionSection } from '../../../components/ItemSelectionPanel';
import FluencyProtectionNotice from '../../../components/FluencyProtectionNotice';
import SharedPlayer from '../../../components/SharedPlayer';
import AidsFold from '../../../components/AidsFold';
import BuiltAnswerKeyboard from '../../../components/BuiltAnswerKeyboard';
import AssociationsEditor from './AssociationsEditor';
import IntervalDescriptionEditor from './IntervalDescriptionEditor';
import {
  defaultIntervalDescription,
  intervalDescriptionKey,
  intervalFromSemitones,
  moveWords,
} from './intervalQuality';
import { KEYS, keyToRootMidi } from './progressionTheory';
// THE POOL LIVES IN ITS OWN FILE. Two things outside this drill need
// to know which motions exist — the dashboard read layer and the
// ear-training orphan sweep — and neither should import a screen to
// find out. Re-exported below, unchanged, so no caller moved.
import {
  ALL_MOTIONS, INTERVAL_NAME, distanceLabel, motionId,
  type DegreeLabel, type Distance, type Motion,
} from './chordMotionPool';
import { bassMove, motionChords, type MotionRung } from './motionChords';
import {
  chipText, degreeChips, degreeOfPc, degreePc, motionArrow, motionName, sameChordAt,
} from './motionDegrees';
import { motionResult, type MotionResultTone } from './motionResult';
import { spellKey } from '../../../lib/spelling';
import { useSpelling } from '../../../lib/spellingPref';
import { useProgressionSpelling } from '../../../lib/progressionSpelling';
import { usePlayerSettings } from '../../../lib/player/usePlayerSettings';
import { playPanel } from '../../../lib/builtAnswers/play';
import type { PlayerChord } from '../../../lib/player/voices';
import type { PlaybackHandle } from '../../../lib/musicalPlayback';
import { inKeyFill, inKeyRing } from '../../../lib/player/inKeyColour';
import { heardFeel, isAided } from '../../../lib/earTraining/heardFeel';
import { FEEL_OPTIONS } from '../../../lib/fluencyScale';
import { statusColour, STATUS_FOR_FEEL } from '../../../lib/spacing/statusColour';
import type { KeyMark } from '../../../lib/builtAnswers/board';

const MODULE_ID = 'chord-progressions';

// --- Types + tables ---------------------------------------------------

/** 1 is Same Root, the first chip after All. */
/**
 * The Distance and Direction rows: which buckets are on.
 *
 * =====================================================================
 * MANY-CHOICE, AS THE SIGNED PROTOTYPE HAS IT. Silas's ruling of 10 Sep
 * 2026. The single-choice row — All, or one distance — was the shape of
 * the dropdown it replaced, not of the chip row he clicked through: every
 * chip its own on/off, all on by default, any subset, never none. So
 * "3rds and 6ths" is a thing a reader can ask for, and there is no All
 * chip because all-on IS all.
 * =====================================================================
 */
type DistanceSet = ReadonlySet<Distance>;
type DirectionSet = ReadonlySet<'asc' | 'desc'>;
const ALL_DISTANCES: ReadonlyArray<Distance> = [1, 2, 3, 4, 5, 6, 7];
const BOTH_DIRECTIONS: ReadonlyArray<'asc' | 'desc'> = ['asc', 'desc'];

/**
 * The saved rows, read from whichever shape is on disk.
 *
 * NEW KEYS, NOTHING REWRITTEN. The sets are saved under keys of their
 * own; the old single-choice keys (`'all'`, a number, `'both'`,
 * `'asc'`) are read once as the starting point when the new key has
 * never been written, and are otherwise left alone.
 */
function distancesFrom(saved: unknown, legacy: unknown): Set<Distance> {
  if (Array.isArray(saved)) {
    const ok = saved.filter((d): d is Distance => ALL_DISTANCES.includes(d as Distance));
    if (ok.length > 0) return new Set(ok);
  }
  if (typeof legacy === 'number' && ALL_DISTANCES.includes(legacy as Distance)) {
    return new Set([legacy as Distance]);
  }
  return new Set(ALL_DISTANCES);
}
function directionsFrom(saved: unknown, legacy: unknown): Set<'asc' | 'desc'> {
  if (Array.isArray(saved)) {
    const ok = saved.filter((d): d is 'asc' | 'desc' => d === 'asc' || d === 'desc');
    if (ok.length > 0) return new Set(ok);
  }
  if (legacy === 'asc' || legacy === 'desc') return new Set([legacy]);
  return new Set(BOTH_DIRECTIONS);
}

/** How long "Keep at least one." stays under its row. */
const KEEP_ONE_MS = 2500;

/** Silas's line, the same on both rows. */
function KeepOneLine({ row }: { row: 'distance' | 'direction' }) {
  return (
    <p
      role="status"
      data-testid={`motion-keep-one-${row}`}
      className="-mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400"
    >
      Keep at least one.
    </p>
  );
}

/** Toggle one chip, keeping at least one on: the last one cannot go. */
function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) {
    if (next.size > 1) next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}
type NoteContext = 'diatonic' | 'chromatic';
/** How the reader answers. Degrees is the question the card asks. */
type AnswerWith = 'degrees' | 'piano';
/** The one aid this surface has of its own. */
type StartingNote = 'find' | 'given';

// --- The starter line -----------------------------------------------

/**
 * The line a card shows before the reader has written their own.
 *
 * =====================================================================
 * THE SAME PLAIN LINE ON EVERY CARD. Silas's ruling of 10 Sep 2026.
 * Seventeen cards carried a hint written in code — "the authentic
 * cadence, but leaping up", "stepping down from home to the leading
 * tone" — words nobody had asked for, sitting where his own would go.
 * They are gone. Every card says what the bass does and invites him to
 * write the rest; an association he has saved is his, in its own table,
 * and is untouched.
 * =====================================================================
 */
function starterAssociation(m: Motion): string {
  // THE MOVE IN THE VERDICT'S WORDS, from the same formatter: "up a
  // major 2nd", never "a 2th up". A SAME-ROOT MOVE HAS NO MOVE to put
  // in front, so its line starts at "from".
  // THE MOTION IN FRONT, WITH ITS ARROW, from the one formatter; the
  // words after it are the line as ruled.
  return `${motionName(m)} · ${m.direction === 'same' ? '' : `${moveWords(m.semitones)} `}from the ${chipText(m.startLabel)} to the ${chipText(m.destLabel)} — sit inside this motion and see what feeling it leaves.`;
}

// --- Pref keys -------------------------------------------------------

/** The single-choice rows' keys, read only as a starting point. */
const PREF_DISTANCE_LEGACY = 'chordProgressionsMotionDistance';
const PREF_DIRECTION_LEGACY = 'chordProgressionsMotionDirection';
/** The many-choice rows, as arrays. */
const PREF_DISTANCES = 'chordProgressionsMotionDistances';
const PREF_DIRECTIONS = 'chordProgressionsMotionDirections';
const PREF_NOTE_CONTEXT = 'chordProgressionsMotionNoteContext';
const PREF_FOCUS = 'chordProgressionsMotionFocus';
const PREF_ANSWER_WITH = 'chordProgressionsMotionAnswerWith';
const PREF_STARTING_NOTE = 'chordProgressionsMotionStartingNote';

// --- Selection + randomization ---------------------------------------

/**
 * FOCUS OVERRIDES SCOPE - an explicit selection always wins.
 *
 * These used to compose: the scope filters applied on top of the focus
 * set, so a chromatic motion sent in while the default diatonic-only
 * scope was active produced an empty pool. Worse, the scope controls
 * are HIDDEN while focus is active, so there was no way to see the
 * cause or fix it from the screen - a drill that looks broken rather
 * than one that looks filtered.
 */
function filterMotions(
  distance: DistanceSet,
  direction: DirectionSet,
  noteContext: NoteContext,
  focus: Set<string> | null,
): Motion[] {
  if (focus) return ALL_MOTIONS.filter(m => focus.has(motionId(m)));
  return ALL_MOTIONS.filter(m => {
    if (noteContext === 'diatonic' && !m.isDiatonic) return false;
    if (!distance.has(m.distance)) return false;
    // A SAME-ROOT MOVE GOES NEITHER WAY, so neither Direction chip
    // excludes it — Up alone does not mean "not same root". Its own
    // chip is Same Root, on the Distance row.
    if (m.direction !== 'same' && !direction.has(m.direction)) return false;
    return true;
  });
}

function randomKey(): string {
  return KEYS[Math.floor(Math.random() * KEYS.length)];
}

/** The rung the reveal's ladder opens on. Seventh chords, like the
 *  Full Progression card — a motion is heard as two seventh chords. */
const DEFAULT_RUNG: MotionRung = 'seventh';

// --- Small pieces ----------------------------------------------------

const CHIP = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
const CHIP_OFF = 'border-black/10 dark:border-white/20 bg-black/[0.03] '
  + 'dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/10';
const CHIP_ON = 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 '
  + 'text-white dark:bg-neutral-100 dark:text-neutral-900';

function Chip({ on, onClick, children, testId, disabled }: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={testId}
      disabled={disabled === true}
      onClick={onClick}
      className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF} disabled:opacity-40 disabled:cursor-default`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * A chord on the verdict line, in its degree-of-the-key colour.
 *
 * THE SAME COLOUR THE REVEAL'S RING USES, from the lead sheet's degree
 * palette — the 1 green, the 4 purple, a flattened degree the darker
 * twin of its family. Silas's reason: "I just like to reemphasize the
 * color as I start to get to know these." So the degree and the chord
 * name that sit on the line both wear it, and nothing else on the line
 * does.
 *
 * THE FILL, NOT THE RING. The 1 has no ring on the board — a green ring
 * beside the root's green fill reads as a second fill — but on a line
 * of text there is no fill to confuse it with, so the 1 is green here.
 */
function InKeyToken({ pc, keyPc, testId, children }: {
  pc: number;
  keyPc: number;
  testId: string;
  children: React.ReactNode;
}) {
  const colour = inKeyFill(pc, keyPc);
  // A PILL, THE RESULT BOX'S BADGE TREATMENT: the degree's colour as the
  // text, on a pale tint of itself, with a faint edge — 10% and 30%, the
  // status palette's own `bg-x/10` and `border-x/30`. Silas's ruling of
  // 10 Sep 2026: the palette does not change, the pill is what makes the
  // 5's gold readable on white. All four tokens the same.
  return (
    <b
      data-testid={testId}
      className="inline-block rounded-md border px-1.5 py-px"
      style={colour === null ? undefined : {
        color: colour,
        backgroundColor: `${colour}1A`,
        borderColor: `${colour}4D`,
      }}
    >
      {children}
    </b>
  );
}

// --- Component -------------------------------------------------------

interface Props {
  /** `motion:1-b2-asc` keys to open in focus mode on - the format
   *  `motionId()` builds and `filterMotions` matches. Sent by a
   *  dashboard row tap. */
  initialFocusKeys?: readonly string[];
  attempts: AttemptRecord[];
}

type Phase = 'idle' | 'answering' | 'reveal';

/** What the reader answered, kept for the result line. */
interface Answered {
  startOk: boolean;
  destOk: boolean;
  /** Null when the start was given rather than answered. */
  yourStart: DegreeLabel | null;
  yourDest: DegreeLabel;
  /**
   * The rung the chips were drawn at when the answer was given.
   *
   * THE RESULT LINE STAYS WITH THE ANSWER. Moving the ladder to Triads
   * afterwards collapses ♯4ø and ♯4°7 into one ♯4°, and a line re-spelled
   * at the new rung would read "landed on the ♯4°, not the ♯4°".
   */
  rung: MotionRung;
}

/**
 * The result box's colour, from the status palette.
 *
 * HALF RIGHT WEARS WORKING ON IT, because that is what it rates — the
 * box and the rating word beside the verdict are one colour, not two
 * that happen to be near each other.
 */
const RESULT_TONE: Readonly<Record<MotionResultTone, string>> = {
  right: statusColour('fluent').badge,
  half: statusColour('developing').badge,
  wrong: statusColour('needs-work').badge,
};

interface Round {
  motion: Motion;
  key: string;
  keyPc: number;
  chords: PlayerChord[];
  rootPcs: number[];
  startPc: number;
  destPc: number;
}

export default function ChordMotionTab({ attempts, initialFocusKeys }: Props) {
  const [spelling] = useSpelling();
  const [rowSpelling] = useProgressionSpelling();
  const [settings, setSettings] = usePlayerSettings();

  const [distance, setDistance] = useState<DistanceSet>(() => new Set(ALL_DISTANCES));
  const [direction, setDirection] = useState<DirectionSet>(() => new Set(BOTH_DIRECTIONS));
  // =====================================================================
  // THE LAST CHIP SAYS WHY IT STAYS ON. Silas's ruling of 10 Sep 2026.
  // A tap that does nothing reads as a broken control, so the row that
  // refused shows his line under it for a moment: "Keep at least one."
  // =====================================================================
  const [keepOne, setKeepOne] = useState<'distance' | 'direction' | null>(null);
  useEffect(() => {
    if (keepOne === null) return;
    const id = window.setTimeout(() => setKeepOne(null), KEEP_ONE_MS);
    return () => window.clearTimeout(id);
  }, [keepOne]);
  /** Toggle a chip — or, where it is the only one on, say so. */
  const toggleRow = <T,>(
    row: 'distance' | 'direction', set: ReadonlySet<T>, item: T, save: (next: Set<T>) => void,
  ) => {
    if (set.size === 1 && set.has(item)) { setKeepOne(row); return; }
    save(toggled(set, item));
  };
  const [noteContext, setNoteContext] = useState<NoteContext>('diatonic');
  const [answerWith, setAnswerWith] = useState<AnswerWith>('degrees');
  const [startingNote, setStartingNote] = useState<StartingNote>('find');
  const [focusKeys, setFocusKeys] = useState<string[]>(
    initialFocusKeys ? [...initialFocusKeys] : [],
  );
  const [focusActive, setFocusActive] = useState(
    (initialFocusKeys?.length ?? 0) > 0,
  );
  const [showFocusPanel, setShowFocusPanel] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState<Round | null>(null);
  const [rung, setRung] = useState<MotionRung>(DEFAULT_RUNG);
  const [pickedStart, setPickedStart] = useState<DegreeLabel | null>(null);
  const [pickedDest, setPickedDest] = useState<DegreeLabel | null>(null);
  const [tappedStart, setTappedStart] = useState<number | null>(null);
  const [feel, setFeel] = useState<1 | 2 | 3 | 4 | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [lit, setLit] = useState<number | null>(null);

  const replays = useRef(0);
  const asked = useRef<AskedContext | null>(null);
  const handle = useRef<PlaybackHandle | null>(null);

  // --- Prefs ---------------------------------------------------------
  useEffect(() => {
    (async () => {
      setDistance(distancesFrom(
        await getPref<unknown>(PREF_DISTANCES, null),
        await getPref<unknown>(PREF_DISTANCE_LEGACY, 'all'),
      ));
      setDirection(directionsFrom(
        await getPref<unknown>(PREF_DIRECTIONS, null),
        await getPref<unknown>(PREF_DIRECTION_LEGACY, 'both'),
      ));
      const nc = await getPref<NoteContext>(PREF_NOTE_CONTEXT, 'diatonic');
      setNoteContext(nc === 'chromatic' ? 'chromatic' : 'diatonic');
      const aw = await getPref<AnswerWith>(PREF_ANSWER_WITH, 'degrees');
      setAnswerWith(aw === 'piano' ? 'piano' : 'degrees');
      const sn = await getPref<StartingNote>(PREF_STARTING_NOTE, 'find');
      setStartingNote(sn === 'given' ? 'given' : 'find');
      const focus = await getPref<string[]>(PREF_FOCUS, []);
      // NOT when the dashboard sent a pool — hydrating over it would
      // replace what was just asked for, one tick after landing on it.
      if ((initialFocusKeys?.length ?? 0) === 0) setFocusKeys(focus);
      setPrefsLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (prefsLoaded) void setPref(PREF_DISTANCES, ALL_DISTANCES.filter(d => distance.has(d)));
  }, [distance, prefsLoaded]);
  useEffect(() => {
    if (prefsLoaded) void setPref(PREF_DIRECTIONS, BOTH_DIRECTIONS.filter(d => direction.has(d)));
  }, [direction, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) void setPref(PREF_NOTE_CONTEXT, noteContext); }, [noteContext, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) void setPref(PREF_ANSWER_WITH, answerWith); }, [answerWith, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) void setPref(PREF_STARTING_NOTE, startingNote); }, [startingNote, prefsLoaded]);

  // Leaving the tab mid-playback leaves nothing ringing.
  useEffect(() => () => { handle.current?.stop(); }, []);

  const activePool = useMemo(
    () => filterMotions(distance, direction, noteContext,
      focusActive && focusKeys.length > 0 ? new Set(focusKeys) : null),
    [distance, direction, noteContext, focusActive, focusKeys],
  );

  // Counted over DISTINCT keys, because that is what the pool is built
  // from — see `drillFilter`'s own note on why a raw length lies.
  const focusPoolSize = new Set(focusKeys).size;
  const focusProtected = focusActive && focusPoolSize < FLUENCY_POOL_MINIMUM;

  // --- Playback ------------------------------------------------------

  /** Sound the round: the key's low tonic, then the two chords. */
  const play = async (r: Round, revealed: boolean) => {
    handle.current?.stop();
    setLit(null);
    const h = await playPanel(r.chords, settings, {
      orientPc: r.keyPc,
      loop: 1,
      // THE LEAD-IN LIGHTS ITS OWN KEY and then each chord lights as it
      // strikes — `onStep` fires at the moment a step sounds, and -1 is
      // the orienting tonic.
      onStep: (i: number) => setLit(i < 0 ? null : i),
    });
    handle.current = h;
    if (!revealed) {
      asked.current = {
        playbackEndsAt: Date.now(),
        playbackBpm: settings.bpm,
      };
    }
  };

  const deal = async () => {
    const pool = activePool;
    if (pool.length === 0) return;
    const motion = pool[Math.floor(Math.random() * pool.length)];
    const key = randomKey();
    const keyPc = ((keyToRootMidi(key) % 12) + 12) % 12;
    const { chords, rootPcs } = motionChords(
      keyPc, motion.startLabel, motion.destLabel, DEFAULT_RUNG, spelling,
      motion.direction, rowSpelling,
    );
    const next: Round = {
      motion,
      key,
      keyPc,
      chords,
      rootPcs,
      startPc: degreePc(keyPc, motion.startLabel),
      destPc: degreePc(keyPc, motion.destLabel),
    };
    replays.current = 0;
    setRound(next);
    setPhase('answering');
    setPickedStart(null);
    setPickedDest(null);
    setTappedStart(null);
    setFeel(null);
    setAnswered(null);
    setRung(DEFAULT_RUNG);
    await play(next, false);
  };

  const replay = async () => {
    if (round === null || phase !== 'answering') return;
    replays.current += 1;
    await play(round, false);
  };

  /** Re-voice at a new thickness. Silently — the panel's Hear it plays. */
  const setThickness = (next: MotionRung) => {
    setRung(next);
    if (round === null) return;
    const { chords, rootPcs } = motionChords(
      round.keyPc, round.motion.startLabel, round.motion.destLabel, next, spelling,
      round.motion.direction, rowSpelling,
    );
    setRound({ ...round, chords, rootPcs });
  };

  // --- Answering -----------------------------------------------------

  const aided = isAided(settings) || startingNote === 'given';

  /**
   * Grade an answer.
   *
   * DEGREES ARE GRADED AS CHORDS, KEYS AS PITCHES. A degree chip names a
   * quality as well as a root, so answering 4 when it was 4m is wrong on
   * that half — right degree, wrong chord — and the whole answer is half
   * right. A piano key names a pitch and nothing else, so it can only
   * be asked whether the root was right. `byPitch` says which.
   */
  const submit = async (
    yourStart: DegreeLabel | null,
    yourDest: DegreeLabel,
    byPitch: boolean,
  ) => {
    const r = round;
    if (r === null) return;
    handle.current?.stop();
    // At the rung the chips were drawn at — see `sameChordAt` for why a
    // Triads row answers both ♯4 sevenths with one chip.
    const same = (yours: DegreeLabel, asked: DegreeLabel) => (byPitch
      ? degreePc(r.keyPc, yours) === degreePc(r.keyPc, asked)
      : sameChordAt(yours, asked, rung));
    // THE STARTING NOTE IS GIVEN OR IT IS ANSWERED. With the aid on the
    // reader was told it, so it cannot be wrong; the rating already
    // carries the cost of having been told.
    const startOk = startingNote === 'given'
      || (yourStart !== null && same(yourStart, r.motion.startLabel));
    const destOk = same(yourDest, r.motion.destLabel);
    const f = heardFeel({
      // AT LEAST ONE RIGHT is the first question here: neither right is
      // Struggled, one right is Working on it, both right is graded on
      // the aid and the replays. Silas's ruling of 10 Sep 2026.
      firstRight: startOk || destOk,
      secondRight: startOk && destOk,
      replays: replays.current,
      aided,
    });
    setFeel(f);
    setAnswered({ startOk, destOk, yourStart, yourDest, rung });
    setPhase('reveal');
    // NOTHING PLAYS ON THE REVEAL. The shared panel owns the transport
    // from here — its Hear it, its Pause, its Resume — and a second
    // player starting underneath it would be the thing that component
    // exists to prevent. The board paints the chord the move landed on
    // and waits, which is the prototype's own reveal.
    setLit(1);

    const now = Date.now();
    await addAttempt({
      moduleId: MODULE_ID,
      itemId: motionId(r.motion),
      correct: startOk && destOk,
      timestamp: now,
      feelRating: f,
      replays: replays.current,
      ...(aided ? { aided: true } : {}),
      ...(focusProtected ? { excludeFromFluency: true } : {}),
      ...answerTimingFields(asked.current, now),
    });
    await recordEngagement({
      itemRef: motionId(r.motion),
      moduleRef: MODULE_ID,
      signal: { kind: 'attempt', correct: startOk && destOk, feel: f },
    });
    await updateDailySummary(MODULE_ID);
  };

  const onTapKey = (midi: number) => {
    if (phase !== 'answering' || round === null) return;
    const pc = ((midi % 12) + 12) % 12;
    if (startingNote === 'find' && tappedStart === null) {
      setTappedStart(pc);
      return;
    }
    // THE ANSWER IS KEPT AS DEGREES whichever way it was given. A piano
    // tap is a pitch class, and the line names it as the degree it is.
    void submit(
      startingNote === 'given' || tappedStart === null
        ? null : degreeOfPc(round.keyPc, tappedStart),
      degreeOfPc(round.keyPc, pc),
      true,
    );
  };

  const canSubmit = pickedDest !== null
    && (startingNote === 'given' || pickedStart !== null);

  // --- The reveal's ring and marks ------------------------------------

  // THE BOARD OPENS ON WHERE THE MOVE LANDED, which is the answer the
  // card was asking for; once something plays it follows the sound.
  const sounding = round === null
    ? null
    : round.chords[lit ?? 1] ?? round.chords[0];
  const ring = round === null || sounding == null
    ? null
    : inKeyRing(sounding.rootPc, round.keyPc);

  /**
   * The unlit board, for Piano keys before the answer.
   *
   * TAPS ONLY, NO FILLS. The question is which degree the move landed
   * on; a board that lit anything would answer it.
   */
  const answerMarks: ReadonlyMap<number, KeyMark> = useMemo(() => {
    const marks = new Map<number, KeyMark>();
    if (round === null) return marks;
    if (startingNote === 'given') {
      // GIVEN LIGHTS THE FIRST CHORD'S ROOT IN ITS IN-THE-KEY COLOUR,
      // from the lead sheet's degree palette rather than a bespoke blue.
      // A FILL AND NOT A RING, which is the prototype's own move: before
      // the answer the board carries no interval fills, so there is
      // nothing for the colour to be mistaken for, and a fill is what
      // reads as "here is the note" rather than as an annotation.
      const given = inKeyFill(round.startPc, round.keyPc);
      if (given !== null) {
        for (let midi = 36; midi <= 84; midi += 1) {
          if (((midi % 12) + 12) % 12 === round.startPc) {
            marks.set(midi, { fill: given });
          }
        }
      }
    }
    if (tappedStart !== null) {
      for (let midi = 36; midi <= 84; midi += 1) {
        if (((midi % 12) + 12) % 12 === tappedStart) {
          marks.set(midi, { ...marks.get(midi), pressed: true });
        }
      }
    }
    return marks;
  }, [round, startingNote, tappedStart]);

  // --- Focus ---------------------------------------------------------

  const focusSections: SelectionSection[] = useMemo(() => ([
    {
      // UP AND DOWN ARE THE BASS'S, the words the Direction chips use:
      // 1 → 6m up a major 6th is here, its minor-3rd-down twin below.
      title: 'Up',
      items: ALL_MOTIONS.filter(m => m.direction === 'asc')
        .map(m => ({ key: motionId(m), label: motionName(m, rowSpelling) })),
    },
    {
      title: 'Down',
      items: ALL_MOTIONS.filter(m => m.direction === 'desc')
        .map(m => ({ key: motionId(m), label: motionName(m, rowSpelling) })),
    },
    {
      // Neither ascending nor descending, so a section of their own,
      // named as the Distance chip names them.
      title: 'Same Root',
      items: ALL_MOTIONS.filter(m => m.direction === 'same')
        .map(m => ({ key: motionId(m), label: motionName(m, rowSpelling) })),
    },
  ]), [rowSpelling]);

  const onStartFocus = async (keys: string[]) => {
    setFocusKeys(keys);
    setFocusActive(keys.length > 0);
    setShowFocusPanel(false);
    await setPref(PREF_FOCUS, keys);
  };

  // --- Render --------------------------------------------------------

  // THE CHIPS COVER WHATEVER THE POOL CAN DEAL. Note context decides
  // the pool, except under focus, which overrides it — so a chromatic
  // motion sent from the dashboard while Note context says diatonic
  // would be dealt with no chip that could answer it. Read from the
  // POOL rather than from the card on screen, so a longer chip row
  // never gives away that this card is chromatic.
  const chips = degreeChips(
    noteContext === 'chromatic' || activePool.some(m => !m.isDiatonic),
    rowSpelling,
    // THE CARD'S RUNG, so a diminished chip spells as the chords sound
    // — ø on a seventh-chord row. See `chipText`.
    rung,
  );
  const feelWord = feel === null
    ? null
    : FEEL_OPTIONS.find(o => o.feel === feel)?.label ?? '';
  const feelClass = feel === null
    ? '' : statusColour(STATUS_FOR_FEEL[feel]).text;
  const result = round === null || answered === null
    ? null
    : motionResult({
      arrow: motionArrow(round.motion),
      startOk: answered.startOk,
      destOk: answered.destOk,
      start: chipText(round.motion.startLabel, rowSpelling, answered.rung),
      dest: chipText(round.motion.destLabel, rowSpelling, answered.rung),
      yourStart: answered.yourStart === null
        ? null : chipText(answered.yourStart, rowSpelling, answered.rung),
      yourDest: chipText(answered.yourDest, rowSpelling, answered.rung),
    });

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-5">
      <div>
        <h2 className="text-base sm:text-lg font-medium tracking-tight">Chord Motion</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          hear two chords move, and say where the move landed. works in all 12 keys.
        </p>
      </div>

      {focusProtected && <FluencyProtectionNotice />}

      {/* WHAT IS IN PLAY — the three scope filters, which were three
          dropdowns above the drill. A fold, because they are settings
          rather than part of the question. */}
      <details
        data-testid="motion-filters"
        className="rounded-lg border border-dashed border-black/10 dark:border-white/15 px-3 py-2"
      >
        <summary className="cursor-pointer text-xs text-neutral-500 dark:text-neutral-400">
          What is in play
        </summary>
        <div className="space-y-3 pt-2">
          <Row label="Distance">
            {ALL_DISTANCES.map(d => (
              <Chip
                key={d}
                on={distance.has(d)}
                testId={`motion-dist-${d}`}
                onClick={() => toggleRow('distance', distance, d, setDistance)}
              >
                {d === 1 ? 'Same Root' : INTERVAL_NAME[d]}
              </Chip>
            ))}
          </Row>
          {keepOne === 'distance' && <KeepOneLine row="distance" />}
          <Row label="Direction">
            {([['asc', 'Up'], ['desc', 'Down']] as const).map(([d, t]) => (
              <Chip
                key={d}
                on={direction.has(d)}
                testId={`motion-dir-${d}`}
                onClick={() => toggleRow('direction', direction, d, setDirection)}
              >
                {t}
              </Chip>
            ))}
          </Row>
          {keepOne === 'direction' && <KeepOneLine row="direction" />}
          <Row label="Note context">
            {([['diatonic', 'Diatonic only'], ['chromatic', 'Chromatic too']] as const)
              .map(([c, t]) => (
                <Chip
                  key={c}
                  on={noteContext === c}
                  testId={`motion-ctx-${c}`}
                  onClick={() => setNoteContext(c)}
                >
                  {t}
                </Chip>
              ))}
          </Row>
          <p className="text-[11px] text-neutral-500">
            Everything is on by default. Narrow it here; nothing is ever locked
            when you open the drill yourself. Tiers only steer what a practice
            session hands you.
          </p>
        </div>
      </details>

      {phase === 'idle' && (
        <button
          onClick={() => { void deal(); }}
          data-testid="play-motion"
          disabled={activePool.length === 0}
          className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          play motion
        </button>
      )}

      {round !== null && phase !== 'idle' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {/* PLAY AGAIN BELONGS TO THE QUESTION, NOT TO THE ANSWER. On
                the reveal the shared panel's Hear it is the transport,
                and a second button driving a second handle would leave
                its Pause with nothing to pause. */}
            {phase === 'answering' && (
              <button
                onClick={() => { void replay(); }}
                data-testid="motion-replay"
                className={`${CHIP} ${CHIP_ON}`}
              >
                Play again
              </button>
            )}
            <button
              onClick={() => { void deal(); }}
              data-testid="motion-next"
              className={`${CHIP} ${CHIP_OFF}`}
            >
              Next card
            </button>
          </div>

          {/* THE KEY IS ALWAYS NAMED. The question is which degree, not
              which letter — one of this surface's allowed differences. */}
          <p className="text-sm font-medium" data-testid="motion-key-name">
            Key of {spellKey(round.key, spelling)} major
          </p>

          {phase === 'answering' && (
            <AidsFold
              settings={settings}
              onSettings={setSettings}
              extra={(
                <Row label="Starting note">
                  <Chip
                    on={startingNote === 'find'}
                    testId="motion-start-find"
                    onClick={() => setStartingNote('find')}
                  >
                    You find it
                  </Chip>
                  <Chip
                    on={startingNote === 'given'}
                    testId="motion-start-given"
                    onClick={() => setStartingNote('given')}
                  >
                    Given (lower rating)
                  </Chip>
                </Row>
              )}
            />
          )}

          <Row label="Answer with">
            <Chip
              on={answerWith === 'degrees'}
              testId="motion-answer-degrees"
              onClick={() => setAnswerWith('degrees')}
            >
              Degrees
            </Chip>
            <Chip
              on={answerWith === 'piano'}
              testId="motion-answer-piano"
              onClick={() => setAnswerWith('piano')}
            >
              Piano keys
            </Chip>
          </Row>

          {phase === 'answering' && answerWith === 'degrees' && (
            <div className="space-y-3" data-testid="motion-degrees">
              {startingNote === 'find' && (
                <Row label="Started on">
                  {chips.map(c => (
                    <Chip
                      key={c.label}
                      on={pickedStart === c.label}
                      testId={`motion-start-${c.label}`}
                      onClick={() => setPickedStart(c.label)}
                    >
                      {c.text}
                    </Chip>
                  ))}
                </Row>
              )}
              <Row label="Landed on">
                {chips.map(c => (
                  <Chip
                    key={c.label}
                    on={pickedDest === c.label}
                    testId={`motion-dest-${c.label}`}
                    onClick={() => setPickedDest(c.label)}
                  >
                    {c.text}
                  </Chip>
                ))}
              </Row>
              <button
                type="button"
                data-testid="motion-submit"
                disabled={!canSubmit}
                onClick={() => {
                  if (round === null || pickedDest === null) return;
                  void submit(
                    startingNote === 'given' ? null : pickedStart,
                    pickedDest,
                    false,
                  );
                }}
                className={`${CHIP} ${CHIP_ON} disabled:opacity-40 disabled:cursor-default`}
              >
                Submit
              </button>
            </div>
          )}

          {phase === 'answering' && answerWith === 'piano' && (
            <div className="space-y-1.5" data-testid="motion-piano">
              <BuiltAnswerKeyboard
                marks={answerMarks}
                onTap={onTapKey}
                label="Where the move landed"
              />
              <p className="text-[11px] text-neutral-500">
                {startingNote === 'given'
                  ? 'The ringed key is where it started. Tap where the move landed.'
                  : tappedStart === null
                    ? 'Tap the note it started on, then the note it landed on.'
                    : 'Now tap the note it landed on.'}
              </p>
            </div>
          )}

          {phase === 'reveal' && (
            <div className="space-y-3">
              {/* WHICH HALF WAS RIGHT, in the chips' own words. */}
              {result !== null && (
                <p
                  data-testid="motion-result"
                  data-tone={result.tone}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${RESULT_TONE[result.tone]}`}
                >
                  {result.text}
                </p>
              )}

              {/* THE VERDICT, with the rating word in its own status
                  colour — the same colour that word wears on every grid
                  in the app. The four chord tokens wear their degree's
                  in-the-key colour; the arrows, the distance and the
                  dots stay plain. */}
              <p className="text-sm" data-testid="motion-verdict">
                <span className="font-mono">
                  <InKeyToken pc={round.startPc} keyPc={round.keyPc} testId="verdict-start">
                    {chipText(round.motion.startLabel, rowSpelling, rung)}
                  </InKeyToken>
                  {` ${motionArrow(round.motion)} `}
                  <InKeyToken pc={round.destPc} keyPc={round.keyPc} testId="verdict-dest">
                    {chipText(round.motion.destLabel, rowSpelling, rung)}
                  </InKeyToken>
                </span>
                <span className="text-neutral-400"> · </span>
                {/* WHAT THE BASS DID, as it sounded — see `bassMove`.
                    Not the pool's scale-position direction. */}
                <span data-testid="verdict-bass-move">
                  {bassMove(round.chords, settings)?.words ?? ''}
                </span>
                <span className="text-neutral-400"> · </span>
                <span className="font-mono">
                  <InKeyToken pc={round.startPc} keyPc={round.keyPc} testId="verdict-start-chord">
                    {round.chords[0].name}
                  </InKeyToken>
                  {` ${motionArrow(round.motion)} `}
                  <InKeyToken pc={round.destPc} keyPc={round.keyPc} testId="verdict-dest-chord">
                    {round.chords[1].name}
                  </InKeyToken>
                </span>
                {feelWord !== null && (
                  <span className={`ml-2 font-semibold ${feelClass}`} data-testid="motion-feel">
                    {feelWord}
                  </span>
                )}
              </p>

              <SharedPlayer
                chords={round.chords}
                orientPc={round.keyPc}
                settings={settings}
                onSettings={setSettings}
                showListen
                startLit={1}
                ring={ring}
                thickness={{
                  value: rung,
                  onChange: r => { setThickness(r as MotionRung); },
                  // THE SHARED LADDER, Triads first — the rung every other
                  // surface with a Triads row offers. Seventh chords is
                  // still where a card opens.
                  rungs: ['triads', 'guide', 'seventh', 'full'],
                }}
                onStep={i => setLit(i < 0 ? null : i)}
              />

              <div className="space-y-3 rounded-lg border border-black/[0.07] p-3 text-sm">
                <div className="rounded-md bg-neutral-100/70 dark:bg-neutral-800/60 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-500 mr-1.5">
                    starter association
                  </span>
                  {starterAssociation(round.motion)}
                </div>
                <AssociationsEditor progressionId={motionId(round.motion)} alwaysEditing />
                {/* NO INTERVAL TO DESCRIBE on a move that keeps its root:
                    the note would be filed under a unison. */}
                {round.motion.direction !== 'same' && (() => {
                  // THE CARD'S INTERVAL AND DIRECTION, which is what
                  // sounded: 1 → 6m down a minor 3rd opens the note for
                  // a descending minor 3rd, not an ascending major 6th.
                  const quality = intervalFromSemitones(round.motion.semitones);
                  const long = round.motion.direction === 'asc'
                    ? 'ascending' : 'descending';
                  return (
                    <IntervalDescriptionEditor
                      intervalKey={intervalDescriptionKey(quality.id, long)}
                      defaultText={defaultIntervalDescription(quality.id, long)}
                    />
                  );
                })()}
                <button
                  onClick={async () => {
                    await setPref(PREF_FOCUS, [motionId(round.motion)]);
                    setFocusKeys([motionId(round.motion)]);
                    setFocusActive(true);
                  }}
                  className="text-xs text-fluent hover:underline self-start"
                >
                  Practice This Motion Specifically → Focus Mode
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Focus mode entry + current-scope summary. Unchanged: the
          separate panel and its scope line are exactly as they were. */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setShowFocusPanel(true)}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ⊞ Focus on Specific Motions
        </button>
        <p className="text-[11px] text-neutral-500 inline-flex items-center gap-2 flex-wrap justify-center">
          <span className="text-neutral-500">Current Scope:</span>
          <span>
            {focusActive
              ? `focused practice — ${focusPoolSize} motion${focusPoolSize === 1 ? '' : 's'} selected`
              : `${noteContext === 'diatonic' ? 'diatonic' : 'all motions'} · ${direction.size === 2 ? 'both directions' : direction.has('asc') ? 'ascending' : 'descending'} · ${distance.size === ALL_DISTANCES.length ? 'all distances' : ALL_DISTANCES.filter(d => distance.has(d)).map(d => distanceLabel(d).toLowerCase()).join(', ')} · ${activePool.length} motion${activePool.length === 1 ? '' : 's'}`}
          </span>
          {focusActive && (
            <button
              onClick={() => setFocusActive(false)}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline"
            >
              Exit Focus
            </button>
          )}
        </p>
      </div>

      {showFocusPanel && (
        <ItemSelectionPanel
          title="Focus on Specific Motions"
          description="drill only the scale-degree motions you pick. scope filters still apply inside your selection."
          note={focusActive ? (
            <div className="rounded-lg border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
              <span className="font-medium text-fluent">focus mode is active</span> with {focusPoolSize} motion{focusPoolSize === 1 ? '' : 's'}.{' '}
              <button
                type="button"
                onClick={() => { setFocusActive(false); setShowFocusPanel(false); }}
                className="text-fluent underline hover:opacity-80"
              >
                Exit Focus
              </button>{' '}
              to return to the full scope.
            </div>
          ) : undefined}
          sections={focusSections}
          initialSelection={focusKeys}
          onStart={keys => { void onStartFocus(keys); }}
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
  const byId = new Map<string, { correct: number; total: number }>();
  for (const a of attempts) {
    if (!a.itemId.startsWith('motion:')) continue;
    if (a.excludeFromFluency) continue;
    const rec = byId.get(a.itemId) ?? { correct: 0, total: 0 };
    rec.total += 1;
    if (a.correct) rec.correct += 1;
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

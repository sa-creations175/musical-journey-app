/**
 * What opens when you press a square in the chord grid.
 *
 * =====================================================================
 * ONE PANEL, ONE CLOCK, AND FIVE STEPS RUNNING INSIDE IT.
 *
 *   choose    — Practice or Test. Nothing preselected. The clock
 *               starts either way, which is why the question is asked
 *               BEFORE the work rather than after it.
 *   session   — the clock, the drills so far, and what to do next.
 *   setup     — style, length, and the metronome.
 *   drilling  — a countdown inside the session clock.
 *   drillrate — how that one went. Optional in practice, required in
 *               a test.
 *
 * THE SESSION CLOCK NEVER PAUSES, including on the rating screen. See
 * `sessionClock` for why.
 *
 * =====================================================================
 * WHEN THE TWO MODES WRITE, AND WHY THEY DIFFER.
 *
 * PRACTICE writes per drill, as each one is rated or skipped. A
 * practice sitting has no verdict of its own to wait for — each drill
 * is its own rep, and the band is the lowest of the last three of
 * them, capped at Developing.
 *
 * A TEST writes all three at once, at Save. The claim a test makes is
 * about the three together — the lowest of them sets the band — and
 * three separate writes would let a half-finished test sit in the
 * history looking like evidence. Nothing is written until the third
 * rep is rated and Save is pressed.
 * =====================================================================
 *
 * Commit 2 of 4. Still absent: the other three surfaces, the practice
 * log, and any Settings UI.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Modal from '../../../components/Modal';
import DrillMetronomeSetup from '../DrillMetronomeSetup';
import { useMetronomeState } from '../../../lib/useMetronome';
import MetronomeControl from '../../../components/MetronomeControl';
import { metronome } from '../../../lib/metronome';
import { FEEL_CARD_OPTIONS, MIN_REP_SECONDS } from '../drillModel';
import type { Feel } from '../../../lib/fluencyScale';
import {
  isAtTarget, rateFor, setupHasSomethingToSet, type DrillSurface,
} from './surfaces';
import {
  TEST_REPS as TEST_REPS_FOR_PASS,
  projectTestStreak, streakLowestFeel, streakPassed, type StreakRun,
} from '../../../lib/spacing/testStreak';
import { BAND_FOR_LOWEST } from '../../../lib/spacing/banding';
import type { AccuracyBand } from '../../../lib/spacing/bands';
import { STAGE_LABEL } from '../../repertoire/stage';
import TestPassedScreen, {
  type TestPassEarned,
} from '../../repertoire/matrix/TestPassedScreen';
import TestLadderBand from './TestLadderBand';
import RatingChips from './RatingChips';
import SessionStrip from '../../repertoire/matrix/SessionStrip';
import { formatClock, useSessionClock } from './sessionClock';
import { newSessionId } from '../../../lib/sessionId';
import type { BandVerdict } from '../../../lib/spacing/banding';
import { TIER_LABEL } from '../../../lib/tier';
import { PRACTICE_ACTIVITY_OPTIONS, type PracticeActivity } from '../../../lib/practiceActivities';
import {
  DRILL_LENGTHS,
  isTooShort,
  styleLabel,
  newDraft,
  type CompletedDrill,
  type DrillDraft,
  type SessionMode,
} from './drillModel';

/**
 * =====================================================================
 * PLAYING A RUN IS NOT A SCREEN.
 *
 * There used to be a `drilling` step and a `drillrate` step. Between
 * them they replaced the whole session with a stopwatch page — one big
 * number, a target readout and a button — so the circles, the rungs,
 * the metronome and the runs already played all vanished for the
 * duration of the thing they were there to measure.
 *
 * The prototype has neither. A run's clock appears BESIDE the session's
 * and everything else stays put, which is also why the same session can
 * be run from the lead-sheet strip: there was never a second screen to
 * find room for there.
 * =====================================================================
 */
type Step = 'choose' | 'session' | 'setup' | 'wrap' | 'done';

/** Reps a test is made of. */

interface Props {
  /** Everything that differs by surface: the labels, the rate, and the
   *  writer. See `surfaces.ts` — if a surface needs something that is
   *  not on that interface, that is drift rather than a difference. */
  surface: DrillSurface;
  onClose: () => void;
}

export default function PracticeTestPanel({ surface, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [drills, setDrills] = useState<CompletedDrill[]>([]);
  const [draft, setDraft] = useState<DrillDraft | null>(null);
  /**
   * The settings this TEST session's runs all share.
   *
   * A test's three runs have to be three runs of one thing — thirty
   * seconds then ninety at two rates are two drills, and "three in a
   * row" says nothing about those. So it is settled once, at the top
   * of the session, and every run inherits it. Null in practice, where
   * varying it between drills is the point.
   */
  const [testDraft, setTestDraft] = useState<DrillDraft | null>(null);
  const [ranSeconds, setRanSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  /** What the item reads after the session was written, and how it was
   *  rated — the two things the done step reports. */
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** What the run in progress covered. Empty means the item the panel
   *  was opened on — see DrillRecord.scope. */
  const [scope, setScope] = useState<readonly string[]>([]);

  // THE GATE READS THE LIVE METRONOME. A test run cannot start with
  // nothing sounding — see `SessionStep`.
  const metronomePlaying = useMetronomeState().playing;

  /**
   * Leaving. Asks first when there is time on the clock to lose.
   *
   * =====================================================================
   * THE CONDITION IS THE CLOCK, NOT THE SCREEN.
   *
   * Before a mode is picked, nothing has been recorded and nothing is
   * running — closing is as if the panel never opened, so a prompt
   * would be asking about nothing. Once a session has started there
   * are minutes that vanish silently, which is what this stops.
   *
   * NOT `step`, and that distinction is the whole rule: the panel has
   * six screens and only one fact matters, so a list of steps to
   * exempt would be a list to forget to update.
   *
   * The DONE step is the exception, and for the same reason rather
   * than in spite of it: the session is already written by then, so
   * there is nothing left to lose and asking would imply otherwise.
   * =====================================================================
   */
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  /**
   * The session is paused: the clock is stopped and the metronome with
   * it.
   *
   * =====================================================================
   * EVERY SESSION HAS THREE EXITS — DONE, PAUSE, CANCEL. This panel had
   * two. Walking away from the piano therefore meant either logging a
   * sitting that was not finished or throwing it away, and neither is
   * what happened.
   *
   * PAUSING STOPS THE METRONOME, and resuming brings it back if it was
   * going. Without that, every resume on a test would need the
   * metronome manually restarted before the Start button would even
   * enable — a pause that turned into a setup task.
   *
   * THIS IS THE PANEL'S PAUSE, and it lives as long as the panel does.
   * Which record OWNS a session — this, or `songTimer`'s durable
   * `pausedRecord` — is a separate question, sequenced after the flip.
   * Nothing here decides it.
   * =====================================================================
   */
  const [paused, setPaused] = useState(false);
  /**
   * Which shape the panel is wearing.
   *
   * =====================================================================
   * THE PANEL WAS ONLY EVER A DIALOG, AND THAT WAS THE BUG.
   *
   * `Modal` was returned unconditionally, so the only way to reveal the
   * page behind it was to unmount — and the session state lives here,
   * so unmounting ENDED THE SESSION. Open Lead Sheet therefore threw
   * away the clock, the streak and every banked run to show a chart.
   *
   * A view is the fix rather than a patch: in `sheet` the same mounted
   * component returns `SessionStrip` in a fixed wrapper instead of the
   * modal. Nothing about the session is touched, because nothing about
   * the session unmounts.
   *
   * Only the song surface has an `openItem`, so `sheet` is a song's
   * shape — and songs count up, which is why the strip's run clock
   * never needs a countdown.
   * =====================================================================
   */
  const [view, setView] = useState<'panel' | 'sheet'>('panel');
  /**
   * The run in progress, as a timestamp the SESSION owns.
   *
   * It used to live inside `DrillingStep`, which is not rendered in
   * sheet view — so the strip would have had no clock, or a second one
   * that drifted from the first. One run, one start time, both shapes
   * reading it.
   */
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  /**
   * The metronome stopped mid-run, so the run stopped with it, and the
   * question has not been answered.
   *
   * =====================================================================
   * THE RULE WAS CLAIMED AND NOT ENFORCED. It lived only in
   * `WholeSongTestModal`, which was deleted in the flip — the strip
   * kept all four pieces and this panel had none of them, so an app
   * that told the user a test must be played to a running metronome
   * stopped checking.
   *
   * It ends the run and ASKS rather than discarding: only the player
   * knows whether he had already got to the end, and the rating system
   * already takes his word for Clean versus Struggled.
   * =====================================================================
   */
  const [awaitingVerdict, setAwaitingVerdict] = useState(false);
  /**
   * A run has ended and is waiting to be rated.
   *
   * Distinct from being IN one: a count-down drill reaches its target
   * and stops, and the metronome verdict stops a run where it stands.
   * Both leave a run that happened and has no rating yet, and the box
   * stays for it.
   */
  const [awaitingRating, setAwaitingRating] = useState(false);
  /** What was just thrown away, and why. Cleared when a run starts. */
  const [discardedMessage, setDiscardedMessage] = useState('');
  /** Whether the metronome was sounding when the pause began, so
   *  resuming restores what was there rather than a default. */
  const metronomeWasOn = useRef(false);
  /**
   * Whether it was already going when this panel opened.
   *
   * =====================================================================
   * LEAVING THE PANEL LEAVES SILENCE — UNLESS IT WAS ALREADY NOISY.
   *
   * `close` used to call `stop('drill')`, which cannot pop a `'user'`
   * driver, so a metronome started from inside the panel kept running
   * after it closed. Harmless while nothing made you start one; the
   * test gate now requires it, so it would happen on every single test.
   *
   * But `forceStop` would be too much: a click started in the header
   * before this panel opened belongs to whatever was going on then, and
   * closing a panel is not a reason to end it. So the panel stops only
   * what it can tell it caused.
   * =====================================================================
   */
  const metronomeOnAtOpen = useRef(metronome.state.playing);
  /**
   * What the item read when the session began.
   *
   * READ ONCE, not per render: it is the "from" rung, and a from that
   * moved while you were looking at it would make the band a picture
   * of nothing. The reps written during the session change the stored
   * verdict; this deliberately keeps the standing you walked in with.
   */
  const [startingVerdict, setStartingVerdict] = useState<BandVerdict | null>(null);
  useEffect(() => {
    if (mode === null) return;
    let live = true;
    void surface.readVerdict().then(v => { if (live) setStartingVerdict(v); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // Declared after `paused` because it reads it: the clock stops when
  // the session does, which is the whole of what a pause means here.
  const sessionSeconds = useSessionClock(
    mode !== null && !paused, surface.readSessionElapsedMs,
  );
  // The run's own clock, counted from the moment IT started.
  //
  // NOT `useSessionClock`: that one banks its start in a ref the first
  // time it runs and never clears it, which is right for a session and
  // wrong for a run. Reused here it made every run after the first
  // inherit the one before — so a drill with a sixty-second target
  // ended the instant it began, because the clock already read past it.
  const runSeconds = useRunClock(runStartedAt, paused);
  /**
   * How long the run in hand has lasted — live while it is going,
   * frozen at what it reached once it has ended.
   *
   * ONE VALUE FOR BOTH SHAPES. The strip and the panel each rate a run,
   * and each has to record the length it actually had; reading the live
   * clock after the run ended gave zero, and a zero-length run is "too
   * short" and is silently never written.
   */
  const currentRunSeconds = runStartedAt !== null ? runSeconds : ranSeconds;
  const clockHasRun = mode !== null && step !== 'done';

  /**
   * The two rungs the band draws, or null until the standing is known.
   *
   * THE DESTINATION IS PROJECTED FROM THE STREAK SO FAR, so the prize
   * is the one actually on offer: three In flow runs promise Mastered,
   * three Cleans promise Fluent. With no streak yet it shows the best
   * a test can reach, because that is what is still available.
   *
   * WHICH VOCABULARY comes from `describeTestPass`, not from a second
   * `kind` here. One place decides what an item earns; the band and the
   * result screen both read it, so they cannot disagree about whether
   * a pass is a rung or a band.
   */
  const ladder = ((): LadderRungs | null => {
    if (mode !== 'test' || startingVerdict === null) return null;
    const shape = surface.describeTestPass('fluent', 4);
    if (shape.kind === 'whole-song') {
      return {
        from: STAGE_LABEL.learning,
        to: STAGE_LABEL.comfortable,
        toneClass: 'bg-fluent',
        emphasised: true,
      };
    }
    const lowest = streakLowestFeel(drills.map(streakRun));
    const projected = BAND_FOR_LOWEST[lowest ?? 4];
    return {
      from: verdictWord(startingVerdict),
      to: bandWord(projected),
      toneClass: BAND_TONE[projected],
      emphasised: false,
    };
  })();

  /**
   * A run starts. One path, whichever shape asked for it.
   *
   * The step still moves to `drilling` in sheet view even though no
   * step renders there — it is what the panel returns to on Back To
   * The Session, and a run that vanished on the way back would be a
   * run the strip and the panel disagreed about.
   */
  const beginRun = () => {
    setRanSeconds(0);
    setAwaitingVerdict(false);
    setAwaitingRating(false);
    setDiscardedMessage('');
    setRunStartedAt(Date.now());
    setStep('session');
  };

  /**
   * A run is over, however it ended, and wants a rating.
   *
   * The clock stops where it was — a run's length is what it was
   * played for, not what it was aimed at — and the box stays.
   */
  /**
   * A DRILL WITH A TARGET STILL STOPS AT IT, without a screen to host
   * the countdown. The clock counts up either way; a count-down surface
   * shows what is left and ends the run when it reaches nothing.
   */
  const runTarget = surface.countsUp ? null : (draft?.targetSeconds ?? null);
  useEffect(() => {
    if (runStartedAt === null || runTarget === null) return;
    if (runSeconds < runTarget) return;
    endRun(runTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSeconds, runStartedAt, runTarget]);

  const endRun = (ran: number) => {
    setRanSeconds(ran);
    setRunStartedAt(null);
    setAwaitingRating(true);
  };

  /**
   * The metronome stopped while a run was going.
   *
   * ENDS THE RUN, DOES NOT DISCARD IT. The clock freezes where it
   * stopped — `ranSeconds` takes the frozen value, and `runStartedAt`
   * is cleared so nothing keeps counting — and the four chips stay
   * available beside an explicit discard. Practice is unaffected: the
   * metronome is optional there, so stopping it means nothing.
   */
  const onMetronomeStopped = () => {
    if (mode !== 'test' || runStartedAt === null) return;
    endRun(runSeconds);
    setAwaitingVerdict(true);
  };

  /**
   * "I didn't finish it."
   *
   * THE RUN IS GONE AND THE STREAK IS NOT TOUCHED. Nothing is written
   * and nothing joins `drills`, so the streak reads exactly as it did
   * before the run started. A run you abandoned is not a run you
   * failed — failing is what the chips are for, and Struggled already
   * costs the streak.
   */
  const discardRun = () => {
    setAwaitingVerdict(false);
    setAwaitingRating(false);
    setRunStartedAt(null);
    setDiscardedMessage(
      `Test Run ${drills.length + 1} was discarded. `
      + 'Start it again when you\u2019re back.',
    );
    setStep('session');
  };

  const togglePause = () => {
    // THE SURFACE HEARS IT TOO, where its clock is a stored record.
    // A pause that only stopped the display would let the record keep
    // counting underneath and jump on resume.
    surface.onSessionPause?.(!paused);
    setPaused(now => {
      if (now) {
        // CAUGHT, NOT VOIDED. `start` rejects when there is no Web
        // Audio to reach — a browser that blocks autoplay, a tab that
        // never had a gesture — and an unhandled rejection there would
        // be a resume that appeared to fail. The session resumes
        // either way; the click is the part that may not come back.
        if (metronomeWasOn.current) {
          metronome.start('user').catch(err => {
            console.warn('[practice-test] metronome did not resume', err);
          });
        }
        return false;
      }
      metronomeWasOn.current = metronomePlaying;
      metronome.stop('user');
      return true;
    });
  };

  const close = () => {
    if (clockHasRun) { setConfirmingCancel(true); return; }
    reallyClose();
  };

  const reallyClose = () => {
    // READ BEFORE THE FIRST STOP, not after. `stop('drill')` is not the
    // no-op it looks like: with an EMPTY driver stack it falls past the
    // "someone else still holds it" guard and clears `playing` outright.
    // Asking afterwards would therefore see a metronome that had just
    // been marked stopped and leave the real one sounding.
    const causedHere = metronome.state.playing && !metronomeOnAtOpen.current;
    // The historical pop stays: it is the match for a driver the panel
    // might one day push.
    metronome.stop('drill');
    if (causedHere) metronome.stop('user');
    onClose();
  };

  /** Everything one finished drill needs, before it is known whether
   *  it will be written. */
  const completed = (
    feel: CompletedDrill['feel'],
    // HOW LONG IT RAN, PASSED IN. The panel's rate step banks it in
    // state on the way through; the strip rates a run without one, so
    // it hands over the live figure. A default reading state would
    // have made a strip-rated run zero seconds long — and therefore
    // "too short", and therefore never written.
    ran: number = ranSeconds,
  ): CompletedDrill => {
    const d = draft as DrillDraft;
    const bpm = metronome.state.bpm;
    return {
      id: `drill-${drills.length + 1}`,
      style: d.style,
      ranSeconds: ran,
      bpm,
      per: d.per,
      rate: rateFor(surface, bpm, d.per),
      belowTarget: !isAtTarget(surface, bpm, d.per),
      feel,
      // FROM THE SAME NUMBER THE ROW RECORDS. Reading state here while
      // the row recorded `ran` would have made a strip-rated run "too
      // short" on a length it did not have — and a too-short run is
      // silently not written.
      tooShort: isTooShort(ran, MIN_REP_SECONDS),
    };
  };

  /** Practice: one drill, written as it is rated. */
  /**
   * THIS PANEL'S SESSION, for the surfaces that have no session of
   * their own.
   *
   * =====================================================================
   * MINTED ONCE, IN A REF, AND THAT IS THE WHOLE REQUIREMENT.
   *
   * The band rule counts three clean runs in a row in one testing
   * session, so an id that changed between two runs would break a
   * streak the user did not break. `useRef` with an initialiser runs
   * once per mount — `useState`'s lazy form would do as well, but the
   * value is never rendered and never sets state, so a ref says so.
   *
   * A surface with a DURABLE session overrides it: a song's session is
   * a stored record that survives a pause and a reload, and this mount
   * is younger than it. Asked at write time rather than captured here,
   * because the song's timer may start after the panel opens.
   * =====================================================================
   */
  const panelSessionId = useRef(newSessionId());
  const sessionIdNow = () =>
    surface.readSessionId?.() ?? panelSessionId.current;

  const finishPracticeDrill = async (
    feel: CompletedDrill['feel'], ran: number = ranSeconds,
  ) => {
    if (saving) return;
    const d = completed(feel, ran);
    setDrills(prev => [...prev, d]);
    setDraft(null);
    setStep('session');
    // TOO SHORT WRITES NOTHING. It is on the list saying so, which is
    // the honest version — the run is not hidden, it just did not
    // clear the floor.
    if (d.tooShort) return;
    setSaving(true);
    try {
      // THE STYLE IS RECORDED, NOT ACTED ON — it rides onto the
      // session row for the practice log and stops there. A skipped
      // rating still writes the row, because the time happened and
      // last-drilled should move; the writer records no engagement
      // without a feel, so an unrated drill leaves the band alone.
      await surface.write({
        ranSeconds: d.ranSeconds,
        // A COUNT-UP RUN HAS NO TARGET. Recording the draft's length
        // would be a number nobody set.
        targetSeconds: surface.countsUp ? 0 : (draft as DrillDraft).targetSeconds,
        // WHAT THE RUN COVERED. Empty means the item the panel was
        // opened on — the writer reads null as exactly that, so the
        // claim stays the smallest one the evidence supports.
        scope: scope.length > 0 ? scope : null,
        style: d.style,
        feel: d.feel,
        fromTest: false,
        sessionId: sessionIdNow(),
        // Practice has no streak; zero is the honest value rather than
        // a number borrowed from a test.
        streakBefore: 0,
      });
      setScope([]);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Test: each run is written AS IT FINISHES, and the third clean one
   * ends the test.
   *
   * =====================================================================
   * IT USED TO COLLECT THREE AND WRITE THEM AT SAVE, AND THAT IS WHY
   * THE PANEL AND THE BAND DISAGREED.
   *
   * `countsTowardTest` never looked at the feel's VALUE, so three
   * at-target rated drills — one of them Struggled — made the panel say
   * the test was done. `banding.ts` then read the same three reps, hit
   * the Struggled one, reset, and refused the pass.
   *
   * Writing each run as it finishes is what makes the two agree. The
   * FAILURES GET WRITTEN TOO, and that is required rather than
   * incidental: banding reconstructs the streak from the stored reps,
   * so a reset it cannot see is a reset that did not happen.
   *
   * There is no Save step. The third clean run is the pass.
   * =====================================================================
   */
  const finishTestDrill = async (
    feel: CompletedDrill['feel'], ran: number = ranSeconds,
  ) => {
    if (saving) return;
    const d = completed(feel, ran);
    const next = [...drills, d];
    setDrills(next);
    setDraft(null);
    setRunStartedAt(null);
    setAwaitingVerdict(false);
    setAwaitingRating(false);
    setStep('session');

    // A run too short to have been real is on the list saying so, and
    // nothing is written for it — unchanged, and the one case where a
    // run leaves no rep.
    if (d.tooShort) return;

    setSaving(true);
    try {
      // BEFORE this run, which is what the stored row records: the
      // streak it was part of, not the one it produced.
      const streakBefore = projectTestStreak(drills.map(streakRun));
      await surface.write({
        ranSeconds: d.ranSeconds,
        targetSeconds: surface.countsUp ? 0 : d.ranSeconds,
        // A test is three runs of the thing being tested. Scoping one
        // of them to something else would make the three not be three
        // reps of one item.
        scope: null,
        // A test drill is always blocked, where there is a style at
        // all. The writer drops it on surfaces that have none.
        style: surface.hasStyle ? 'blocked' : null,
        feel: d.feel,
        fromTest: true,
        sessionId: sessionIdNow(),
        streakBefore,
      });

      if (!streakPassed(next.map(streakRun))) return;

      // THE DURABLE FACT, where the surface has one. Null on the three
      // shapes surfaces: a passed shapes test is entirely described by
      // its reps. A song also writes `wholeSongTestPassedAt` and moves
      // the key's retest clock, neither of which the reps imply.
      await surface.recordTestPass?.();

      // THE LOWEST OF THE THREE WINNERS, which is what chose the
      // height. Read off the runs that formed the streak rather than
      // off all of them: a bad run earlier in the session already cost
      // the streak once, and charging it again would cap the session
      // for one mistake.
      const winners = next.slice(-TEST_REPS_FOR_PASS);
      const lowestFeel = winners.reduce<Feel>(
        (low, d) => (d.feel !== null && d.feel < low ? d.feel : low), 4,
      );
      const verdict = await surface.readVerdict();
      setOutcome({
        kind: 'test',
        feel: null,
        derived: false,
        verdict,
        passed: {
          earned: surface.describeTestPass(
            verdict.kind === 'band' ? verdict.band : 'fluent',
            lowestFeel,
          ),
          keyName: surface.passKeyName,
        },
      });
      setStep('done');
    } finally {
      setSaving(false);
    }
  };

  // THE SHEET HAS THE PAGE. No Modal, no overlay — the host is already
  // rendering the lead sheet underneath, and this is the session laid
  // across the top of it. Same mounted component, so the clock, the
  // streak and every banked run survive the switch and survive coming
  // back.
  if (view === 'sheet' && mode !== null) {
    return (
      <div className="fixed inset-x-0 top-0 z-40">
        <SessionStrip
          kind={mode === 'test' ? 'testing' : 'practice'}
          metronomeOn={metronomePlaying}
          blockReason={mode === 'test' && !metronomePlaying && runStartedAt === null
            ? 'Start the metronome to begin a test run.'
            : null}
          awaitingVerdict={awaitingVerdict}
          onDiscardRun={discardRun}
          onMetronomeStopped={onMetronomeStopped}
          discardedMessage={discardedMessage}
          sessionSeconds={sessionSeconds}
          /* SHOWN WHILE RUNNING AND AFTER, stopped, until it is rated. */
          runSeconds={runStartedAt !== null || awaitingRating ? currentRunSeconds : null}
          runLive={runStartedAt !== null}
          onEndRun={() => endRun(runSeconds)}
          nextRunNumber={drills.length + 1}
          paused={paused}
          onPauseToggle={togglePause}
          streak={mode === 'test' ? projectTestStreak(drills.map(streakRun)) : null}
          streakBroken={mode === 'test'
            && projectTestStreak(drills.map(streakRun)) === 0
            && drills.length > 0
            && streakRun(drills[drills.length - 1]).counts}
          onRate={feel => {
            if (mode === 'test') void finishTestDrill(feel, currentRunSeconds);
            else void finishPracticeDrill(feel, currentRunSeconds);
          }}
          onStartRun={() => {
            if (mode === 'test' && testDraft !== null) setDraft(testDraft);
            else setDraft(newDraft());
            beginRun();
          }}
          // A TEST RUN ENDS BY RATING IT. Null is the absence of a
          // handler, which is what makes the button absent.
          onFinishRun={mode === 'practice'
            ? () => void finishPracticeDrill(null, currentRunSeconds)
            : null}
          onSave={() => { setView('panel'); setStep(mode === 'practice' ? 'wrap' : 'session'); }}
          onBack={() => setView('panel')}
        />
      </div>
    );
  }

  return (
    <Modal
      open
      onClose={close}
      title={surface.cellLabel}
      description={surface.skillLabel}
      /* NO FOOTER ON THE RESULT SCREEN. §4 asks for one exit and means
         it: a Close beside "Close And See It" would make the user
         choose between two ways of agreeing with a screen that is
         finished. The Modal's own × stays — it is chrome on every
         modal and calls the same handler. */
      footer={outcome?.passed != null || confirmingCancel
        ? undefined
        : (
          <PanelFooter
            mode={mode}
            paused={paused}
            onTogglePause={togglePause}
            onEndSession={() => {
              // PRACTICE ENDS AT THE WRAP, not at the door: the
              // sitting's own rating has somewhere to land. A test has
              // already written every run as it finished.
              if (mode === 'practice') setStep('wrap');
              else close();
            }}
            onClose={close}
          />
        )}
    >
      {confirmingCancel && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Are you sure you want to cancel this session?
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={reallyClose}
              className="px-4 py-2 rounded-lg bg-needswork text-white text-sm font-medium hover:opacity-90"
            >
              Cancel The Session
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              Continue Session
            </button>
          </div>
        </div>
      )}

      {!confirmingCancel && step === 'choose' && (
        <ModeChooser onPick={next => {
          setMode(next);
          setTestDraft(next === 'test' ? newDraft() : null);
          setStep('session');
        }} />
      )}

      {/* A METRONOME ON THE SESSION. Plenty of the work on a song
          happens between runs — reading the chart, finding a voicing,
          playing a passage over — and a click that only exists inside
          a timed drill is not available for any of it. */}
      {/* ON SCREEN THROUGHOUT, not only between runs. The prototype's
          panel keeps the metronome visible for the whole session, and
          it has to be: stopping it mid-run ends the run, and a control
          that vanished the moment a run began would make that rule
          unreachable from the panel. */}
      {!confirmingCancel && mode !== null && surface.sessionMetronome
        && step === 'session' && (
        // THE SONG'S BOX WHERE THERE IS ONE. It carries the tempo
        // window, the clamping stepper and the no-tempo prompt — none
        // of which a bare control has, and all of which are what makes
        // the gate visible rather than merely enforced.
        // THE INTERCEPT HOLDS IN BOTH SHAPES. Reported from the press
        // rather than watched, so a `forceStop` from the global
        // session banner cannot end a run the player is in.
        surface.renderMetronome?.(onMetronomeStopped)
          ?? <MetronomeControl onStoppedByUser={onMetronomeStopped} />
      )}

      {!confirmingCancel && step === 'session' && mode !== null && surface.openItem !== null && (
        <button
          type="button"
          onClick={() => {
            // REVEAL, NOT LEAVE. The panel changes its own shape and
            // the host scrolls the sheet into view; it used to close
            // the panel, which ended the session to show a chart.
            setView('sheet');
            surface.openItem?.();
          }}
          className="w-full px-3 py-2.5 rounded-lg bg-info text-white text-sm font-medium hover:opacity-90"
        >
          Open Lead Sheet
        </button>
      )}

      {/* WHAT WAS DISCARDED, NAMED — in the panel as well as the
          strip. A run and a session are different things and only one
          of them was thrown away. */}
      {!confirmingCancel && discardedMessage !== '' && !awaitingVerdict && mode !== null && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {discardedMessage}
        </div>
      )}

      {/* THE PAUSED STATE, SAID IN WORDS. A stopped clock is something
          a reader can miss; this cannot be. It also says what happened
          to the metronome, because otherwise a returning player finds
          the Start button disabled and has to work out why. */}
      {!confirmingCancel && paused && mode !== null && (
        <div className="rounded-md border-l-[3px] border-needswork bg-needswork/5 px-3 py-2.5 text-xs leading-snug text-neutral-700 dark:text-neutral-200">
          <b>Paused — the clock is stopped.</b> Metronome pauses with the
          session. Resumes upon return.
        </div>
      )}

      {/* THE SESSION STAYS ON SCREEN WHILE YOU RATE. `drillrate` is no
          longer a page of its own — it is the session screen with the
          rating box where the Start button was. */}
      {!confirmingCancel && step === 'session' && mode !== null && (
        <SessionStep
          mode={mode}
          seconds={sessionSeconds}
          drills={drills}
          saving={saving}
          surface={surface}
          testDraft={testDraft}
          onTestDraftChange={setTestDraft}
          metronomeOn={metronomePlaying}
          /* RATED WHERE IT WAS PLAYED — under the run-throughs list and
             above Open Lead Sheet, exactly as the prototype draws it. */
          /* SHOWN WHILE RUNNING AND AFTER, stopped. A clock that
             vanished the moment the run ended would take the run's
             length away at the moment you are being asked about it. */
          runSeconds={runStartedAt !== null || awaitingRating ? currentRunSeconds : null}
          runLive={runStartedAt !== null}
          onEndRun={() => endRun(runSeconds)}
          rating={(runStartedAt !== null || awaitingRating) && draft !== null ? (
            <RunRatingBox
              live={runStartedAt !== null}
              awaitingVerdict={awaitingVerdict}
              onDiscardRun={discardRun}
              surface={surface}
              openedOn={surface.scopeOptions?.find(o => o.id === surface.openedOnScopeId)?.label ?? null}
              scope={scope}
              onScope={setScope}
              mode={mode}
              /* THE LENGTH IT ACTUALLY HAD. While the run is going
                 that is the live clock; once it has stopped it is
                 whatever it stopped at. */
              ranSeconds={currentRunSeconds}
              index={drills.length + 1}
              onRate={(feel: Feel) => {
                if (mode === 'test') void finishTestDrill(feel, currentRunSeconds);
                else void finishPracticeDrill(feel, currentRunSeconds);
              }}
              onSkip={() => void finishPracticeDrill(null, currentRunSeconds)}
            />
          ) : null}
          ladder={ladder}
          paused={paused}
          onStartDrill={() => {
            // A TEST'S SETTINGS ARE ALREADY ANSWERED. They were asked
            // once above the circles, so pressing Start starts a run
            // rather than opening a form behind a button that said
            // Start.
            if (mode === 'test' && testDraft !== null) {
              setDraft(testDraft);
              beginRun();
              return;
            }
            const draft = newDraft();
            if (setupHasSomethingToSet(surface)) {
              setDraft(draft);
              setStep('setup');
              return;
            }
            // NOTHING TO SET, SO NOTHING TO SHOW. The rate comes from
            // the surface's sole option rather than from `newDraft`'s
            // default — they agree today, and a surface whose single
            // option was not 1 would otherwise start a run at a rate
            // nobody chose and nothing displayed.
            setDraft({ ...draft, per: surface.rateOptions[0]?.per ?? draft.per });
            beginRun();
          }}
        />
      )}

      {!confirmingCancel && step === 'setup' && draft !== null && mode !== null && (
        <SetupStep
          mode={mode}
          seconds={sessionSeconds}
          draft={draft}
          surface={surface}
          onChange={setDraft}
          onStart={beginRun}
          onCancel={() => { setDraft(null); setStep('session'); }}
        />
      )}


      {/* A PASS REPORTS THROUGH THE ONE RESULT SCREEN. Every surface
          runs the same test now, so every surface says so the same
          way. `DoneStep` still handles a session that ended without a
          pass — a practice sitting, or a test walked away from. */}
      {!confirmingCancel && step === 'done' && outcome !== null && (
        outcome.passed !== null
          ? (
            <TestPassedScreen
              earned={outcome.passed.earned}
              keyName={outcome.passed.keyName}
              sessionSeconds={sessionSeconds}
              preview={surface.renderBadgePreview?.() ?? null}
              onClose={close}
            />
          )
          : <DoneStep outcome={outcome} onClose={close} />
      )}

      {!confirmingCancel && step === 'wrap' && mode !== null && (
        <WrapStep
          seconds={sessionSeconds}
          mode={mode}
          drills={drills}
          surface={surface}
          saving={saving}
          onLog={async (feel) => {
            if (saving) return;
            setSaving(true);
            try {
              if (feel !== null) {
                // A REP LIKE ANY OTHER. The band rule is unchanged:
                // practice caps at Developing, and only a test at
                // tempo goes past it.
                await surface.writeSessionRating(feel, false, sessionIdNow());
              }
              setOutcome({
                kind: 'practice',
                // A practice sitting passes nothing — practice is
                // capped at Developing, and the result screen is for a
                // test that was passed.
                passed: null,
                feel,
                derived: derivedFeelOf(drills) !== null,
                verdict: await surface.readVerdict(),
              });
              setStep('done');
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

    </Modal>
  );
}

// ---------------------------------------------------------------------

/**
 * The row along the bottom of the panel.
 *
 * =====================================================================
 * THE STEP TRAIL IS GONE, AND IT HAD TO BE.
 *
 * It read `Skill › Mode › Test Runs › Done` and highlighted a position
 * — a breadcrumb through screens the panel no longer has. With
 * `drilling` and `drillrate` retired there are two steps left worth
 * naming, and a trail through two is not a trail.
 *
 * What sits here instead is what the prototype puts here: the ways out
 * of a session, together, where they are reachable whatever the session
 * is doing. Pause and End Session used to be halfway up the session
 * screen, which meant they scrolled away exactly when a run was going.
 * =====================================================================
 */
function PanelFooter({ mode, paused, onTogglePause, onEndSession, onClose }: {
  mode: SessionMode | null;
  paused: boolean;
  onTogglePause: () => void;
  onEndSession: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
      >
        Close
      </button>
      {/* ONLY ONCE A SESSION IS RUNNING. Before a mode is picked there
          is nothing to pause and nothing to end. */}
      {mode !== null && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePause}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={onEndSession}
            disabled={paused}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm disabled:opacity-45 disabled:cursor-not-allowed"
          >
            End Session
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A label, and the hint the prototype puts beside it.
 *
 * THE HINTS ARE THE PROTOTYPE'S, not invented here. Every label in it
 * carries one except `Pick A Skill`, whose hint was deleted for being
 * a fragment. The rule is: build the ones the artefact carries, invent
 * none.
 */
function SectionLabel({ children, hint }: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400 mb-2 flex items-baseline justify-between gap-3">
      <span>{children}</span>
      {hint && (
        <span className="normal-case tracking-normal font-medium text-neutral-500 text-[0.78rem]">
          {hint}
        </span>
      )}
    </p>
  );
}

/**
 * Seconds since THIS run started, or zero when none has.
 *
 * A run's clock restarts every time; a session's does not. Sharing one
 * hook between them is what made the second run of a session begin
 * already past its target.
 */
function useRunClock(startedAt: number | null, paused: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (startedAt === null) { setSeconds(0); return; }
    if (paused) return;
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [startedAt, paused]);
  return seconds;
}

/**
 * A clock, named.
 *
 * THE APP NEVER SAYS "SESSION" OR "RUN" ON ITS OWN, so the default is
 * the session's own kind and a run passes its own. "This Test Session"
 * became "Testing Session" to match the rule sentence and the strip —
 * the same clock should not be called two things depending on which
 * shape the panel is wearing.
 */
function SessionClockFace({ seconds, mode, label }: {
  seconds: number; mode: SessionMode; label?: string;
}) {
  return (
    <div className="rounded-lg border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900/40 p-4 text-center">
      <div className="font-mono tabular-nums text-3xl sm:text-4xl">{formatClock(seconds)}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-neutral-400 mt-1">
        {label ?? (mode === 'test' ? 'Testing Session' : 'Practice Session')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function ModeChooser({ onPick }: { onPick: (mode: SessionMode) => void }) {
  return (
    <div className="space-y-3">
      <SectionLabel hint="The clock starts either way">What Are You About To Do</SectionLabel>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onPick('practice')}
          className="text-left rounded-lg border border-neutral-200 dark:border-neutral-700 px-3.5 py-3 hover:border-fluent transition"
        >
          <div className="text-[0.96rem] font-semibold">Practice</div>
          <div className="text-xs text-neutral-500 leading-snug mt-0.5">
            Working it in. Start as many drills as you like inside it, at any
            tempo. Rating a drill is optional. Takes you as far as{' '}
            <b className="text-neutral-700 dark:text-neutral-200">Developing</b>.
          </div>
        </button>
        <button
          type="button"
          onClick={() => onPick('test')}
          className="text-left rounded-lg border border-neutral-200 dark:border-neutral-700 px-3.5 py-3 hover:border-fluent transition"
        >
          <div className="text-[0.96rem] font-semibold">Test</div>
          {/* IT NOW SAYS THE RESET, which is the one thing it lacked.
              Every clause of the old sentence was true — three drills
              at target, each rated, the lowest setting the rating — so
              it was incomplete rather than false, and incomplete about
              the exact rule the streak change added. Someone reading
              it would have learned the rule by losing a streak to it. */}
          <div className="text-xs text-neutral-500 leading-snug mt-0.5">
            Three drills in a row, each at or above your target rate, each one
            rated Clean or better. Anything lower puts the count back to zero
            and you go again. The lowest of the three sets the rating. Testing
            is the only way to{' '}
            <b className="text-neutral-700 dark:text-neutral-200">Fluent</b> or{' '}
            <b className="text-neutral-700 dark:text-neutral-200">Mastered</b>.
          </div>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function SessionStep({
  mode, seconds, drills, saving, surface, testDraft, onTestDraftChange,
  metronomeOn, rating, runSeconds, runLive, onEndRun, ladder, paused,
  onStartDrill,
}: {
  mode: SessionMode;
  seconds: number;
  drills: ReadonlyArray<CompletedDrill>;
  saving: boolean;
  surface: DrillSurface;
  /** The settings this test session's runs share. Null in practice. */
  testDraft: DrillDraft | null;
  onTestDraftChange: (next: DrillDraft) => void;
  metronomeOn: boolean;
  /** The rating box for the run just played, or null when no run is
   *  waiting to be rated. It sits where the Start button goes, because
   *  they are the two answers to "what now" and only one is ever
   *  true. */
  rating: ReactNode | null;
  /** Seconds into the run being played, or null when none is. It sits
   *  BESIDE the session's clock rather than replacing the screen. */
  runSeconds: number | null;
  /** True while the run's clock is still going. */
  runLive: boolean;
  /** End the run. It does not rate it — that is the next thing. */
  onEndRun: () => void;
  /** The rungs this test moves between, or null before the item's
   *  current standing has been read. */
  ladder: LadderRungs | null;
  paused: boolean;
  onStartDrill: () => void;
}) {
  const runs = drills.map(streakRun);
  const streak = projectTestStreak(runs);
  // THE LAST RUN BROKE IT, and only the last one — a streak sitting at
  // zero because nothing has been run yet is not a reset.
  const broken = mode === 'test'
    && streak === 0
    && runs.length > 0
    && runs[runs.length - 1].counts;

  return (
    <div className="space-y-4">
      {/* TWO CLOCKS, SIDE BY SIDE. The run's appears next to the
          session's while it is being played and goes when it is over —
          it never takes the screen. */}
      <div className={runSeconds === null ? '' : 'grid grid-cols-2 gap-2'}>
        <SessionClockFace seconds={seconds} mode={mode} />
        {runSeconds !== null && (
          <SessionClockFace
            seconds={runSeconds}
            mode={mode}
            label={mode === 'test' ? 'Test Run' : 'Practice Run'}
          />
        )}
      </div>

      {/* THE BAND, DRAWN ALWAYS DURING A TEST — never only once a run
          is banked. The run number keeps climbing while the streak
          returns to zero, and circles that vanish on a reset take the
          count away at exactly the moment it matters most.

          Where you are, the three filling, and what it gets you: the
          progress bar and the prize in one picture. */}
      {mode === 'test' && ladder !== null && (
        <div className="space-y-1.5">
          <TestLadderBand
            from={ladder.from}
            to={ladder.to}
            toneClass={ladder.toneClass}
            emphasised={ladder.emphasised}
            count={streak}
            broken={broken}
          />
          <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 text-center">
            {streak} of 3
          </div>
        </div>
      )}

      {broken && (
        <div className="rounded-md border-l-[3px] border-needswork bg-needswork/5 px-3 py-2.5 text-xs leading-snug text-neutral-700 dark:text-neutral-200">
          That run was below Clean, so the streak starts over — back to{' '}
          <b>0 of 3</b>. The runs before it are still logged.
        </div>
      )}

      {/* ASKED ONCE, ABOVE THE RUNS THEY GOVERN. A test's three runs
          have to be three runs of ONE thing; see `DrillSettings`. */}
      {mode === 'test' && testDraft !== null && setupHasSomethingToSet(surface) && (
        <DrillSettings
          mode={mode}
          draft={testDraft}
          surface={surface}
          onChange={onTestDraftChange}
        />
      )}

      <div>
        <SectionLabel
          hint={mode === 'test'
            ? 'Three in a row, at target, all rated'
            : 'Optional — the session counts either way'}
        >
          {mode === 'test' ? 'Runs In This Testing Session' : 'Drills In This Session'}
        </SectionLabel>
        <DrillList mode={mode} drills={drills} surface={surface} />
      </div>

      {/* WHY IT CANNOT START, ABOVE THE BUTTON. The rule stopped being
          song-only when the test model became shared: a test that
          requires the metronome running cannot require it on one
          surface and not the others. Said above rather than in a
          tooltip — a disabled control with its reason behind a hover
          is a dead end, and this is the one place someone is stuck. */}
      {rating === null && mode === 'test' && !metronomeOn && !paused && (
        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
          Start the metronome to begin a test run.
        </p>
      )}

      {/* ONE OR THE OTHER. A run waiting to be rated and an offer to
          start another are two answers to "what now", and only one of
          them is ever true. */}
      {rating}

      <div className="flex items-center gap-2 flex-wrap">
        {/* WHILE THE CLOCK IS GOING, ENDING IT IS THE ONLY THING TO DO,
            so it is the one highlighted action. Rating comes after, and
            the box above says so rather than offering itself. */}
        {runLive && (
          <button
            type="button"
            onClick={onEndRun}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            {mode === 'test' ? 'End Test Run' : 'End Practice Run'}
          </button>
        )}
        {rating === null && (
        <button
          type="button"
          onClick={onStartDrill}
          disabled={saving || paused || (mode === 'test' && !metronomeOn)}
          className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90 disabled:opacity-45 disabled:cursor-not-allowed"
        >
          {mode === 'test'
            ? `Start Test Run ${drills.length + 1}`
            : 'Start A Practice Drill'}
        </button>
        )}
      </div>
    </div>
  );
}

/**
 * A completed drill, as the streak sees it.
 *
 * `belowTarget` and `tooShort` both make a run not count rather than
 * fail: a warm-up under tempo is a different activity, and a run that
 * was too short never happened. Neither advances the streak and neither
 * resets it — the same treatment `isInTempoRange` has always given a
 * slow run on a song.
 */
interface LadderRungs {
  from: string;
  to: string;
  toneClass: string;
  emphasised: boolean;
}

/** The grids' own colours, so the band does not introduce a second set
 *  for the same rungs. */
const BAND_TONE: Record<AccuracyBand, string> = {
  'needs-work': 'bg-needswork',
  'developing': 'bg-developing',
  'fluent': 'bg-fluent',
  'mastered': 'bg-mastered',
};

function bandWord(band: AccuracyBand): string {
  switch (band) {
    case 'needs-work': return TIER_LABEL.needsWork;
    case 'developing': return TIER_LABEL.developing;
    case 'fluent': return TIER_LABEL.fluent;
    case 'mastered': return TIER_LABEL.mastered;
  }
}

function streakRun(d: CompletedDrill): StreakRun {
  return { counts: !d.belowTarget && !d.tooShort, feel: d.feel };
}

function DrillList({ mode, drills, surface }: {
  mode: SessionMode;
  drills: ReadonlyArray<CompletedDrill>;
  surface: DrillSurface;
}) {
  if (drills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 px-3 py-3 text-center text-xs text-neutral-500">
        {mode === 'test'
          ? 'No test drills yet.'
          : 'No drills yet — the clock is still counting.'}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {drills.map((d, i) => {
        const feelLabel = d.feel === null
          ? null
          : FEEL_CARD_OPTIONS.find(o => o.value === d.feel)?.label;
        return (
          <div key={d.id} className="space-y-1">
            <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-2 text-xs">
              <span className="font-mono text-[0.7rem] font-bold text-neutral-400">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <b className="font-semibold">
                  {mode === 'test' ? 'Test' : 'Drill'} {i + 1}{d.style ? ` · ${styleLabel(d.style)}` : ''}
                </b>
                <span className="block font-mono text-[0.66rem] text-neutral-400">
                  {d.ranSeconds}s · {d.rate} {surface.rateLabel}
                </span>
              </span>
              <span className={`text-[11px] ${feelLabel ? 'font-semibold' : 'text-neutral-400 uppercase tracking-wide'}`}>
                {feelLabel ?? 'Not Rated'}
              </span>
              {d.belowTarget && (
                <span className="text-[11px] font-bold text-developing">BELOW</span>
              )}
            </div>
            {d.tooShort && (
              <p className="text-[11px] text-developing m-0 pl-7">
                Under {MIN_REP_SECONDS} seconds, so this run was too short to
                count and nothing was saved for it.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------

function SetupStep({
  mode, seconds, draft, surface, onChange, onStart, onCancel,
}: {
  mode: SessionMode;
  seconds: number;
  draft: DrillDraft;
  surface: DrillSurface;
  onChange: (next: DrillDraft) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />
      <DrillSettings mode={mode} draft={draft} surface={surface} onChange={onChange} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={draft.style === null}
          className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90 disabled:opacity-45 disabled:cursor-not-allowed"
        >
          Start Drill
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------

/**
 * How long, how fast, and in what manner.
 *
 * =====================================================================
 * A TEST ASKS THIS ONCE. PRACTICE ASKS IT EVERY TIME.
 *
 * A test's three runs have to be THREE RUNS OF ONE THING. Thirty
 * seconds, then ninety, then a hundred and twenty, at three different
 * rates, are three different drills — and "three in a row" says nothing
 * about three different drills. So a test session settles this at the
 * top, on the screen that shows the circles, and every run inherits it.
 *
 * Practice is the opposite case and keeps the per-drill form: varying
 * it between drills is the point of practising.
 *
 * IT CHANGES NOTHING ABOUT WHAT A RUN STORES. Each run still records
 * its own `ranSeconds` — what was actually played — alongside the
 * settings it inherited. What changes is how often the question is
 * asked, not what the answer is attached to.
 * =====================================================================
 */
function DrillSettings({ mode, draft, surface, onChange }: {
  mode: SessionMode;
  draft: DrillDraft;
  surface: DrillSurface;
  onChange: (next: DrillDraft) => void;
}) {
  const metro = useMetronomeState();
  const rate = rateFor(surface, metro.bpm, draft.per);
  const atTarget = isAtTarget(surface, metro.bpm, draft.per);
  const isTest = mode === 'test';

  // A test drill is always blocked and in time. Set once on entering
  // rather than asked — the sentence below states it.
  useEffect(() => {
    if (isTest && draft.style !== 'blocked') onChange({ ...draft, style: 'blocked' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTest]);

  return (
    <div className="space-y-4">
      {/* A TEST STATES ITS MANNER; PRACTICE PICKS ONE. Offering a
          disabled Broken chip in a test was a control that existed
          only to refuse — the sentence says the same thing and is
          not a dead button. */}
      {isTest ? (
        <div>
          <SectionLabel hint="A test drill is always blocked">Style</SectionLabel>
          <p className="text-sm text-neutral-700 dark:text-neutral-200 m-0">
            Blocked, at tempo.
          </p>
        </div>
      ) : (
        <div>
          <SectionLabel hint="Pick per drill, not per session">Style</SectionLabel>
          <div className="flex gap-1.5 flex-wrap">
            {(['broken', 'blocked'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => onChange({ ...draft, style: st })}
                aria-pressed={draft.style === st}
                className={`px-3 py-1 rounded-md border text-sm ${
                  draft.style === st
                    ? 'bg-fluent text-white border-fluent font-semibold'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent'
                }`}
              >
                {styleLabel(st)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel hint={`${draft.targetSeconds}s`}>How Long</SectionLabel>
        <div className="flex gap-1.5 flex-wrap">
          {DRILL_LENGTHS.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ ...draft, targetSeconds: v })}
              aria-pressed={draft.targetSeconds === v}
              className={`px-3 py-1 rounded-md border text-sm ${
                draft.targetSeconds === v
                  ? 'bg-fluent text-white border-fluent font-semibold'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent'
              }`}
            >
              {v}s
            </button>
          ))}
        </div>
      </div>

      <DrillMetronomeSetup />

      <div>
        <SectionLabel>Rate</SectionLabel>
        <div className="flex gap-1.5 flex-wrap">
          {surface.rateOptions.map(o => (
            <button
              key={o.per}
              type="button"
              onClick={() => onChange({ ...draft, per: o.per })}
              aria-pressed={draft.per === o.per}
              className={`px-3 py-1 rounded-md border text-sm ${
                draft.per === o.per
                  ? 'bg-fluent text-white border-fluent font-semibold'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 mt-2">
          <span className="font-mono text-[0.72rem] text-neutral-500">
            {rate} {surface.rateLabel}
          </span>
          <span className={`text-[0.69rem] font-bold ${atTarget ? 'text-fluent' : 'text-developing'}`}>
            {atTarget
              ? `AT TARGET (${surface.targetRate})`
              : `BELOW TARGET (${surface.targetRate})`}
          </span>
        </div>
      </div>

      {isTest && !atTarget && (
        <div className="rounded-md border-l-[3px] border-developing bg-developing/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
          <b>Below target.</b> This run will be logged, but it won't count
          toward the three. Raise the tempo, or change how many beats each
          shape gets.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

/**
 * Rating the run you just played, where you played it.
 *
 * =====================================================================
 * IT WAS A SCREEN. NOW IT IS A BOX UNDER THE RUN LIST.
 *
 * A separate rate step meant the session vanished at the moment you
 * were asked about it — the clock, the streak, the runs behind it, all
 * replaced by a page asking one question. The prototype rates in place
 * and keeps the session on screen, which is also the only way the same
 * box can appear in the strip.
 *
 * The clock face went with the step: the session screen already has
 * one, and two clocks on one screen is one too many.
 * =====================================================================
 */
function RunRatingBox({
  live, awaitingVerdict, onDiscardRun,
  mode, ranSeconds, index, surface, openedOn, scope, onScope, onRate, onSkip,
}: {
  /**
   * The run is still being played.
   *
   * The box is here either way — the question is not absent, it is
   * next — but it cannot be answered until the run has been ended on
   * purpose. Rating is not how a run ends.
   */
  live: boolean;
  /** The run ended because the metronome stopped, and the question
   *  has not been answered. */
  awaitingVerdict: boolean;
  onDiscardRun: () => void;
  mode: SessionMode;
  ranSeconds: number;
  index: number;
  surface: DrillSurface;
  /** The section the panel was opened on, for the hint. */
  openedOn: string | null;
  scope: readonly string[];
  onScope: (next: readonly string[]) => void;
  onRate: (feel: 1 | 2 | 3 | 4) => void;
  onSkip: () => void;
}) {
  const tooShort = isTooShort(ranSeconds, MIN_REP_SECONDS);
  // A TEST'S COVERAGE IS FIXED WHEN THE TEST IS OPENED. `entry` decides
  // it, and nothing after the run may widen it — the writer has always
  // enforced this by sending `scope: null` on a test, so the control
  // was visible and inert there. Practice is the opposite case: seeing
  // afterwards that a run covered the chorus too is a real thing to
  // want, and the picker is how you say so.
  const options = mode === 'practice' ? surface.scopeOptions : null;
  const wholeSong = options !== null && scope.length === options.length;
  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">

      {/* THE METRONOME STOPPED, SO THE RUN DID. Not a discard — a
          question. The chips below are still the way to answer "yes I
          finished it"; this adds the other answer, which nothing else
          offers. */}
      {awaitingVerdict && (
        <div className="space-y-2">
          <p className="text-xs leading-snug text-neutral-700 dark:text-neutral-200">
            <b>Did you finish that run?</b> The metronome stopped, so the run
            stopped with it. Rate it if you got to the end. If you did not,
            discarding it costs you the run — your streak is untouched.
          </p>
          <button
            type="button"
            onClick={onDiscardRun}
            className="px-3 py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            I didn&rsquo;t finish it — discard this run
          </button>
        </div>
      )}

      {tooShort && (
        <div className="rounded-md border-l-[3px] border-developing bg-developing/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
          <b>That run was {ranSeconds}s.</b> A run has to reach{' '}
          {MIN_REP_SECONDS} seconds to have been real, so this one goes on the
          list and nothing is saved for it.
        </div>
      )}

      {options !== null && (
        <div>
          <SectionLabel hint={openedOn !== null ? `You opened on ${openedOn}` : undefined}>
            What Was That Run
          </SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {options.map(opt => {
              const on = scope.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onScope(
                    on ? scope.filter(id => id !== opt.id) : [...scope, opt.id],
                  )}
                  className={`px-2.5 py-1 rounded-md border text-xs ${
                    on
                      ? 'bg-fluent text-white border-fluent font-medium'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onScope(wholeSong ? [] : options.map(o => o.id))}
              className={`px-2.5 py-1 rounded-md border text-xs ${
                wholeSong
                  ? 'bg-fluent text-white border-fluent font-medium'
                  : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              The Whole Song
            </button>
          </div>
          {wholeSong && (
            <div className="mt-2 rounded-md border-l-[3px] border-fluent bg-fluent/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
              <b>This counts for every section.</b> You played them all, so how
              it went is evidence about all of them — not just{' '}
              {openedOn ?? 'the one you opened'}.
            </div>
          )}
        </div>
      )}

      <div>
        {/* THE HEADING DOES NOT MOVE; the hint beside it does. "After
            the run" is the whole of what changes when the clock stops,
            so the box does not appear to become a different control. */}
        <SectionLabel
          hint={live ? 'After the run' : (mode === 'test' ? 'Required' : 'Optional')}
        >
          Rate That Run
        </SectionLabel>
        {/* BEST FIRST, and the one rendering of the four ratings. The
            block wrap-up reads worst-first and says so; the direction
            is the caller's, not the component's. */}
        <RatingChips onRate={onRate} order="best-first" disabled={live} />
      </div>

      {/* NO SKIP IN A TEST. Every one of the three is rated — that is
          what makes the lowest of them mean anything. */}
      {mode === 'practice' && !live && (
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
        >
          Skip The Rating
        </button>
      )}

      <p className="sr-only">Drill {index}</p>
    </div>
  );
}



// ---------------------------------------------------------------------

/**
 * The end of a practice sitting.
 *
 * =====================================================================
 * THIS WAS MISSING. Practice shipped with `End Session` calling
 * `onClose`, so the sitting's own rating had nowhere to land: the
 * drills wrote their reps and the session itself wrote nothing. Every
 * word here is the prototype's; the step is not.
 *
 * THE READING IS AVERAGED, AND A TEST IS NOT. A test takes the lowest
 * of three, because the one that went wrong is the evidence that has
 * not gone away. A practice sitting takes the average of what you did,
 * because nothing is being claimed — which is also why the reading can
 * be disagreed with and a test's cannot.
 *
 * THE CLOCK KEEPS RUNNING. It never pauses, and that includes here.
 * `useSessionClock` is driven by `mode !== null`, which is still true,
 * so this needs no code to be right — but it needs saying, because the
 * prototype stopped the clock at this step and that was a bug in the
 * prototype rather than a decision.
 * =====================================================================
 */
function WrapStep({
  seconds, mode, drills, surface, saving, onLog,
}: {
  seconds: number;
  mode: SessionMode;
  drills: CompletedDrill[];
  surface: DrillSurface;
  saving: boolean;
  onLog: (feel: 1 | 2 | 3 | 4 | null, extras: WrapExtras) => void;
}) {
  const rated = drills.filter(d => d.feel !== null);
  const derived = rated.length > 0
    ? (Math.round(
        rated.reduce((sum, d) => sum + (d.feel as number), 0) / rated.length,
      ) as 1 | 2 | 3 | 4)
    : null;

  const [picked, setPicked] = useState<1 | 2 | 3 | 4 | null>(derived);
  const [showOverride, setShowOverride] = useState(false);
  const overrode = derived !== null && picked !== derived;

  // WHAT HAPPENED, not how it went. These land on the practice log
  // beside the duration and never feed a status — evidence sets
  // status, and a ticked box is not evidence.
  const [activities, setActivities] = useState<PracticeActivity[]>([]);
  const [touched, setTouched] = useState<readonly string[]>(
    surface.openedOnScopeId !== null ? [surface.openedOnScopeId] : [],
  );
  const [note, setNote] = useState('');
  const openedOnLabel = surface.wrapSections
    ?.find(sec => sec.id === surface.openedOnScopeId)?.label ?? null;

  const wordFor = (feel: 1 | 2 | 3 | 4) =>
    FEEL_CARD_OPTIONS.find(o => o.value === feel)?.label ?? '';

  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      <div className="rounded-md border-l-[3px] border-developing bg-developing/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
        <b>Practice stops at Developing.</b> However this session is rated, it
        cannot claim <b>Fluent</b>. A test at target can.
      </div>

      {drills.length > 0 && (
        <div>
          <SectionLabel>This Session</SectionLabel>
          <DrillList mode={mode} drills={drills} surface={surface} />
        </div>
      )}

      {derived !== null ? (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
              This Session Reads
            </span>
            <span className="text-sm font-medium">
              {picked !== null ? wordFor(picked) : ''}
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 leading-snug">
            {overrode
              ? <>You changed this from {wordFor(derived)}, which is what the drills averaged to.</>
              : <>Averaged from your {rated.length} rated drill{rated.length > 1 ? 's' : ''}. A test takes the lowest of three; a practice session takes the average of what you did.</>}
          </p>

          {!showOverride ? (
            <button
              type="button"
              onClick={() => {
                if (overrode) setPicked(derived);
                else setShowOverride(true);
              }}
              className="text-[11px] font-medium text-neutral-500 hover:text-fluent"
            >
              {overrode ? 'Change It Back' : 'Disagree?'}
            </button>
          ) : (
            <div className="space-y-2">
              <SectionLabel>Set It Yourself</SectionLabel>
              <div className="grid grid-cols-1 gap-2">
                {[...FEEL_CARD_OPTIONS].reverse().map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setPicked(opt.value); setShowOverride(false); }}
                    className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${opt.inactiveClass}`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="ml-2 opacity-70 text-xs">
                      {opt.hint}
                      {opt.value === derived ? ' · what your drills averaged to' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <SectionLabel
            hint={drills.length > 0 ? 'None of your drills were rated' : 'No drills this session'}
          >
            How Did It Go
          </SectionLabel>
          <div className="grid grid-cols-1 gap-2">
            {[...FEEL_CARD_OPTIONS].reverse().map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPicked(picked === opt.value ? null : opt.value)}
                className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                  picked === opt.value ? opt.activeClass : opt.inactiveClass
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="ml-2 opacity-70 text-xs">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {surface.wrapAsksActivities && (
        <div>
          <SectionLabel hint="Pick any that apply">What Did You Work On</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {PRACTICE_ACTIVITY_OPTIONS.map(opt => {
              const on = activities.includes(opt.activity);
              return (
                <button
                  key={opt.activity}
                  type="button"
                  onClick={() => setActivities(prev => on
                    ? prev.filter(a => a !== opt.activity)
                    : [...prev, opt.activity])}
                  className={`px-2.5 py-1 rounded-md border text-xs ${
                    on
                      ? 'bg-fluent text-white border-fluent font-medium'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {surface.wrapSections !== null && (
        <div>
          <SectionLabel
            hint={openedOnLabel !== null ? `You started on ${openedOnLabel}` : undefined}
          >
            Sections You Touched
          </SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {surface.wrapSections.map(sec => {
              const on = touched.includes(sec.id);
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setTouched(prev => on
                    ? prev.filter(id => id !== sec.id)
                    : [...prev, sec.id])}
                  className={`px-2.5 py-1 rounded-md border text-xs ${
                    on
                      ? 'bg-fluent text-white border-fluent font-medium'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {sec.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <SectionLabel hint="Optional">A Note, If You Want One</SectionLabel>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="what worked, what didn't, voicings to revisit"
          className="w-full min-h-[3.4rem] rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent px-2.5 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => onLog(picked, { activities, touched, note })}
          className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Log The Session'}
        </button>
        {/* ONLY WHERE THERE IS NOTHING TO SKIP. With a reading on
            screen the button would offer to discard a number the user
            can already change. */}
        {picked === null && derived === null && (
          <button
            type="button"
            onClick={() => onLog(null, { activities, touched, note })}
            className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            Skip The Rating
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

/**
 * What the sitting CONSISTED OF, as opposed to how it went.
 *
 * These go to the practice log, never to a status. The distinction is
 * a written rule: the log records what happened in a sitting; the
 * rating records how it went. Evidence sets status — a note and a
 * ticked activity box do not.
 */
interface WrapExtras {
  activities: PracticeActivity[];
  touched: readonly string[];
  note: string;
}

/** What the session did, as the done step reports it. */
interface Outcome {
  kind: SessionMode;
  /** Set only when a test was PASSED. Null for a practice sitting and
   *  for a test that ended without three in a row — both of which are
   *  ordinary endings, not failures to report. */
  passed: { earned: TestPassEarned; keyName: string | null } | null;
  /** The session's own rating, where practice gave one. */
  feel: 1 | 2 | 3 | 4 | null;
  /** Whether that rating came from averaging the drills. */
  derived: boolean;
  /** What the item reads now, from the shared reader. */
  verdict: BandVerdict;
}

/** The average of the rated drills, or null when none were rated.
 *  Shared by the wrap and the done step so "averaged" cannot mean two
 *  different things a screen apart. */
function derivedFeelOf(
  drills: ReadonlyArray<CompletedDrill>,
): 1 | 2 | 3 | 4 | null {
  const rated = drills.filter(d => d.feel !== null);
  if (rated.length === 0) return null;
  return Math.round(
    rated.reduce((sum, d) => sum + (d.feel as number), 0) / rated.length,
  ) as 1 | 2 | 3 | 4;
}

/** The band's own word, from the app's one vocabulary. */
function verdictWord(v: BandVerdict): string {
  switch (v.kind) {
    case 'not-started': return TIER_LABEL.untouched;
    case 'started': return TIER_LABEL.started;
    case 'band':
      switch (v.band) {
        case 'needs-work': return TIER_LABEL.needsWork;
        case 'developing': return TIER_LABEL.developing;
        case 'fluent': return TIER_LABEL.fluent;
        case 'mastered': return TIER_LABEL.mastered;
      }
  }
}

/**
 * What the session did.
 *
 * =====================================================================
 * THE SESSION IS THE UNIT, so the session is what reports back. Before
 * this the panel simply closed and you found out by navigating back
 * and looking — which asks you to rate something and then declines to
 * say what the rating did.
 *
 * "NOW READS" IS THE ITEM, NOT THE RATING, and it comes from
 * `surface.readVerdict()` rather than being computed here. A second
 * opinion about a number the shared reader owns would drift the first
 * time the band rule moved, which it has twice in a day.
 *
 * The clock is gone from this step on purpose: the sitting is over,
 * and a running clock would say otherwise.
 * =====================================================================
 */
function DoneStep({ outcome, onClose }: {
  outcome: Outcome;
  onClose: () => void;
}) {
  const word = verdictWord(outcome.verdict);
  const banded = outcome.verdict.kind === 'band' ? outcome.verdict.band : null;
  const feelWord = outcome.feel === null
    ? null
    : FEEL_CARD_OPTIONS.find(o => o.value === outcome.feel)?.label ?? null;
  // Practice rated Clean or better, and the ceiling took it to
  // Developing anyway. The prototype's `capped`.
  const capped = outcome.kind === 'practice'
    && outcome.feel !== null && outcome.feel >= 3
    && banded === 'developing';

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
            Now Reads
          </span>
          <span className="text-sm font-medium">{word}</span>
        </div>
      </div>

      <div className="rounded-md border-l-[3px] border-fluent bg-fluent/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
        {outcome.kind === 'test' ? (
          banded === 'fluent' || banded === 'mastered'
            ? <><b>Three at target, all clean.</b> That&rsquo;s the claim made and recorded.</>
            : <>
                Three drills at target, each rated. The lowest set it.
                {banded === 'developing'
                  ? ' That brings this back in about a week rather than a month — which is what you want after a run went wrong.'
                  : ''}
              </>
        ) : capped ? (
          <>
            <b>Practice stops at Developing.</b> That session came out at Clean
            or better, but practice cannot claim <b>Fluent</b>. Go to Test mode
            and nail it at target, and it can.
          </>
        ) : feelWord !== null ? (
          <>
            Logged as <b>{feelWord}</b>
            {outcome.derived ? ', averaged from the drills inside it.' : '.'}
            {' '}Practice moves you as far as <b>Developing</b>.
          </>
        ) : (
          <>
            Logged with no ratings. <b>Started</b> means you met it and the
            clock proves it — there is just no verdict yet.
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
      >
        Close
      </button>
    </div>
  );
}

import MetronomeControl from '../../../components/MetronomeControl';
import StreakCircles from './StreakCircles';
import { formatClock } from '../../shapes-and-patterns/practiceTest/sessionClock';
import type { Feel } from '../../../lib/fluencyScale';
import RatingChips from '../../shapes-and-patterns/practiceTest/RatingChips';

/**
 * The session, as a bar across the top of the lead sheet.
 *
 * =====================================================================
 * OPEN LEAD SHEET BREAKS THE PANEL APART. IT DOES NOT STACK.
 *
 * The sheet is not opened inside the panel or on top of it — the
 * panel's controls become this strip and the sheet gets the rest of
 * the screen. Anything else means reading a chart through a window,
 * which is not reading a chart.
 *
 * The strip is sticky, so it survives scrolling to bar 40. A session
 * you can only end by scrolling back to the top is a session that gets
 * left running.
 *
 * =====================================================================
 * THE APP NEVER SAYS "SESSION" OR "RUN" ON ITS OWN.
 *
 * Every label here names which kind: Practice Session / Testing
 * Session, Practice Run / Test Run. Not shorthand, not once the
 * context "makes it obvious" — the two modes sit one tap apart and
 * produce different records, and a bar reading "Session 04:12" is the
 * same bar in both.
 *
 * "Testing session", not "test session", so it matches the rule
 * sentence the rest of the app states.
 *
 * =====================================================================
 * HOW A RUN ENDS DIFFERS BY MODE, AND THAT IS TWO MODELS.
 *
 *   TEST RUN       ends by rating it. Rating is required on a test, so
 *                  the four chips ARE the finish. There is no Finish
 *                  Run button, and adding one would offer a way to end
 *                  a test run without the rating the test is made of.
 *   PRACTICE RUN   ends by rating it OR by Finish Run. Rating is
 *                  optional in practice, so there has to be a way to
 *                  stop without one.
 *
 * `onFinishRun` is null on a test rather than a `kind` check inside
 * this component, so the absence of the button is the absence of a
 * handler and the two cannot drift.
 *
 * =====================================================================
 * PAUSE IS DRAWN HERE. WHAT HAPPENS ON REOPENING IS NOT.
 *
 * Pausing acts on the session, and the paused state says the clock has
 * stopped. The three choices offered when a paused session is REOPENED
 * — resume, bank the time, discard — are unwritten and belong to the
 * Pause build. This component does not know about them and must not
 * grow a guess at them.
 * =====================================================================
 *
 * Copy: `docs/WHOLE_SONG_TEST_COPY.md` and its 29 Aug 2026 addendum.
 */

export type SessionKind = 'testing' | 'practice';

/** Which words each mode uses, in one place, so no label is composed
 *  at a call site. */
const WORDS: Record<SessionKind, {
  session: string;
  run: string;
  save: string;
}> = {
  testing: {
    session: 'Testing Session',
    run: 'Test Run',
    save: 'Save Runs',
  },
  practice: {
    session: 'Practice Session',
    run: 'Practice Run',
    save: 'Log Practice Session',
  },
};

interface Props {
  kind: SessionKind;
  /**
   * Whether the metronome is sounding. Named on screen because in the
   * strip there is no heading above it to say what the word refers to.
   */
  metronomeOn: boolean;
  /**
   * Why a test run cannot start, or null when it can.
   *
   * It sits ABOVE the button rather than in a tooltip on it: a
   * disabled control with the reason hidden behind a hover is a dead
   * end on a touch screen, and this is a screen used at a keyboard.
   */
  blockReason: string | null;
  /**
   * The run in progress ended because the metronome stopped, and the
   * question has not been answered yet.
   *
   * Requiring the metronome to START a run means nothing if it can be
   * stopped a second later, so stopping it ends the run. It does not
   * DISCARD it — only the player knows whether he had already got to
   * the end, and the whole rating system already takes his word for
   * Clean versus Struggled.
   */
  awaitingVerdict: boolean;
  /** Throw away the run in progress. See `awaitingVerdict`. */
  onDiscardRun: () => void;
  /** The metronome was stopped from the strip's own button. Reported
   *  from the press rather than watched, so a `forceStop` from
   *  elsewhere cannot end a run. */
  onMetronomeStopped: () => void;
  /**
   * What was just discarded and why, or empty.
   *
   * Pause names the run it took, because the session was paused and
   * the run was not — and the two would otherwise look like the same
   * event.
   */
  discardedMessage: string;
  /** Whole seconds the session has run for. */
  sessionSeconds: number;
  /** Whole seconds into the run in progress, or null when none is. */
  runSeconds: number | null;
  /** Which run is next, for `Start Test Run {n}`. Testing only. */
  nextRunNumber: number;
  paused: boolean;
  onPauseToggle: () => void;
  /**
   * The streak so far, 0–3, or null where there is no streak to show.
   *
   * Null on practice — practice has no streak, and an empty set of
   * three slots would promise one.
   */
  streak: number | null;
  /** True when the last gate-relevant run was not clean. */
  streakBroken: boolean;
  /** End the run in progress by rating it. */
  onRate: (feel: Feel) => void;
  onStartRun: () => void;
  /** End the run WITHOUT rating it. Null on a test — see the header. */
  onFinishRun: (() => void) | null;
  /** `Save Runs`, or `Log Practice Session`. */
  onSave: () => void;
  /** Back to the panel the strip came from. */
  onBack: () => void;
}

export default function SessionStrip({
  kind, metronomeOn, blockReason, awaitingVerdict, onDiscardRun,
  onMetronomeStopped,
  discardedMessage, sessionSeconds, runSeconds, nextRunNumber, paused,
  onPauseToggle, streak, streakBroken, onRate, onStartRun, onFinishRun,
  onSave, onBack,
}: Props) {
  const words = WORDS[kind];
  const inRun = runSeconds !== null;

  return (
    <div
      className={[
        'sticky top-0 z-10 flex items-center gap-2 flex-wrap',
        'px-3 py-2 border-b',
        paused
          ? 'bg-needswork/10 border-needswork/30'
          : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onPauseToggle}
        className="px-2.5 py-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        {paused ? 'Resume' : 'Pause'}
      </button>

      <Clock label={words.session} seconds={sessionSeconds} />

      {/* THE RUN CLOCK EXISTS ONLY WHILE A RUN DOES. A 00:00 sitting
          there between runs would read as a run that had not started
          rather than as no run at all. */}
      {inRun && (
        <>
          <Divider />
          <Clock label={words.run} seconds={runSeconds} />
        </>
      )}

      <Divider />
      <MetronomeControl onStoppedByUser={onMetronomeStopped} />
      {/* THE WORD TRAVELS WITH THE STATE. In a panel there is a heading
          above the metronome saying what it is; in a strip there is
          not, so a lit dot would be a colour with no noun. */}
      <span
        className={[
          'text-[10px] uppercase tracking-wider font-semibold',
          metronomeOn ? 'text-fluent' : 'text-neutral-400',
        ].join(' ')}
      >
        {metronomeOn ? 'Metronome Active' : 'Metronome Silent'}
      </span>

      {/* THE STREAK, WHERE THERE IS ONE. No caption — the strip has no
          room for the sentence the panel carries, and the circles are
          the same circles. */}
      {streak !== null && (
        <>
          <Divider />
          {/* DRAWN ALWAYS DURING A TEST, not once a run is banked.
              Circles that appear on the first success and vanish on a
              reset take the count away at exactly the moment it matters
              most — and the run number keeps climbing either way, so
              without them the two readings look like a contradiction. */}
          <StreakCircles
            count={streak}
            broken={streakBroken}
            size="sm"
            label={`${streak} of 3 clean run-throughs in a row`}
          />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
            {streak} of 3
          </span>
        </>
      )}

      <div className="flex-1" />

      {inRun ? (
        <>
          {/* THE FOUR CHIPS ARE HOW A RUN FINISHES. On a test that is
              the only way, which is why they sit where a Finish button
              would otherwise be. The same component the panel uses —
              one rendering of the four ratings, so a run rated here and
              a run rated there are visibly the same question. */}
          <RatingChips onRate={onRate} dense />
          {/* PRACTICE ONLY. Null handler, null button — see the header. */}
          {onFinishRun !== null && (
            <button
              type="button"
              onClick={onFinishRun}
              className="px-2.5 py-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Finish Run
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={onStartRun}
          disabled={paused || blockReason !== null}
          className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {kind === 'testing'
            ? `Start Test Run ${nextRunNumber}`
            : 'Start A Practice Run'}
        </button>
      )}

      <button
        type="button"
        onClick={onSave}
        className="px-2.5 py-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        {words.save}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="px-2.5 py-1 text-xs rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        Back To The Session
      </button>

      {/* THE PAUSED STATE, SAID IN WORDS. The tinted bar alone is a
          colour someone can miss; this is the sentence that cannot be.
          It also says what happens to the metronome, because that is
          the part a returning player would otherwise have to discover
          by finding the Start button still disabled. */}
      {paused && (
        <div className="w-full text-xs text-needswork font-medium pt-1">
          Paused — the clock is stopped. Metronome pauses with the session.
          Resumes upon return.
        </div>
      )}

      {/* THE METRONOME STOPPED MID-RUN. Not a discard — a question.
          The chips above are still the way to answer "yes I finished
          it"; this adds the other answer, which nothing else offers. */}
      {awaitingVerdict && !paused && (
        <div className="w-full pt-1 space-y-1.5">
          <p className="text-xs text-neutral-700 dark:text-neutral-200 leading-snug">
            <b>Did you finish that run?</b> The metronome stopped, so the run
            stopped with it. Rate it if you got to the end. If you did not,
            discarding it costs you the run — your streak is untouched.
          </p>
          <button
            type="button"
            onClick={onDiscardRun}
            className="px-2.5 py-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            I didn&rsquo;t finish it — discard this run
          </button>
        </div>
      )}

      {/* WHAT WAS DISCARDED, NAMED. A run and a session are different
          things and only one of them was thrown away. */}
      {discardedMessage !== '' && !awaitingVerdict && (
        <div className="w-full text-xs text-neutral-500 dark:text-neutral-400 pt-1">
          {discardedMessage}
        </div>
      )}

      {/* THE RESET, SAID OUT LOUD. The run number keeps climbing while
          the streak returns to zero, and without a sentence the two
          readings look like a contradiction rather than a rule. */}
      {streakBroken && !awaitingVerdict && (
        <div className="w-full text-xs text-needswork pt-1 leading-snug">
          That run was below Clean, so the streak starts over — back to{' '}
          <b>0 of 3</b>. The runs before it are still logged.
        </div>
      )}

      {/* WHY THE RUN CANNOT START, ABOVE THE BUTTON RATHER THAN ON IT.
          A disabled control with its reason behind a hover is a dead
          end on a touch screen, and it is the one place someone is
          actually stuck. */}
      {blockReason !== null && !inRun && !paused && (
        <div className="w-full text-xs text-neutral-600 dark:text-neutral-300 pt-1 leading-snug">
          {blockReason}
        </div>
      )}
    </div>
  );
}

/** A labelled clock. The label always names which kind of session or
 *  run it is; there is no unlabelled variant to reach for. */
function Clock({ label, seconds }: { label: string; seconds: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-sm font-mono tabular-nums text-neutral-800 dark:text-neutral-100">
        {formatClock(seconds)}
      </span>
      <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
        {label}
      </span>
    </span>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      className="w-px h-5 bg-neutral-200 dark:bg-neutral-700"
    />
  );
}

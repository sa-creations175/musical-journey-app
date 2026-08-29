import { useCallback, useMemo, useState, type ReactNode } from 'react';
import TestPassedScreen from './TestPassedScreen';
import StreakCircles from './StreakCircles';
import { useSessionClock } from '../../shapes-and-patterns/practiceTest/sessionClock';
import Modal from '../../../components/Modal';
import {
  type Song,
  type SongCell,
  type SongKey,
  type SongKeyRunThrough,
  type SongKeyState,
} from '../../../lib/db';
import {
  HISTORY_WINDOW_DAYS,
  MAX_SITTINGS_SHOWN,
  summariseKeyRunHistory,
  type SittingSummary,
} from './keyRunHistory';
import {
  type KeyAttemptDraft,
  isInTempoRange,
  attemptWasClean,
  projectKeyConsecutiveCleanCount,
  saveKeyAttemptsAndRollup,
} from './cellRollup';
import { spellKey } from '../../../lib/spelling';
import { useSongSpelling } from '../useSongSpelling';
import type { Feel } from '../../../lib/fluencyScale';
import { FEEL_CARD_OPTIONS } from '../../shapes-and-patterns/drillModel';
import { TEST_RULE_SENTENCE } from '../testRule';

/**
 * Whole-song test modal — the gate from comfortable → solid at the
 * key level. Mirrors CellInteractionModal in shape and gate
 * semantics, just one level up: the user logs full run-throughs of
 * the song in this key, 3 consecutive clean at-or-above-floor runs
 * unlocks "Mark solid."
 *
 * Discrete-session semantics: unlike cells (where consecutiveCleanCount
 * persists on the cell row across modal opens), the whole-song test
 * resets to 0/3 every time the modal opens. Each test session is a
 * fresh demonstration — the user has to put together 3 in a row IN
 * ONE SITTING to pass. Historical run-throughs still accumulate in
 * songKeyRunThroughs for the strip's attempts counter and analytics,
 * but they don't carry into the in-modal projection. Rationale: the
 * whole-song test is a graduation moment, not ongoing practice; a
 * streak that bridged across days would dilute that meaning.
 *
 * isRetest: false in step 5. Set true by the future decay-retest
 * flow when the modal is opened in response to a solidDecayState
 * lapse. The schema column is plumbed through now so the audit log
 * tags every row consistently from day one.
 *
 * P3 polish (deferred):
 *   - "Clear all" + "Reset progress" symmetric to the cell modal.
 *   - Per-attempt or per-session notes (no notes field on songKey;
 *     would need to attach to the last run-through row or schema-
 *     bump songKeys with a notes column).
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after the save commits, before handleClose. Used by the
   *  parent to bump its refreshKey so useLiveQuery re-fires — same
   *  workaround as VacationManager. Without this, the parent's
   *  songKeys array stays stale even though the row was persisted,
   *  so KeyStrip's live-derive sees pre-save decay state. */
  onSaved?: () => void;
  /**
   * The matrix row for this key, as it reads after a pass.
   *
   * Owned by the caller because the caller owns the grid: it has the
   * sections, the cells and the bands, and `KeyRow` is the one thing
   * that draws a matrix row. Rendered lazily so it is evaluated after
   * `onSaved` has refreshed the data behind it.
   */
  renderPassedPreview: () => ReactNode;
  songKey: SongKey;
  song: Song;
  /** All cells for this songKey. The rollup needs them to recompute
   *  keyState when the test passes (which can flip comfortable →
   *  solid only when all cells are still comfortable). */
  siblingCells: ReadonlyArray<SongCell>;
  /** Total non-archived sections for the song. */
  totalSections: number;
  /** Every run-through recorded against this key, of both kinds.
   *  Passed down rather than queried here — the parent already
   *  subscribes to the table for the strip counters, and a second
   *  subscription for the same rows is a second thing to keep in
   *  sync. */
  pastRuns: ReadonlyArray<SongKeyRunThrough>;
  /** True when this is a retest after a decay lapse. Determined by
   *  the parent from the key's live-derived decay state. Affects
   *  title + rule reminder copy + the audit-log isRetest column. A
   *  retest pass is the only way to clear the lapsed sticky state. */
  isRetest: boolean;
}

export default function WholeSongTestModal({
  open,
  onClose,
  onSaved,
  renderPassedPreview,
  songKey,
  song,
  siblingCells,
  totalSections,
  pastRuns,
  isRetest,
}: Props) {
  const spelling = useSongSpelling(song);
  const [attempts, setAttempts] = useState<KeyAttemptDraft[]>([]);
  const [bpmInput, setBpmInput] = useState<string>(String(song.tempo ?? ''));
  const [busy, setBusy] = useState(false);
  /**
   * Set when a gate-relevant not-clean run knocks the streak back to
   * zero, cleared on the next attempt.
   *
   * Raised HERE rather than by watching `projectedCount` fall,
   * because the count also falls when an attempt is deleted from the
   * log — an edit, not a failed run. Flashing on that would tell the
   * user they lost a streak they are in the middle of correcting.
   */
  const [streakBroken, setStreakBroken] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /**
   * The test has been passed and this window is now the result screen.
   *
   * =====================================================================
   * THE THIRD CLEAN RUN IS THE PASS. There is no Save step, and the
   * button that used to be one is gone.
   *
   * It was called "Mark solid", then "Pass the test", and either way it
   * asked the user to confirm something they had already done. Worse,
   * it was reachable and ignorable: three clean runs with the button
   * left unpressed was a passed test the app did not record, and the
   * only sign was a modal that closed like any other.
   *
   * So passing ends the test where it happens. `Save Attempts` stays,
   * because leaving a session with runs logged and the streak
   * unfinished is a real thing to want — it is a way out, not a way to
   * pass.
   * =====================================================================
   */
  const [passed, setPassed] = useState(false);
  /**
   * The testing session's clock.
   *
   * =====================================================================
   * IT RUNS FROM OPENING THE TEST TO PASSING IT, AND DOES NOT STOP.
   *
   * Not between runs, not while the rating is being chosen. The minute
   * spent deciding how a run went is a minute at the keyboard, and a
   * clock that paused for the bits between would report less than
   * happened, silently. Same reasoning as the shell's session clock,
   * which is where this comes from rather than a second one.
   *
   * It keeps running while the result screen shows, and the result
   * screen freezes the number it was handed at the moment of the pass —
   * see `passedAtSeconds`. A live clock behind a screen that says
   * "recorded" would disagree with the record within a second.
   * =====================================================================
   */
  const sessionSeconds = useSessionClock(open && !passed);
  const [passedAtSeconds, setPassedAtSeconds] = useState(0);
  // Captured once per open rather than read during render, and it is
  // the boundary of a 30-day window — a modal left open overnight
  // showing yesterday's window is not a problem worth a ticking clock.
  const [historyNow] = useState(() => Date.now());
  const history = useMemo(
    () => summariseKeyRunHistory(pastRuns, historyNow),
    [pastRuns, historyNow],
  );

  const handleClose = useCallback(() => {
    setAttempts([]);
    setBpmInput('');
    setBusy(false);
    setStreakBroken(false);
    setPassed(false);
    setPassedAtSeconds(0);
    onClose();
  }, [onClose]);

  const performanceTempo = song.tempo ?? null;
  // Discrete sessions: starting count is implicitly 0 inside the
  // helper. See projectKeyConsecutiveCleanCount comment.
  const projectedCount = projectKeyConsecutiveCleanCount(
    attempts,
    performanceTempo,
  );
  // Mark solid is reachable on initial promotion (key not yet solid)
  // AND on retest (key is solid but lapsed → re-pass clears the
  // lapse). The only state where it stays disabled is "solid and not
  // lapsed" — there's nothing to re-confirm in that case.
  // The test is available on every key now, so it opens routinely on
  // keys whose sections are not comfortable. A pass there records the
  // whole-song test but cannot make the key Solid — `keyState` is
  // recomputed from the CELLS. Both the reminder and the button label
  // have to say so, or the screen promises something the save will
  // not do. This is a statement of what happens, not a warning about
  // taking a shortcut: nothing here is ahead of anything.
  const sectionsIncomplete = songKey.keyState !== 'comfortable';
  // `canMarkSolid` used to live here and gate a button. There is no
  // button: the third clean run IS the pass, so the only reader of
  // "has the streak reached three" is `handleAddAttempt`, which asks
  // the projection directly about the run just rated.
  const hasContent = attempts.length > 0;

  const parsedBpm = parseInt(bpmInput, 10);
  const bpmValid = Number.isFinite(parsedBpm) && parsedBpm > 0;

  const handleAddAttempt = (feel: Feel) => {
    if (!bpmValid || busy || passed) return;
    // A below-floor run neither advances nor resets the gate — see
    // projectConsecutiveCleanCount — so a slow not-clean pass must not
    // announce a reset that did not happen.
    const gateRelevant = isInTempoRange(parsedBpm, performanceTempo);
    setStreakBroken(feel < 3 && gateRelevant && projectedCount > 0);
    const next = [
      ...attempts,
      {
        id: `keyattempt-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`,
        bpm: parsedBpm,
        feel,
      },
    ];
    setAttempts(next);

    // THE PASS IS DECIDED HERE, FROM `next`, NOT FROM STATE.
    // `projectedCount` above is last render's answer and does not
    // include the run just rated; asking it would pass the test one
    // run late, which on a three-run streak is the difference between
    // ending at three and ending at four.
    if (projectKeyConsecutiveCleanCount(next, performanceTempo) >= 3) {
      void handlePass(next);
    }
  };

  /**
   * Record the pass and take the window over.
   *
   * The save is not optional and not offered: the runs are already
   * played, and a failure to write them must not look like a test that
   * did not happen. On a write failure the result screen does NOT
   * appear — the runs stay in the log and `Save Attempts` is still
   * there, which is a recoverable state rather than a congratulation
   * for something unrecorded.
   */
  const handlePass = async (finalAttempts: KeyAttemptDraft[]) => {
    setBusy(true);
    try {
      await saveKeyAttemptsAndRollup({
        songKey,
        attempts: finalAttempts,
        markSolid: true,
        performanceTempo,
        isRetest,
        siblingCells,
        expectedSectionCount: totalSections,
        now: Date.now(),
      });
      onSaved?.();
      // Captured BEFORE the flag that stops the clock, so the number on
      // the screen is the session as it stood when the test was passed.
      setPassedAtSeconds(sessionSeconds);
      setPassed(true);
    } catch (err) {
      console.warn('[matrix] whole-song test pass failed', err);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAttempt = (id: string) => {
    setAttempts(prev => prev.filter(a => a.id !== id));
    setStreakBroken(false);
  };

  const handleSave = async (markSolid: boolean) => {
    if (busy || !hasContent) return;
    setBusy(true);
    try {
      await saveKeyAttemptsAndRollup({
        songKey,
        attempts,
        markSolid,
        performanceTempo,
        isRetest,
        siblingCells,
        expectedSectionCount: totalSections,
        now: Date.now(),
      });
      onSaved?.();
      handleClose();
    } catch (err) {
      console.warn('[matrix] whole-song test save failed', err);
      setBusy(false);
    }
  };

  // PASSED: THE RESULT SCREEN TAKES OVER THE WINDOW. Not a banner
  // above the log and not a step after it — §4 says it takes over from
  // whichever view was showing, and a log of the runs still sitting
  // underneath would invite one more.
  //
  // NO FOOTER either, because the screen has the single exit the spec
  // asks for. Leaving Cancel and Save Attempts below it would offer
  // three ways out of a window that is finished.
  if (passed) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title={`${song.title} · ${spellKey(songKey.keyName, spelling)}`}
      >
        <TestPassedScreen
          earned={{
            kind: 'whole-song',
            songTitle: song.title,
            // FIXED, not derived. There is no higher rung one key's
            // test can reach — Cross-key needs other keys.
            status: 'comfortable',
          }}
          keyName={spellKey(songKey.keyName, spelling)}
          sessionSeconds={passedAtSeconds}
          preview={renderPassedPreview()}
          onClose={handleClose}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`${isRetest ? 'Whole-Song Retest' : 'Whole-Song Test'} · ${spellKey(songKey.keyName, spelling)} · ${song.title}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave(false)}
              disabled={!hasContent || busy}
              className="px-3 py-1.5 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Attempts
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <RuleReminder
          performanceTempo={performanceTempo}
          keyAlreadySolid={false}
          isRetest={isRetest}
          sectionsIncomplete={sectionsIncomplete}
        />

        <StateHeader
          keyState={songKey.keyState}
          projectedCount={projectedCount}
          isRetest={isRetest}
          performanceTempo={performanceTempo}
        />

        <StreakMeter
          count={projectedCount}
          streakBroken={streakBroken}
          performanceTempo={performanceTempo}
        />

        <AttemptLog
          attempts={attempts}
          onDelete={handleDeleteAttempt}
          performanceTempo={performanceTempo}
        />

        <AddAttemptArea
          bpmInput={bpmInput}
          onBpmChange={setBpmInput}
          bpmValid={bpmValid}
          onRate={handleAddAttempt}
        />

        {/* Last, and collapsed. The sitting above is what you are
            doing; this is context for it. */}
        <PastAttempts
          history={history}
          open={historyOpen}
          onToggle={() => setHistoryOpen(o => !o)}
        />
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------

function RuleReminder({
  performanceTempo,
  keyAlreadySolid,
  isRetest,
  sectionsIncomplete,
}: {
  performanceTempo: number | null;
  keyAlreadySolid: boolean;
  isRetest: boolean;
  /** The sections in this key are not all comfortable, so a pass
   *  cannot make the key Solid and the copy must not say it will. */
  sectionsIncomplete: boolean;
}) {
  // The floor, the streak and the sitting boundary all moved to
  // StreakMeter, which sits directly beneath this and shows them as
  // slots. This block now says only what PASSING does, which differs
  // by state and is the part the meter cannot show.
  void performanceTempo;

  if (isRetest) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-800 dark:text-red-200">
        This key has lapsed since you last demonstrated it. Passing a retest
        clears the lapse and restores <b>Solid</b> — engagement alone does not.
      </div>
    );
  }
  if (keyAlreadySolid) {
    // Solid + not lapsed + opened anyway (e.g., via a future "review"
    // affordance). Re-attempts log to audit but don't change state.
    return (
      <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
        This key is already at <b>Solid</b>.
        Re-attempts log to the audit trail but don't change the key's state.
      </div>
    );
  }
  if (sectionsIncomplete) {
    // Same neutral styling as the standard copy — this is what the
    // test does from here, not a caution about how you got here. Only
    // the outcome differs: keyState is recomputed from the CELLS on a
    // pass, so a key whose sections are not comfortable stays where it
    // is, and what a pass moves is the SONG.
    return (
      <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 border border-black/[0.07] px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
        Play through the full song in this key. Log each attempt as clean or
        not-clean.{' '}
        Passing moves the song to <b>Comfortable</b>.
        It will not make this key <b>Solid</b> — that needs every section here
        comfortable too, which is what working them one at a time is for.
      </div>
    );
  }
  return (
    <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 border border-black/[0.07] px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
      Play through the full song in this key. Log each attempt as clean or
      not-clean. Every section here is comfortable, so passing{' '}
      unlocks <b>Solid</b> for this key.
    </div>
  );
}

// -------------------------------------------------------------------

const KEY_STATE_BADGE: Record<SongKeyState, { label: string; className: string }> = {
  comfortable:  { label: 'Comfortable',  className: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200' },
  learning:     { label: 'Learning',     className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  not_started:  { label: 'Not Started',  className: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' },
};

function StateHeader({
  keyState,
  projectedCount,
  isRetest,
  performanceTempo,
}: {
  keyState: SongKeyState;
  projectedCount: number;
  isRetest: boolean;
  performanceTempo: number | null;
}) {
  const badge = KEY_STATE_BADGE[keyState];
  const remaining = Math.max(0, 3 - projectedCount);
  const gateSuffix = performanceTempo !== null
    ? ` at or above ♩ ${performanceTempo - 10}`
    : '';

  // There is always a gate to reach now: the test's pass timestamp is
  // the Comfortable criterion, and it can be re-demonstrated. The old
  // condition existed to hide the hint on a key that was already
  // Solid, and that state no longer exists.
  const showHint = true;

  // Readiness only. "1 more clean run needed" beside a meter reading
  // 2 of 3 is the same fact twice, and the meter states it better.
  const hint: { text: string; tone: 'ready' } | null =
    showHint && remaining === 0
      ? {
          text: isRetest ? 'Ready to mark solid (re-pass)' : 'Ready to mark solid',
          tone: 'ready',
        }
      : null;
  void gateSuffix;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium ${badge.className}`}>
        {badge.label}
      </span>
      {hint && (
        <span className={[
          'text-xs',
          hint.tone === 'ready'
            ? 'text-blue-600 dark:text-blue-400 font-medium'
            : 'text-neutral-500 dark:text-neutral-400',
        ].join(' ')}>
          {hint.text}
        </span>
      )}
    </div>
  );
}

/**
 * Three slots that fill as clean runs land.
 *
 * ---------------------------------------------------------------
 * WHY A METER AND NOT A COUNT.
 *
 * This replaces a row of 8px dots wedged between a state badge and a
 * sentence, which read as a bare number: hard to see, and doing
 * nothing for the part of you that wants to finish the set. The bar
 * is three in a row — the slots should look like three things to
 * fill.
 *
 * THE RESET HAS TO BE SEEN HAPPENING. Getting to two and losing it is
 * information about how solid the song actually is, and it is the
 * moment the bar means anything. A number that quietly changes from 2
 * to 0 hides the only event worth noticing, so a broken streak turns
 * the slots red and says so in words until the next attempt.
 *
 * WHY CONSECUTIVE AT ALL, stated where it applies rather than left to
 * be inferred: three in a row proves it was not luck. Three clean runs
 * across a day with failures scattered between them is a materially
 * weaker claim than three back to back, and what is being trained for
 * is playing it in front of someone — once, under the pressure, no
 * retries.
 * ---------------------------------------------------------------
 */
function StreakMeter({
  count,
  streakBroken,
  performanceTempo,
}: {
  count: number;
  streakBroken: boolean;
  performanceTempo: number | null;
}) {
  // A SENTENCE, NOT A FRAGMENT. It used to slot inside the rule
  // ("Three clean run-throughs at or above ♩ 90, ...") — impossible now
  // that the rule is one fixed string. The words are TestStep's, which
  // already stated this same floor its own way; there is no new copy
  // here, only a different join.
  const floorText = performanceTempo !== null
    ? ` At or above ${performanceTempo - 10} bpm counts.`
    : '';
  return (
    <div
      className={[
        'rounded-md border px-3 py-2.5 flex flex-col gap-2 transition-colors',
        streakBroken
          ? 'border-needswork/40 bg-needswork/5'
          : 'border-black/[0.07] bg-neutral-50 dark:bg-neutral-900',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <StreakCircles
          count={count}
          broken={streakBroken}
          label={`${count} of 3 clean run-throughs in a row`}
        />
        <span className={[
          'text-sm font-medium tabular-nums',
          streakBroken ? 'text-needswork' : 'text-neutral-700 dark:text-neutral-200',
        ].join(' ')}>
          {streakBroken ? 'not clean — back to 0 of 3' : `${count} of 3 in a row`}
        </span>
      </div>
      {/* THE SITTING BOUNDARY, stated next to the thing it governs.
          A sitting is one opening of this window: the streak starts at
          0 every time it opens and is not stored between opens. It is
          not a time gap and not a calendar day. Said here because a
          rule you only find out about by losing progress to it is not
          a rule the user agreed to. */}
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
        {TEST_RULE_SENTENCE}{floorText} Any not-clean run puts it back to
        zero, and closing this window starts the count over.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------

function AttemptLog({
  attempts,
  onDelete,
  performanceTempo,
}: {
  attempts: KeyAttemptDraft[];
  onDelete: (id: string) => void;
  performanceTempo: number | null;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
        Attempts This Session
      </div>
      {attempts.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">
          No attempts logged yet. Add one below to record a run-through.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 rounded-md border border-black/[0.07] divide-y divide-neutral-200 dark:divide-neutral-800">
          {attempts.map((a, i) => (
            <AttemptRow
              key={a.id}
              attempt={a}
              index={i}
              performanceTempo={performanceTempo}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AttemptRow({
  attempt,
  index,
  performanceTempo,
  onDelete,
}: {
  attempt: KeyAttemptDraft;
  index: number;
  performanceTempo: number | null;
  onDelete: (id: string) => void;
}) {
  const belowFloor = performanceTempo !== null
    && !isInTempoRange(attempt.bpm, performanceTempo);

  return (
    <li className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <span className="text-neutral-400 tabular-nums w-5 text-right">{index + 1}.</span>
      <span className="text-neutral-700 dark:text-neutral-200 tabular-nums">♩ {attempt.bpm}</span>
      <span className="text-neutral-400">·</span>
      {attemptWasClean(attempt) ? (
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
          {FEEL_CARD_OPTIONS.find(o => o.value === attempt.feel)?.label ?? ''}
        </span>
      ) : (
        <span className="text-needswork font-medium">
          {FEEL_CARD_OPTIONS.find(o => o.value === attempt.feel)?.label ?? ''}
        </span>
      )}
      {belowFloor && (
        <span
          className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          title="Below tempo floor — doesn't count toward the solid gate"
        >
          below tempo
        </span>
      )}
      <button
        type="button"
        onClick={() => onDelete(attempt.id)}
        aria-label={`Remove attempt ${index + 1}`}
        className="ml-auto text-neutral-400 hover:text-needswork px-2 leading-none"
      >
        ×
      </button>
    </li>
  );
}

// -------------------------------------------------------------------

function AddAttemptArea({
  bpmInput,
  onBpmChange,
  bpmValid,
  onRate,
}: {
  bpmInput: string;
  onBpmChange: (next: string) => void;
  bpmValid: boolean;
  onRate: (feel: Feel) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
        Add Attempt
      </div>
      <div className="flex items-stretch gap-2">
        <label className="flex items-center gap-1.5 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">♩</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={bpmInput}
            onChange={e => onBpmChange(e.target.value)}
            placeholder="BPM"
            className="w-16 py-2 bg-transparent text-sm tabular-nums focus:outline-none"
            aria-label="Tempo BPM"
          />
        </label>
        {/* THE APP'S FOUR WORDS, not a pair of this modal's own. Clean
            or Not Clean was a second vocabulary for an act every other
            surface already rates on four steps, and it could not tell
            a run that fell apart from one that was nearly there.
            Chips rather than slabs: four buttons the width of the old
            two would push the tempo field off the row. */}
        {FEEL_CARD_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onRate(opt.value)}
            disabled={!bpmValid}
            title={opt.hint}
            className={`px-2.5 py-2 text-xs rounded-md border font-medium disabled:opacity-40 disabled:cursor-not-allowed ${opt.inactiveClass}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

/**
 * What has happened in this key over the last thirty days.
 *
 * ---------------------------------------------------------------
 * A SINGLE SITTING CANNOT TELL YOU WHETHER A SONG IS IMPROVING.
 *
 * The modal showed only the sitting in progress, which answers "am I
 * passing right now" and nothing about whether it is going better
 * lately. This answers the second question, and it is deliberately a
 * TIME window rather than a last-N list: twelve attempts could span a
 * day or six months and the list would look identical either way. An
 * empty thirty days is itself an answer.
 *
 * GROUPED BY SITTING, because that is the unit the gate is defined
 * in. Three clean runs on one afternoon and three across three weeks
 * are the same marks in a flat list and completely different claims.
 * ---------------------------------------------------------------
 *
 * Collapsed by default. The summary line is worth reading on its own,
 * so closed is still informative rather than merely tidy.
 */
function PastAttempts({
  history,
  open,
  onToggle,
}: {
  history: ReturnType<typeof summariseKeyRunHistory>;
  open: boolean;
  onToggle: () => void;
}) {
  const { sittings, totalSittings, totalRuns, capped } = history;

  if (totalRuns === 0) {
    return (
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-800 pt-2">
        No run-throughs logged in this key in the last {HISTORY_WINDOW_DAYS} days.
      </p>
    );
  }

  const passedCount = sittings.filter(s => s.passed).length;

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left text-xs text-neutral-600 dark:text-neutral-300 hover:text-fluent"
      >
        <span>
          <span className="font-medium tabular-nums">{totalRuns}</span>
          {' '}run-through{totalRuns === 1 ? '' : 's'} across{' '}
          <span className="font-medium tabular-nums">{totalSittings}</span>
          {' '}sitting{totalSittings === 1 ? '' : 's'}, last {HISTORY_WINDOW_DAYS} days
          {passedCount > 0 && (
            <span className="text-blue-600 dark:text-blue-400">
              {' '}· {passedCount} passed
            </span>
          )}
        </span>
        <span aria-hidden className="text-neutral-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {sittings.map(s => (
            <SittingRow key={s.startedAt} sitting={s} />
          ))}
          {capped && (
            /* Said out loud. A list that stops without explaining
               itself reads as the whole record. */
            <li className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-1">
              Showing the most recent {MAX_SITTINGS_SHOWN} of {totalSittings} sittings.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function SittingRow({ sitting }: { sitting: SittingSummary }) {
  const date = new Date(sitting.startedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="shrink-0 w-12 text-neutral-500 dark:text-neutral-400 tabular-nums">
        {date}
      </span>
      <span className="flex-1 flex items-center gap-1.5 flex-wrap">
        {sitting.runs.map((r, i) => (
          <span
            key={i}
            className={[
              'inline-flex items-center gap-0.5 tabular-nums',
              r.wasClean
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-needswork',
            ].join(' ')}
            title={r.wasClean ? 'Clean' : 'Not Clean'}
          >
            {r.wasClean ? '✓' : '✗'}
            <span className="text-neutral-500 dark:text-neutral-400">
              {r.tempoBpm ?? '—'}
            </span>
          </span>
        ))}
      </span>
      {sitting.kind === 'single' ? (
        /* Marked, because a lone run is not a streak attempt and
           should not read as a sitting that fell short of one. */
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">
          single run
        </span>
      ) : sitting.passed ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wide font-medium text-blue-600 dark:text-blue-400">
          passed
        </span>
      ) : (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-400 tabular-nums">
          best {sitting.bestStreak}/3
        </span>
      )}
    </li>
  );
}

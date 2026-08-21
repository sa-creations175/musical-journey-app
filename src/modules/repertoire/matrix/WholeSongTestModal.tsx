import { useCallback, useState } from 'react';
import Modal from '../../../components/Modal';
import {
  type Song,
  type SongCell,
  type SongKey,
  type SongKeyState,
} from '../../../lib/db';
import {
  type KeyAttemptDraft,
  isInTempoRange,
  projectKeyConsecutiveCleanCount,
  saveKeyAttemptsAndRollup,
} from './cellRollup';

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
  songKey: SongKey;
  song: Song;
  /** All cells for this songKey. The rollup needs them to recompute
   *  keyState when the test passes (which can flip comfortable →
   *  solid only when all cells are still comfortable). */
  siblingCells: ReadonlyArray<SongCell>;
  /** Total non-archived sections for the song. */
  totalSections: number;
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
  songKey,
  song,
  siblingCells,
  totalSections,
  isRetest,
}: Props) {
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

  const handleClose = useCallback(() => {
    setAttempts([]);
    setBpmInput('');
    setBusy(false);
    setStreakBroken(false);
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
  const sectionsIncomplete =
    songKey.keyState !== 'comfortable' && songKey.keyState !== 'solid';
  const canMarkSolid =
    (songKey.keyState !== 'solid' || isRetest) && projectedCount >= 3;
  const hasContent = attempts.length > 0;

  const parsedBpm = parseInt(bpmInput, 10);
  const bpmValid = Number.isFinite(parsedBpm) && parsedBpm > 0;

  const handleAddAttempt = (wasClean: boolean) => {
    if (!bpmValid) return;
    // A below-floor run neither advances nor resets the gate — see
    // projectConsecutiveCleanCount — so a slow not-clean pass must not
    // announce a reset that did not happen.
    const gateRelevant = isInTempoRange(parsedBpm, performanceTempo);
    setStreakBroken(!wasClean && gateRelevant && projectedCount > 0);
    setAttempts(prev => [
      ...prev,
      {
        id: `keyattempt-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`,
        bpm: parsedBpm,
        wasClean,
      },
    ]);
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

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`${isRetest ? 'Whole-song retest' : 'Whole-song test'} · ${songKey.keyName} · ${song.title}`}
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
              Save attempts
            </button>
            {(songKey.keyState !== 'solid' || isRetest) && (
              <button
                type="button"
                onClick={() => void handleSave(true)}
                disabled={!canMarkSolid || busy}
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title={canMarkSolid ? undefined : 'Reach 3 consecutive clean run-throughs to enable'}
              >
                {sectionsIncomplete
                  ? 'Pass the test'
                  : isRetest ? 'Mark solid (re-pass)' : 'Mark solid'}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <RuleReminder
          performanceTempo={performanceTempo}
          keyAlreadySolid={songKey.keyState === 'solid'}
          isRetest={isRetest}
          sectionsIncomplete={sectionsIncomplete}
        />

        <StateHeader
          keyState={songKey.keyState}
          projectedCount={projectedCount}
          canMarkSolid={canMarkSolid}
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
          onClean={() => handleAddAttempt(true)}
          onNotClean={() => handleAddAttempt(false)}
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
        clears the lapse and restores Solid — engagement alone does not.
      </div>
    );
  }
  if (keyAlreadySolid) {
    // Solid + not lapsed + opened anyway (e.g., via a future "review"
    // affordance). Re-attempts log to audit but don't change state.
    return (
      <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
        This key is already at <span className="font-medium">Solid</span>.
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
        Passing <span className="font-medium">moves the song to Comfortable</span>.
        It will not make this key Solid — that needs every section here
        comfortable too, which is what working them one at a time is for.
      </div>
    );
  }
  return (
    <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 border border-black/[0.07] px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
      Play through the full song in this key. Log each attempt as clean or
      not-clean. Every section here is comfortable, so passing{' '}
      <span className="font-medium">unlocks Solid</span> for this key.
    </div>
  );
}

// -------------------------------------------------------------------

const KEY_STATE_BADGE: Record<SongKeyState, { label: string; className: string }> = {
  solid:        { label: 'Solid',        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  comfortable:  { label: 'Comfortable',  className: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200' },
  learning:     { label: 'Learning',     className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  not_started:  { label: 'Not started',  className: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' },
};

function StateHeader({
  keyState,
  projectedCount,
  canMarkSolid,
  isRetest,
  performanceTempo,
}: {
  keyState: SongKeyState;
  projectedCount: number;
  canMarkSolid: boolean;
  isRetest: boolean;
  performanceTempo: number | null;
}) {
  const badge = KEY_STATE_BADGE[keyState];
  const remaining = Math.max(0, 3 - projectedCount);
  const gateSuffix = performanceTempo !== null
    ? ` at or above ♩ ${performanceTempo - 10}`
    : '';

  // Hint shows when there's a gate to reach. Initial promotion (key
  // not solid) and retest (key solid + lapsed) both surface it;
  // solid+not-lapsed has no gate to display.
  const showHint = canMarkSolid || keyState !== 'solid' || isRetest;

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
  const floorText = performanceTempo !== null
    ? ` at or above ♩ ${performanceTempo - 10}`
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
        <span
          className="inline-flex items-center gap-2"
          role="img"
          aria-label={`${count} of 3 consecutive clean run-throughs`}
        >
          {[0, 1, 2].map(i => (
            <span
              key={i}
              aria-hidden
              className={[
                'w-5 h-5 rounded-full border-2 transition-colors',
                streakBroken
                  ? 'border-needswork/50 bg-transparent'
                  : i < count
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-neutral-300 dark:border-neutral-600 bg-transparent',
              ].join(' ')}
            />
          ))}
        </span>
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
        Three clean run-throughs{floorText}, <span className="font-medium">back to back</span>,
        in this one sitting. Any not-clean run puts it back to zero, and closing
        this window starts the count over.
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
        Attempts this session
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
      {attempt.wasClean ? (
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ clean</span>
      ) : (
        <span className="text-needswork font-medium">✗ not clean</span>
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
  onClean,
  onNotClean,
}: {
  bpmInput: string;
  onBpmChange: (next: string) => void;
  bpmValid: boolean;
  onClean: () => void;
  onNotClean: () => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
        Add attempt
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
        <button
          type="button"
          onClick={onClean}
          disabled={!bpmValid}
          className="px-3 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          ✓ Clean
        </button>
        <button
          type="button"
          onClick={onNotClean}
          disabled={!bpmValid}
          className="px-3 py-2 text-sm rounded-md bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          ✗ Not clean
        </button>
      </div>
    </div>
  );
}

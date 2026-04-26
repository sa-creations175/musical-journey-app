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
  songKey: SongKey;
  song: Song;
  /** All cells for this songKey. The rollup needs them to recompute
   *  keyState when the test passes (which can flip comfortable →
   *  solid only when all cells are still comfortable). */
  siblingCells: ReadonlyArray<SongCell>;
  /** Total non-archived sections for the song. */
  totalSections: number;
}

export default function WholeSongTestModal({
  open,
  onClose,
  songKey,
  song,
  siblingCells,
  totalSections,
}: Props) {
  const [attempts, setAttempts] = useState<KeyAttemptDraft[]>([]);
  const [bpmInput, setBpmInput] = useState<string>(String(song.tempo ?? ''));
  const [busy, setBusy] = useState(false);

  const handleClose = useCallback(() => {
    setAttempts([]);
    setBpmInput('');
    setBusy(false);
    onClose();
  }, [onClose]);

  const performanceTempo = song.tempo ?? null;
  // Discrete sessions: starting count is implicitly 0 inside the
  // helper. See projectKeyConsecutiveCleanCount comment.
  const projectedCount = projectKeyConsecutiveCleanCount(
    attempts,
    performanceTempo,
  );
  const keyAlreadySolid = songKey.keyState === 'solid';
  const canMarkSolid = !keyAlreadySolid && projectedCount >= 3;
  const hasContent = attempts.length > 0;

  const parsedBpm = parseInt(bpmInput, 10);
  const bpmValid = Number.isFinite(parsedBpm) && parsedBpm > 0;

  const handleAddAttempt = (wasClean: boolean) => {
    if (!bpmValid) return;
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
        isRetest: false,
        siblingCells,
        expectedSectionCount: totalSections,
        now: Date.now(),
      });
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
      title={`Whole-song test · ${songKey.keyName} · ${song.title}`}
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
            {!keyAlreadySolid && (
              <button
                type="button"
                onClick={() => void handleSave(true)}
                disabled={!canMarkSolid || busy}
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title={canMarkSolid ? undefined : 'Reach 3 consecutive clean run-throughs to enable'}
              >
                Mark solid
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <RuleReminder
          performanceTempo={performanceTempo}
          keyAlreadySolid={keyAlreadySolid}
        />

        <StateHeader
          keyState={songKey.keyState}
          projectedCount={projectedCount}
          keyAlreadySolid={keyAlreadySolid}
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
}: {
  performanceTempo: number | null;
  keyAlreadySolid: boolean;
}) {
  if (keyAlreadySolid) {
    return (
      <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
        This key is already at <span className="font-medium">Solid</span>.
        Re-attempts log to the audit trail but don't change the key's state.
      </div>
    );
  }
  const floorText = performanceTempo !== null
    ? ` at or above ♩ ${performanceTempo - 10}`
    : '';
  return (
    <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
      Play through the full song in this key. Log each attempt as clean or
      not-clean. <span className="font-medium">3 consecutive clean run-throughs{floorText} in this session</span> unlocks Solid.
      Each test session is a fresh demonstration — the streak doesn't carry
      across opens.
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
  keyAlreadySolid,
  performanceTempo,
}: {
  keyState: SongKeyState;
  projectedCount: number;
  keyAlreadySolid: boolean;
  performanceTempo: number | null;
}) {
  const badge = KEY_STATE_BADGE[keyState];
  const remaining = Math.max(0, 3 - projectedCount);
  const gateSuffix = performanceTempo !== null
    ? ` at or above ♩ ${performanceTempo - 10}`
    : '';

  let hint: { text: string; tone: 'neutral' | 'ready' } | null = null;
  if (!keyAlreadySolid) {
    if (remaining === 0) {
      hint = { text: 'Ready to mark solid', tone: 'ready' };
    } else if (remaining === 1) {
      hint = { text: `1 more clean run needed${gateSuffix}`, tone: 'neutral' };
    } else {
      hint = { text: `${remaining} more clean runs needed${gateSuffix}`, tone: 'neutral' };
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium ${badge.className}`}>
        {badge.label}
      </span>
      <ConsecutiveDots count={projectedCount} />
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

function ConsecutiveDots({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${count} of 3 consecutive clean run-throughs`}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          aria-hidden
          className={[
            'w-2 h-2 rounded-full transition-colors',
            i < count
              ? 'bg-blue-500'
              : 'bg-neutral-300 dark:bg-neutral-700',
          ].join(' ')}
        />
      ))}
    </span>
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
        <ul className="flex flex-col gap-1 rounded-md border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
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

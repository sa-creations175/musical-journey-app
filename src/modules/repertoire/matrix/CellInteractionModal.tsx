import { useCallback, useState } from 'react';
import Modal from '../../../components/Modal';
import {
  db,
  type Song,
  type SongCell,
  type SongCellState,
  type SongKey,
  type SongMatrixSection,
  type SongRunThroughRating,
} from '../../../lib/db';
import {
  type AttemptDraft,
  isInTempoRange,
  projectConsecutiveCleanCount,
  saveAttemptsAndRollup,
} from './cellRollup';

/**
 * Cell interaction modal — opens on cell tap. Functions as a
 * practice block logger per SONG_PROGRESSION_DESIGN_3.md "Cell
 * interaction modal," shipped end-of-block-only in step 4 (the
 * per-attempt mode toggle is deferred polish).
 *
 * Local state lives entirely inside this component:
 *   - attempts: AttemptDraft[]   drafts logged in this session
 *   - bpmInput: string           controlled BPM input value
 *   - notesInput: string         controlled notes textarea value
 *   - busy: boolean              guards double-save
 *
 * Reset on close (Cancel / X / Esc / post-save). Parent uses
 * `key={cell.id}` on the modal so switching cells unmounts +
 * remounts cleanly even if the parent forgets to null
 * activeCellId between switches — defensive belt-and-braces.
 *
 * handleClose memoized via useCallback for the same focus-stealing
 * reason as SectionSetupModal: Modal.tsx's focus-handling effect
 * lists onClose in its deps.
 *
 * P3 polish (deferred):
 *   - "Clear all" button on AttemptLog to wipe the in-session
 *     attempt drafts in one click, instead of removing one ×-button
 *     at a time. Useful when a logging mistake polluted the list.
 *   - "Reset progress" affordance to zero out cell.consecutiveCleanCount
 *     (and possibly demote cellState back to 'learning'). For when
 *     the user wants a fresh gate run after a long break or a
 *     tempo bump that invalidates prior clean streaks.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after the save commits, before handleClose. Used by the
   *  parent to bump its refreshKey so useLiveQuery re-fires — same
   *  workaround as VacationManager. Without this, the parent's
   *  songCells/songKeys arrays can stay stale even though the rows
   *  were persisted. */
  onSaved?: () => void;
  cell: SongCell;
  songKey: SongKey;
  section: SongMatrixSection;
  song: Song;
  /** All cells for this songKey (including the active one). Passed
   *  in by SongMatrixView so the rollup can compute keyState
   *  without re-querying. */
  siblingCells: ReadonlyArray<SongCell>;
  /** Total non-archived sections for the song. */
  totalSections: number;
}

export default function CellInteractionModal({
  open,
  onClose,
  onSaved,
  cell,
  songKey,
  section,
  song,
  siblingCells,
  totalSections,
}: Props) {
  const [attempts, setAttempts] = useState<AttemptDraft[]>([]);
  // BPM defaults to song.tempo when set, else empty (forces user to
  // declare what they're working at — honest, no fake default).
  const [bpmInput, setBpmInput] = useState<string>(String(song.tempo ?? ''));
  // Notes init from cell.notes — the cell carries notes across
  // sessions, consistent with the rest of the data model.
  const [notesInput, setNotesInput] = useState<string>(cell.notes ?? '');
  // Session feel — Flying / Cruising / Crawling. Optional: null until
  // the user picks one, in which case the run-through rows from this
  // save carry no rating (pre-v22 / unrated semantics). Always starts
  // null — a feel rating describes one session, it doesn't carry over.
  const [rating, setRating] = useState<SongRunThroughRating | null>(null);
  const [busy, setBusy] = useState(false);

  const handleClose = useCallback(() => {
    setAttempts([]);
    setBpmInput('');
    setNotesInput('');
    setRating(null);
    setBusy(false);
    onClose();
  }, [onClose]);

  // Derived state — recomputed every render so the hint and button
  // states track the current attempt list in real time.
  const performanceTempo = song.tempo ?? null;
  const projectedCount = projectConsecutiveCleanCount(
    cell.consecutiveCleanCount,
    attempts,
    performanceTempo,
  );
  const cellAlreadyComfortable = cell.cellState === 'comfortable';
  const canMarkComfortable = !cellAlreadyComfortable && projectedCount >= 3;

  const trimmedNotes = notesInput.trim();
  const notesChanged = (cell.notes ?? '') !== trimmedNotes;
  // Save-block enabled when there's something to save: at least
  // one attempt, OR notes changed from the cell's stored value.
  const hasContent = attempts.length > 0 || notesChanged;

  const parsedBpm = parseInt(bpmInput, 10);
  const bpmValid = Number.isFinite(parsedBpm) && parsedBpm > 0;

  const handleAddAttempt = (wasClean: boolean) => {
    if (!bpmValid) return;
    setAttempts(prev => [
      ...prev,
      {
        id: `attempt-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`,
        bpm: parsedBpm,
        wasClean,
      },
    ]);
    // BPM input intentionally stays put between attempts — the user
    // manages it manually. Auto-incrementing toward target tempo
    // assumes a climbing-against-the-clock practice mode that
    // doesn't fit every workflow (warm-up cycles, alternating
    // tempos, drilling at slower than target). Honest default is
    // "leave it where they put it."
  };

  const handleDeleteAttempt = (id: string) => {
    setAttempts(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = async (markComfortable: boolean) => {
    if (busy || !hasContent) return;
    setBusy(true);
    try {
      await saveAttemptsAndRollup({
        cell,
        songKey,
        siblingCells,
        attempts,
        notes: trimmedNotes === '' ? null : trimmedNotes,
        rating,
        markComfortable,
        performanceTempo,
        expectedSectionCount: totalSections,
        now: Date.now(),
      });
      onSaved?.();
      handleClose();
    } catch (err) {
      console.warn('[matrix] cell save failed', err);
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={makeTitle(section, songKey, song)}
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
              Save block
            </button>
            {!cellAlreadyComfortable && (
              <button
                type="button"
                onClick={() => void handleSave(true)}
                disabled={!canMarkComfortable || busy}
                className="px-3 py-1.5 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title={canMarkComfortable ? undefined : 'Reach 3 consecutive clean runs to enable'}
              >
                Mark comfortable
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TempoEditRow song={song} />

        <StateHeader
          cellState={cell.cellState}
          projectedCount={projectedCount}
          cellAlreadyComfortable={cellAlreadyComfortable}
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

        <SessionFeelPicker value={rating} onChange={setRating} />

        <NotesField
          value={notesInput}
          onChange={setNotesInput}
        />
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------

function makeTitle(
  section: SongMatrixSection,
  songKey: SongKey,
  song: Song,
): string {
  // Tempo lives in its own editable row in the modal body now —
  // keep it out of the title to avoid duplicating the value when
  // the user changes it via the inline edit affordance.
  return `${section.name} · ${songKey.keyName} · ${song.title}`;
}

// -------------------------------------------------------------------

const CELL_STATE_BADGE: Record<SongCellState, { label: string; className: string }> = {
  comfortable: { label: 'Comfortable', className: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200' },
  learning:    { label: 'Learning',    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  empty:       { label: 'Not started', className: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' },
};

function StateHeader({
  cellState,
  projectedCount,
  cellAlreadyComfortable,
  performanceTempo,
}: {
  cellState: SongCellState;
  projectedCount: number;
  cellAlreadyComfortable: boolean;
  performanceTempo: number | null;
}) {
  const badge = CELL_STATE_BADGE[cellState];
  const remaining = Math.max(0, 3 - projectedCount);
  // Only mention the tempo floor when there's a performance tempo
  // to gate against. When tempo is unset the gate is off entirely
  // (every clean attempt counts), so the suffix would be misleading.
  // One-sided floor: at or above (performance tempo - 10). Above
  // tempo always counts — no upper cap.
  const gateSuffix = performanceTempo !== null
    ? ` at or above ♩ ${performanceTempo - 10}`
    : '';

  let hint: { text: string; tone: 'neutral' | 'ready' } | null = null;
  if (!cellAlreadyComfortable) {
    if (remaining === 0) {
      hint = { text: 'Ready to mark comfortable', tone: 'ready' };
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
            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
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
    <span className="inline-flex items-center gap-1" aria-label={`${count} of 3 consecutive clean runs`}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          aria-hidden
          className={[
            'w-2 h-2 rounded-full transition-colors',
            i < count
              ? 'bg-teal-500'
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
  attempts: AttemptDraft[];
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
          No attempts logged yet. Add one below to track your run-through.
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
  attempt: AttemptDraft;
  index: number;
  performanceTempo: number | null;
  onDelete: (id: string) => void;
}) {
  // Only surface the tempo tag when there's a performance tempo to
  // gate against AND this attempt is below the floor (performance
  // tempo - 10). The tag is informational, not corrective — the
  // run-through still persists with its actual wasClean value, it
  // just doesn't count toward the 3-consecutive gate. Playing above
  // tempo is never penalized, so there's no "above tempo" tag.
  const belowFloor = performanceTempo !== null
    && !isInTempoRange(attempt.bpm, performanceTempo);
  const tempoTag = belowFloor ? 'below tempo' : null;

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
      {tempoTag && (
        <span
          className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          title="Out of ±10 BPM range — doesn't count toward the comfortable gate"
        >
          {tempoTag}
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

// -------------------------------------------------------------------

const FEEL_OPTIONS: ReadonlyArray<{
  value: SongRunThroughRating;
  label: string;
  hint: string;
  activeClass: string;
  inactiveClass: string;
}> = [
  {
    value: 'flying',
    label: 'Flying',
    hint: 'effortless',
    activeClass: 'bg-amber-500 text-white border-amber-500',
    inactiveClass: 'border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10',
  },
  {
    value: 'cruising',
    label: 'Cruising',
    hint: 'steady, clean',
    activeClass: 'bg-fluent text-white border-fluent',
    inactiveClass: 'border-fluent/40 text-fluent hover:bg-fluent/10',
  },
  {
    value: 'crawling',
    label: 'Crawling',
    hint: 'breakdowns',
    activeClass: 'bg-needswork text-white border-needswork',
    inactiveClass: 'border-needswork/40 text-needswork hover:bg-needswork/10',
  },
];

/**
 * Session feel picker — Flying / Cruising / Crawling. Optional: the
 * user can save a block without rating it (the run-through rows then
 * carry no rating, exactly like pre-v22 data). When picked, the
 * rating is stamped on every run-through row from the save — Phase B
 * reads it to tell an exploration session from a drill session on
 * this section. Clicking the active option again clears it.
 */
function SessionFeelPicker({
  value,
  onChange,
}: {
  value: SongRunThroughRating | null;
  onChange: (next: SongRunThroughRating | null) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
        How did this section feel?{' '}
        <span className="text-neutral-400 font-normal">(optional)</span>
      </div>
      <div className="flex items-stretch gap-2">
        {FEEL_OPTIONS.map(opt => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(active ? null : opt.value)}
              aria-pressed={active}
              className={`flex-1 px-3 py-2 rounded-md border text-sm transition-colors ${
                active ? opt.activeClass : opt.inactiveClass
              }`}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="ml-1.5 opacity-70 text-[11px]">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

function NotesField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        Notes
      </span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="What did you notice today?"
        rows={2}
        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40"
      />
    </label>
  );
}

// -------------------------------------------------------------------

/**
 * Inline editor for the song's performance tempo. Two modes —
 * read-only display (tempo + "edit" link) and edit (input + amber
 * confirm panel with the explanatory text + Cancel/Confirm).
 *
 * "Confirm prompt" semantics: the explanation about affecting the
 * gate threshold for all sections is shown alongside the input, so
 * the user reads it before committing. The two-click flow (click
 * edit → click confirm) is the safety gate.
 *
 * Persists via read-then-put rather than db.songs.update — the
 * lesson from VacationManager's end-vacation bug: .update can
 * silently no-op, .put with the full record is unambiguous upsert
 * by primary key.
 */
function TempoEditRow({ song }: { song: Song }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setDraft(String(song.tempo ?? ''));
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft('');
  };

  const parsed = parseInt(draft, 10);
  const valid = Number.isFinite(parsed) && parsed > 0;

  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const fresh = await db.songs.get(song.id);
      if (!fresh) {
        console.warn('[matrix] tempo update — song not found', song.id);
        return;
      }
      await db.songs.put({ ...fresh, tempo: Math.floor(parsed) });
      setEditing(false);
      setDraft('');
    } catch (err) {
      console.warn('[matrix] tempo update failed', err);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500 dark:text-neutral-400">Performance tempo:</span>
        <span className="font-medium tabular-nums text-neutral-800 dark:text-neutral-100">
          {song.tempo ? `♩ ${song.tempo}` : 'not set'}
        </span>
        <button
          type="button"
          onClick={startEdit}
          className="text-xs text-fluent hover:underline"
        >
          {song.tempo ? 'edit' : 'set tempo'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 flex flex-col gap-2">
      <div className="text-xs text-amber-800 dark:text-amber-200">
        Changing performance tempo affects the gate floor (tempo − 10 BPM) for
        all sections of this song. Attempts below the floor won't count toward
        the comfortable gate; playing above tempo always counts.
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-200">
          New tempo:
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            className="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-fluent/40"
            aria-label="New performance tempo BPM"
          />
          <span className="text-xs text-neutral-500">BPM</span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!valid || busy}
            className="px-2.5 py-1 text-xs rounded-md bg-fluent text-white hover:bg-fluent/90 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

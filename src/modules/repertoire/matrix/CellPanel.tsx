import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song, SongCell, SongKey, SongMatrixSection } from '../../../lib/db';
import { spellKey, type Spelling } from '../../../lib/spelling';
import { useSongTimer } from '../useSongTimer';
import { AMBER_DEFAULT_MIN, getAmberMinutes } from '../songTimerPrefs';
import MetronomeControl from '../../../components/MetronomeControl';
import SectionTicks from './SectionTicks';
import RatingStep, { type RatingAnswers } from './RatingStep';
import TestStep from './TestStep';
import {
  saveAttemptsAndRollup, type AttemptDraft,
} from './cellRollup';

/**
 * What opens when you tap a cell.
 *
 * ---------------------------------------------------------------
 * THE MATRIX IS THE ONE ENTRANCE. A CELL IS NOT.
 *
 * This paragraph used to say "every practice and every test starts
 * from a cell". That was written before we knew "test" was three
 * things at TWO GRAINS, and it was never true of the app:
 *
 *   cell — a section in one key. Three clean runs at tempo make that
 *          cell comfortable. THIS PANEL.
 *   row  — the whole song in one key. "Test song" is three clean runs
 *          in one sitting and makes the key solid; "run at tempo" is
 *          one clean pass and is breadth evidence for Internalized.
 *          Both live on `KeyRow`, and stay there.
 *
 * THE GRAINS CANNOT BE COLLAPSED, and this is a data argument rather
 * than a layout preference. Offering the whole-song test from a Chorus
 * cell invites recording a whole-song run as though the Chorus were
 * the thing that was run — and once written, nothing downstream can
 * tell the two apart. `songCellRunThroughs` and `songKeyRunThroughs`
 * are separate tables for exactly this reason, and the stage rules
 * read them for different claims: depth from the key rows, breadth
 * from the run rows. A cell cannot honestly speak for a song.
 *
 * So the entrance is the MATRIX: cells for section work, rows for
 * claims about the whole song in a key. Please do not move the two row
 * actions in here to make a tidier sentence true.
 * ---------------------------------------------------------------
 *
 * PRACTICE AND TEST ARE DIFFERENT EVENTS, not two levels of detail on
 * one. Practice is working on the song and has no pass or fail; test
 * is a run-through that is clean or is not. Asking which BEFORE the
 * work starts is what lets the timer run immediately — a mode chosen
 * afterwards would mean either timing everything or timing nothing.
 *
 * BOTH ARE TIMED, and only practice is rated. A test is time at the
 * keyboard like any other, so the clock runs; but "what kind of work
 * was it" has one answer when the answer is a test, and the attempts
 * already say how it went. So Done opens the rating step and a test
 * save does not.
 * ---------------------------------------------------------------
 *
 * THE TIMER STARTS ON ENTERING PRACTICE, with no second tap. The
 * failure this whole workstream exists to fix is that logging
 * required decisions at the moment you least want to make them; a
 * "start" button between you and the keyboard is one more of those.
 */

/**
 * `rate` is what Done opens. It is a MODE rather than a second modal
 * because it is the same sitting still being recorded — the header
 * does not change, the section ticks carry across, and nothing has
 * been written yet.
 */
export type CellPanelMode = 'choose' | 'practice' | 'rate' | 'test';

/** Full panel, or collapsed to a bar so the lead sheet can be read
 *  beneath it. The timer never leaves the screen in either. */
export type CellPanelLayout = 'full' | 'bar';

interface Props {
  song: Song;
  /** The tapped cell. Test mode reads its state and its clean streak;
   *  practice mode does not look at it. */
  cell: SongCell;
  /** Every cell in this key, including the tapped one. The rollup
   *  needs them to recompute the key's state without re-querying —
   *  a cell going comfortable can be what makes the whole key
   *  comfortable. */
  siblingCells: ReadonlyArray<SongCell>;
  songKey: SongKey;
  section: SongMatrixSection;
  /** Every non-archived section, for the tick list. */
  sections: ReadonlyArray<SongMatrixSection>;
  spelling: Spelling;
  layout: CellPanelLayout;
  onLayoutChange: (next: CellPanelLayout) => void;
  onClose: () => void;
  /** Called after a practice run is written, so the parent can refresh. */
  onSaved?: () => void;
  /** Report what was recorded, so the page can confirm it. Done that
   *  produces no visible result is indistinguishable from Done that is
   *  broken. */
  onFinished: (minutes: number, sectionCount: number) => void;
}

export default function CellPanel({
  song, cell, siblingCells, songKey, section, sections, spelling,
  layout, onLayoutChange, onClose, onSaved, onFinished,
}: Props) {
  const [mode, setMode] = useState<CellPanelMode>('choose');
  const timer = useSongTimer(song.id);
  const [busy, setBusy] = useState(false);
  /** Whether THIS panel started the clock, so Cancel knows what is
   *  its to discard. */
  const startedHere = useRef(false);
  // The tapped cell's section is pre-ticked because tapping it IS
  // saying you are working on it. Everything else is a claim the user
  // has to make.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set([section.id]));
  const otherSongRunning = timer.record !== null && !timer.isThisSong;
  /**
   * The user's amber threshold, in ms, or null for "never".
   *
   * Read once and held, so Done does not have to await a preference
   * before it can stop a clock.
   *
   * IT STARTS AT THE APP DEFAULT, NOT AT NULL. Null means "never ask",
   * and a few hundred milliseconds of "never" is the wrong direction
   * to be wrong in: it would let an un-attributed stretch be logged as
   * focused practice with no question raised. Starting at the default
   * can at worst show a question to someone who turned it off, in a
   * window that closes as soon as the preference loads.
   *
   * That is the same asymmetry `SongTimerActivityWatcher` decides its
   * event list by — a missed signal costs an amber number the user
   * glances past, a false one costs a silently wrong record — applied
   * to the load rather than to the events.
   */
  const [amberMs, setAmberMs] = useState<number | null>(
    () => AMBER_DEFAULT_MIN * 60_000,
  );
  useEffect(() => {
    let live = true;
    getAmberMinutes()
      .then(min => { if (live) setAmberMs(min === null ? null : min * 60_000); })
      // Swallowed, and the default above stands. This read can fail
      // for reasons that have nothing to do with the panel — Dexie
      // closed under it, Safari private mode, the page going away
      // mid-flight — and none of them are worth an unhandled rejection
      // or a broken panel. Failing to the default is the same choice
      // the initializer makes and for the same reason: a threshold
      // that asks is safer than one that silently counts.
      .catch(err => { console.warn('[repertoire] amber threshold read failed', err); });
    return () => { live = false; };
  }, []);

  // Entering practice starts the clock — unless one is already running
  // on this song, which is adopted rather than restarted. Restarting
  // would throw away time the user has already spent.
  useEffect(() => {
    // A test is time at the keyboard like any other, so the clock runs
    // for both. What differs is the END: practice is rated, a test is
    // scored by its attempts.
    if (mode !== 'practice' && mode !== 'test') return;
    if (timer.isThisSong) return;
    if (otherSongRunning) return;   // the swap is offered, not forced
    startedHere.current = true;
    timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /**
   * Done: stop the clock, ask what the work was. Writes NOTHING yet.
   *
   * ---------------------------------------------------------------
   * DONE PAUSES, LOG IT WRITES.
   *
   * Neither obvious alternative survives: leaving the clock running
   * while the questions are answered charges the user for the time
   * they spent answering, and writing here and updating the row after
   * means two writes for one sitting and a row that briefly exists in
   * a state nothing intended.
   *
   * The paused record stays in localStorage, so closing the tab
   * mid-rating loses the ANSWERS and not the minutes — the timer is
   * still there, paused, on return. `Back to the timer` resumes it.
   *
   * A consequence worth knowing: `logPracticeSession` is what clears
   * `stageEarned`, so the "earned just now" notice now retires at Log
   * it rather than at Done. That is the better reading — stopping the
   * clock and backing out is not finishing a sitting.
   *
   * The open silence is banked FIRST. A stretch the app saw nothing
   * during that is still open at this moment has not been banked by
   * `withActivity`, because no activity has resumed to bank it — and
   * stopping without this would log it as focused practice, which is
   * the silent-counting failure the whole mechanism exists to prevent,
   * one step later.
   * ---------------------------------------------------------------
   */
  const done = () => {
    if (busy) return;
    timer.bankOpenSilence(amberMs);
    timer.pause();
    setMode('rate');
    onLayoutChange('full');   // the bar cannot show the questions
  };

  /**
   * Log it: write the sitting, say what was written, close.
   *
   * Everything the rating step collected rides along, and every field
   * of it is optional — a sitting with nothing ticked is a complete
   * record, on the same argument that makes `sectionIds` optional.
   */
  const save = async (answers: RatingAnswers) => {
    if (busy) return;
    setBusy(true);
    try {
      const { minutes } = await timer.stopAndLog({
        sectionIds: [...ticked],
        keys: [songKey.keyName],
        activities: answers.activities,
        activityOther: answers.activityOther,
        notes: answers.notes,
        ...(answers.feelRating !== null ? { feelRating: answers.feelRating } : {}),
      });
      onSaved?.();
      onFinished(minutes, ticked.size);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Finish a test: stop the clock, write the attempts, roll the cell
   * and the key up, close.
   *
   * ---------------------------------------------------------------
   * NO RATING STEP AFTER A TEST, DELIBERATELY.
   *
   * "What kind of work was it" has one answer when the answer is a
   * test, and a vocabulary entry that is always true of a surface
   * records nothing. How it went is already recorded, more precisely
   * than a four-step scale could: every attempt carries its tempo and
   * whether it was clean.
   *
   * The minutes are still logged as practice — a test is time at the
   * keyboard — and the row carries no rating, which is what keeps it
   * from emitting a spacing signal. THE CELL TEST MUST NOT MOVE THE
   * RETEST CLOCK: that belongs to the whole-song test alone, at the
   * key grain, and this writes at the cell grain.
   *
   * ORDER MATTERS. The practice row is written first so its id can
   * stamp the run-throughs — `songCellRunThroughs.practiceLogId` is
   * what says these attempts happened inside a timed sitting, and a
   * null there means "logged on their own", which would be false.
   * That is why `stopAndLog` hands the id back.
   * ---------------------------------------------------------------
   */
  const finishTest = async (attempts: AttemptDraft[], markComfortable: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const { minutes, practiceLogId } = await timer.stopAndLog({
        sectionIds: [section.id],
        keys: [songKey.keyName],
      });
      if (attempts.length > 0 || markComfortable) {
        await saveAttemptsAndRollup({
          cell,
          songKey,
          siblingCells,
          attempts,
          // Notes and the feel rating belong to the practice surfaces.
          // A test records what happened, not how it felt.
          notes: null,
          rating: null,
          markComfortable,
          performanceTempo: song.tempo ?? null,
          expectedSectionCount: sections.length,
          now: Date.now(),
          practiceLogId,
        });
      }
      onSaved?.();
      onFinished(minutes, 1);
      onClose();
    } catch (err) {
      console.warn('[matrix] cell test save failed', err);
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  /** Back: put the clock back on and return to the timer. Nothing has
   *  been written, so there is nothing to undo. */
  const backToTimer = () => {
    timer.resume();
    setMode('practice');
  };

  /**
   * Cancel: discard.
   *
   * ---------------------------------------------------------------
   * CANCEL MEANS "I DIDN'T MEAN TO START THIS".
   *
   * It used to close the panel and leave the clock running, which is
   * the worst of both readings: nothing on screen said time was still
   * being counted, and reopening practice showed a total the user had
   * not agreed to. A control labelled Cancel that quietly keeps going
   * is a control that lies.
   *
   * So it stops the timer and writes NOTHING. The alternative — "close
   * this panel, keep timing" — is a legitimate thing to want, but it
   * cannot be called Cancel, and it would need its own wording.
   *
   * Only discards a timer THIS panel started. One already running when
   * the panel opened was adopted, not begun, and cancelling out of a
   * panel is not a reason to throw away time the user started
   * elsewhere.
   * ---------------------------------------------------------------
   */
  const cancel = () => {
    if (startedHere.current && timer.isThisSong) timer.discard();
    onClose();
  };

  const toggleSection = useCallback((id: string) => setTicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);
  const selectAllSections = useCallback(
    () => setTicked(new Set(sections.map(s => s.id))),
    [sections],
  );

  const elapsed = formatElapsed(timer.elapsedMs);
  const keyLabel = spellKey(songKey.keyName, spelling);

  // ---- collapsed bar -------------------------------------------------
  if (mode === 'practice' && layout === 'bar') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-neutral-950 border-b border-black/[0.12] shadow-md">
        <button
          type="button"
          onClick={() => onLayoutChange('full')}
          className="w-full px-3 py-2 flex items-center gap-3 text-left"
          aria-label="Back to the practice panel"
        >
          <span className="font-mono tabular-nums text-lg text-neutral-900 dark:text-neutral-50">
            {elapsed}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-neutral-500 truncate">
            {section.name} · key of {keyLabel}
          </span>
          <span aria-hidden className="ml-auto text-neutral-400 text-xs">▾ panel</span>
        </button>
        <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
          <MetronomeControl />
          <button
            type="button"
            disabled={busy}
            onClick={done}
            className="ml-auto px-3 py-1 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ---- full panel ----------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white dark:bg-neutral-950 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <header className="px-4 pt-4 pb-2">
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            {section.name}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">
            key of {keyLabel} · {song.title}
          </div>
        </header>

        {mode === 'test' ? (
          <TestStep
            elapsed={elapsed}
            cell={cell}
            performanceTempo={song.tempo ?? null}
            busy={busy}
            onOpenLeadSheet={() => onLayoutChange('bar')}
            onCancel={cancel}
            onFinish={(attempts, markComfortable) =>
              void finishTest(attempts, markComfortable)}
          />
        ) : mode === 'rate' ? (
          <RatingStep
            elapsed={elapsed}
            sections={sections}
            ticked={ticked}
            onToggleSection={toggleSection}
            onSelectAllSections={selectAllSections}
            pendingGapMs={timer.pendingGapMs}
            onResolveGap={timer.resolvePendingGap}
            busy={busy}
            onBack={backToTimer}
            onSave={answers => void save(answers)}
          />
        ) : mode === 'choose' ? (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
              What are you about to do?
            </p>
            <button
              type="button"
              onClick={() => setMode('practice')}
              className="w-full text-left px-3 py-3 rounded-lg border border-fluent bg-fluent/5 hover:bg-fluent/10"
            >
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                Practice
              </div>
              <div className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
                Working on it — lead sheet, getting it under the fingers, drilling
                a section. Timed, not graded. Starts now.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode('test')}
              className="w-full text-left px-3 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-fluent"
            >
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                Test
              </div>
              <div className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
                Run this section at tempo, clean or not. Three clean in a
                row makes it comfortable. Timed, and starts now.
              </div>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-3 py-2 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-4">
            {otherSongRunning && (
              <SwapPrompt
                busy={busy}
                onSwap={() => {
                  setBusy(true);
                  void timer.swapToThisSong().finally(() => setBusy(false));
                }}
              />
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono tabular-nums text-3xl text-neutral-900 dark:text-neutral-50">
                {elapsed}
              </span>
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                on this song
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* THE SAME CONTROL THE HEADER USES, not a reduced
                  version of it. Groove, time signature, volume and tap
                  tempo all matter here — a ballad practised against a
                  straight click is the wrong click — and a second,
                  smaller metronome would be a second thing to keep in
                  step with the first. It drives the same singleton, so
                  the tempo you set here is the app's tempo. */}
              <MetronomeControl />
            </div>

            <SectionTicks
              label="Select the sections you’re working on in this practice session"
              sections={sections}
              ticked={ticked}
              onToggle={toggleSection}
              onSelectAll={selectAllSections}
            />

            {/* FULL WIDTH AND PRIMARY WEIGHT, never behind a menu.
                Early on this is the most-used control after pause —
                the lead sheet is what you are reading while you play,
                and a link in a corner makes the app the thing you are
                fighting rather than the thing you are using. */}
            <button
              type="button"
              onClick={() => onLayoutChange('bar')}
              className="w-full px-3 py-3 rounded-lg bg-info text-white text-sm font-medium hover:opacity-90"
            >
              Open lead sheet
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                title="Stops the timer and records nothing."
                className="px-3 py-2 text-xs text-neutral-500 hover:text-needswork"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={done}
                className="ml-auto px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

function SwapPrompt({ busy, onSwap }: { busy: boolean; onSwap: () => void }) {
  return (
    <div className="rounded-md border border-[#E88943]/40 bg-[#E88943]/5 px-3 py-2 space-y-1.5">
      <p className="text-[11px] text-neutral-700 dark:text-neutral-200 leading-snug">
        A timer is already running on another song. Nothing is being counted for
        this one yet.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onSwap}
        className="px-2 py-1 rounded bg-fluent text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40"
      >
        log that one and start this
      </button>
    </div>
  );
}

/* SectionTicks used to be defined here. It moved to its own file in
 * step 3d-6, because the rating step asks about the same set at a
 * later moment and the ticks carry across — one component, two
 * questions, so confirming at the end is a glance and not a re-entry. */

/** `h:mm:ss` past an hour, `mm:ss` below it — seconds visible, because
 *  this one is being watched while it runs. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

import { useEffect, useRef, useState } from 'react';
import type { Song, SongKey, SongMatrixSection } from '../../../lib/db';
import { spellKey, type Spelling } from '../../../lib/spelling';
import { useSongTimer } from '../useSongTimer';
import MetronomeControl from '../../../components/MetronomeControl';

/**
 * What opens when you tap a cell.
 *
 * ---------------------------------------------------------------
 * EVERY PRACTICE AND EVERY TEST STARTS FROM A CELL.
 *
 * The matrix is the song's dashboard, and a cell is a section in a
 * key — the smallest thing the app can say anything true about. So
 * this is the one entrance: tap a cell, say which of the two things
 * you are about to do, and do it.
 *
 * PRACTICE AND TEST ARE DIFFERENT EVENTS, not two levels of detail on
 * one. Practice is working on the song and has no pass or fail; test
 * is a run-through that is clean or is not. Asking which BEFORE the
 * work starts is what lets the timer run immediately — a mode chosen
 * afterwards would mean either timing everything or timing nothing.
 * ---------------------------------------------------------------
 *
 * THE TIMER STARTS ON ENTERING PRACTICE, with no second tap. The
 * failure this whole workstream exists to fix is that logging
 * required decisions at the moment you least want to make them; a
 * "start" button between you and the keyboard is one more of those.
 */

export type CellPanelMode = 'choose' | 'practice';

/** Full panel, or collapsed to a bar so the lead sheet can be read
 *  beneath it. The timer never leaves the screen in either. */
export type CellPanelLayout = 'full' | 'bar';

interface Props {
  song: Song;
  // `cell` is deliberately NOT a prop yet. Practice mode needs the
  // section and the key, both of which are passed; the cell's own
  // state is what TEST mode reads, and it arrives with that in 3d-7.
  // An unused prop threaded early is the same dead weight as an unused
  // field, and this workstream has spent enough time removing those.
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
  song, songKey, section, sections, spelling,
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

  // Entering practice starts the clock — unless one is already running
  // on this song, which is adopted rather than restarted. Restarting
  // would throw away time the user has already spent.
  useEffect(() => {
    if (mode !== 'practice') return;
    if (timer.isThisSong) return;
    if (otherSongRunning) return;   // the swap is offered, not forced
    startedHere.current = true;
    timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /**
   * Done: stop, write the run, say what was written, close.
   *
   * The rating step arrives in 3d-6. Until it does, Done still has to
   * DO something observable — a button that silently succeeds is
   * indistinguishable from one that is broken, and the user has no way
   * to tell which they are looking at.
   */
  const done = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const minutes = await timer.stopAndLog({
        sectionIds: [...ticked],
        keys: [songKey.keyName],
      });
      onSaved?.();
      onFinished(minutes, ticked.size);
      onClose();
    } finally {
      setBusy(false);
    }
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
            onClick={() => void done()}
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

        {mode === 'choose' ? (
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
              disabled
              className="w-full text-left px-3 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 opacity-50 cursor-not-allowed"
            >
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                Test
              </div>
              <div className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
                A run-through at tempo, clean or not. Lands in the next step.
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
              sections={sections}
              ticked={ticked}
              onToggle={id => setTicked(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })}
              onSelectAll={() => setTicked(new Set(sections.map(s => s.id)))}
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
                onClick={() => void done()}
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

/**
 * Which sections this run covered.
 *
 * Pre-ticked with the tapped one, because tapping a cell IS saying you
 * are working on that section. Everything else stays a claim the user
 * makes — the app records what it is told, not what it infers from
 * where a finger landed.
 */
function SectionTicks({
  sections, ticked, onToggle, onSelectAll,
}: {
  sections: ReadonlyArray<SongMatrixSection>;
  ticked: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  const all = sections.length > 0 && sections.every(s => ticked.has(s.id));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] text-neutral-600 dark:text-neutral-300">
          Select the sections you’re working on in this practice session
        </span>
        {!all && (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[11px] text-fluent hover:underline underline-offset-2"
          >
            select all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sections.map(s => {
          const on = ticked.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              aria-pressed={on}
              className={`px-2.5 py-1 rounded-md border text-xs ${
                on
                  ? 'bg-fluent text-white border-fluent'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent'
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}


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

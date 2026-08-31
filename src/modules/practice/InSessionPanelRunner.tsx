/**
 * Walking a block's items, opening the session panel on each one.
 *
 * =====================================================================
 * THE POP-UP IS GONE AND THE SEQUENCE IS NOT.
 *
 * A generated session used to open a drill pop-up per item — its own
 * countdown, its own three-way rating, its own idea of what a run is.
 * It hardcoded `fromTest: false`, because it had no test mode at all,
 * so a run played inside a generated session recorded strictly less
 * than the same run started from a grid.
 *
 * The panel is now the one way to run a drill anywhere in the app, so a
 * run started here records what a run started from a grid records —
 * the tempo, the sitting, and whether it was a test.
 *
 * =====================================================================
 * WHAT THIS SHELL OWNS, AND WHY IT IS THIS ONE AND NOT THREE.
 *
 * Scales, chord shapes and voice leading each had a runner, and the
 * three were the same file three times: resolve items, prep screen,
 * count-in, mount a modal, advance. Only the resolving differed. So the
 * walk lives here once and each caller supplies its own list.
 *
 * The SEQUENCE lives here rather than inside the panel. It used to live
 * in the pop-up's rating screen — Previous / Next / Redo sat beside the
 * feel buttons — which put "which item am I on" inside the thing that
 * only knows about one item. A panel is a sitting on one thing; moving
 * between things is this shell's business.
 *
 *   Previous  on the prep screen, where the next item is named.
 *   Next      is what closing the panel does.
 *   Redo      is not a control any more: a panel session holds as many
 *             runs as you want to play, so playing it again is Start
 *             again rather than a button that rebuilds the screen.
 * =====================================================================
 */
import { useEffect, useState } from 'react';
import PracticeTestPanel from '../shapes-and-patterns/practiceTest/PracticeTestPanel';
import type { DrillSurface } from '../shapes-and-patterns/practiceTest/surfaces';
import CountdownOverlay from './CountdownOverlay';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import { metronome } from '../../lib/metronome';

/** One stop on the walk. */
export interface RunnerStop {
  /** Stable identity — remounts the panel between stops so a sitting
   *  never carries over into the next item. */
  key: string;
  /** What the prep screen names. */
  label: string;
  /** The line under it: what the session allotted, and whatever else
   *  identifies the stop. */
  detail: string;
  surface: DrillSurface;
}

interface Props {
  /** The stops, in order. Null while a caller is still resolving them
   *  — an empty array means "resolved, and there is nothing here". */
  stops: ReadonlyArray<RunnerStop> | null;
  /** Module accent for the prep screen and the count-in. */
  accent: string;
  /** Fires when the walk finishes or there was nothing to walk — the
   *  caller moves the block to its rating phase. */
  onComplete: () => void;
}

export default function InSessionPanelRunner({ stops, accent, onComplete }: Props) {
  const { setInSessionDrillActive } = useSessionTimer();
  const [idx, setIdx] = useState(0);
  /**
   * The prep screen is up: the next item is named and waiting for
   * Ready, which starts the count-in.
   *
   * FALSE ON THE FIRST STOP. The block's own prep screen and count-in
   * have just run; a second pair immediately after would be the same
   * two screens twice.
   */
  const [betweenPrep, setBetweenPrep] = useState(false);
  const [counting, setCounting] = useState(false);

  // While this is mounted it owns drill completion; the global
  // drill-end watcher stands down so the block timer cannot yank the
  // walk to its rating phase midway. Cleared on unmount.
  useEffect(() => {
    setInSessionDrillActive(true);
    return () => setInSessionDrillActive(false);
  }, [setInSessionDrillActive]);

  const current = stops ? stops[idx] : undefined;

  // Nothing resolved, or walked past the last stop → hand back. In an
  // effect rather than in render, to avoid a setState-during-render on
  // the parent.
  useEffect(() => {
    if (stops && !current) onComplete();
  }, [stops, current, onComplete]);

  if (!stops || !current) return null;

  /** Move, and name what is coming before it starts. */
  const goTo = (compute: (i: number) => number) => {
    setIdx(compute);
    setBetweenPrep(true);
  };

  if (betweenPrep) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-neutral-950/90 backdrop-blur-sm select-none p-6 text-center">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-400">
            up next
          </div>
          <div
            className="text-2xl sm:text-3xl font-semibold"
            style={{ color: accent }}
          >
            {current.label}
          </div>
          <div className="text-sm text-neutral-400">{current.detail}</div>
        </div>
        <div className="flex items-center gap-3">
          {/* STEPPING BACK, WHERE THE SEQUENCE IS. It used to sit on
              the pop-up's rating screen; the panel has no opinion
              about which item you are on, and should not. */}
          <button
            type="button"
            onClick={() => goTo(i => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="px-5 py-3 rounded-md border border-neutral-700 text-neutral-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => {
              setBetweenPrep(false);
              setCounting(true);
            }}
            className="px-8 py-3 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            Ready
          </button>
        </div>
      </div>
    );
  }

  if (counting) {
    return (
      <CountdownOverlay
        key={`countin-${idx}`}
        timeSig={metronome.state.timeSig}
        bpm={metronome.state.bpm}
        // All count-ins use the all-kicks pattern uniformly (kick·kick·
        // kick·GO) — matches the block prep screen.
        allKick
        accent={accent}
        onComplete={() => setCounting(false)}
      />
    );
  }

  return (
    <PracticeTestPanel
      // Remount per stop, so a sitting ends with the item it was about.
      key={current.key}
      surface={current.surface}
      // CLOSING IS MOVING ON. Whichever door was used — Log Session,
      // Cancel Session, or the plain Close before a mode was picked —
      // this item is finished with, and the next one is named. Past the
      // last stop the effect above ends the walk.
      onClose={() => goTo(i => i + 1)}
    />
  );
}


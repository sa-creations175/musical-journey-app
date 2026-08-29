import { useState } from 'react';
import { metronome } from '../../../lib/metronome';
import { useMetronomeState } from '../../../lib/useMetronome';
import MetronomeControl from '../../../components/MetronomeControl';
import {
  clampTestBpm,
  noTempoText,
  testTempoWindowText,
} from '../tempoGate';

/**
 * The metronome, as a song sees it.
 *
 * =====================================================================
 * IT IS WHERE TEMPO COMES FROM. THERE IS NO OTHER SOURCE.
 *
 * The typed box this replaces was pre-filled from the song's stated
 * tempo, so a run played at 70 on a song targeted at 100 recorded 100
 * and counted toward the test. The app's claim is "three clean
 * run-throughs AT TEMPO", and it was checking that against a number it
 * had supplied itself.
 *
 * =====================================================================
 * THE TWO MODES DIFFER IN WHAT THEY ALLOW, NOT IN WHAT THEY SHOW.
 *
 *   PRACTICE   the metronome moves anywhere. Slowing right down to get
 *              a passage under the fingers is the point of practice,
 *              and nothing here should make that feel like cheating.
 *   TESTING    it clamps at ten below the song's tempo and says why.
 *              The stepper stops rather than refusing: a button that
 *              silently does nothing at the boundary reads as broken,
 *              while one that stops and explains has taught the rule.
 *
 * =====================================================================
 * A SONG WITH NO TEMPO ASKS DIFFERENTLY, AND THE DIFFERENCE IS REAL.
 *
 * Practice gets a PROMPT. It does not block — practice runs at any
 * speed, and the metronome only needs somewhere to start.
 *
 * A test gets a BLOCKER, because there is nothing for "at tempo" to
 * mean. This is not a test that could go ahead less rigorously; it is a
 * test with no yardstick.
 *
 * =====================================================================
 * NOT WRITTEN, AND SO NOT SHOWN: the standing explainer under a
 * PRACTICE metronome. The test's equivalent is approved
 * (`testTempoWindowText`); the practice one is not, and the prototype's
 * wording for it has never been signed off. A box with one mode
 * explained and the other silent is visibly incomplete, which is the
 * correct state for something unwritten — an invented sentence would
 * not be.
 * =====================================================================
 *
 * Copy: `TEMPO_SOURCE_SPEC.md` §10.
 */

interface Props {
  mode: 'testing' | 'practice';
  /** The song's stated tempo. Null means it has none set. */
  songTempo: number | null;
  /** Store a tempo for the song. Only reachable from the prompt. */
  onSetSongTempo: (bpm: number) => void | Promise<void>;
  /** Reported from the press, never watched — see `MetronomeControl`. */
  onStoppedByUser?: () => void;
}

export default function SongMetronomeBox({
  mode, songTempo, onSetSongTempo, onStoppedByUser,
}: Props) {
  const metro = useMetronomeState();
  const [draft, setDraft] = useState('');
  /** Why the last step was clamped, or empty. Cleared by any step that
   *  was not, so it never outlives the thing it explains. */
  const [clampedWhy, setClampedWhy] = useState('');

  if (songTempo === null) {
    return (
      <div className="rounded-md border-l-[3px] border-needswork bg-needswork/5 px-3 py-2.5 space-y-2">
        <p className="text-xs leading-snug text-neutral-700 dark:text-neutral-200">
          {noTempoText(mode)}
        </p>
        {/* THE PROMPT CARRIES ITS OWN FIX. A test is blocked either
            way, but sending someone to the song editor to unblock a
            test is a trip they can take from here instead. */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={30}
            max={240}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="bpm"
            aria-label="Song tempo in bpm"
            className="w-20 px-2 py-1 text-sm tabular-nums rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={() => {
              const n = parseInt(draft, 10);
              if (!Number.isFinite(n) || n < 30 || n > 240) return;
              setDraft('');
              // The metronome follows the tempo just set, so the song
              // opens at its own speed rather than at whatever the last
              // thing to touch the singleton left behind.
              metronome.update({ bpm: n });
              void onSetSongTempo(n);
            }}
            className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  const step = (delta: number) => {
    const next = metro.bpm + delta;
    if (mode === 'practice') {
      // NO FLOOR IN PRACTICE. Slowing down is the point.
      metronome.update({ bpm: Math.max(30, Math.min(240, next)) });
      setClampedWhy('');
      return;
    }
    const { bpm, why } = clampTestBpm(next, songTempo);
    metronome.update({ bpm: Math.max(30, Math.min(240, bpm)) });
    setClampedWhy(why ?? '');
  };

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <MetronomeControl onStoppedByUser={onStoppedByUser} />
        <div className="inline-flex items-center rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="decrease tempo by 1"
            className="px-2 py-1 text-xs text-neutral-500 hover:text-fluent"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="increase tempo by 1"
            className="px-2 py-1 text-xs text-neutral-500 hover:text-fluent border-l border-neutral-200 dark:border-neutral-700"
          >
            +
          </button>
        </div>
        {/* THE WORD TRAVELS WITH THE STATE, here as in the strip. */}
        <span
          className={[
            'text-[10px] uppercase tracking-wider font-semibold',
            metro.playing ? 'text-fluent' : 'text-neutral-400',
          ].join(' ')}
        >
          {metro.playing ? 'Metronome Active' : 'Metronome Silent'}
        </span>
      </div>

      {/* THE WINDOW, STATED BEFORE IT BITES. Someone who finds out
          about the floor by hitting it has learned the same rule in the
          worse order. Test only — the practice equivalent is unwritten,
          see the header. */}
      {mode === 'testing' && (
        <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          {testTempoWindowText(songTempo)}
        </p>
      )}

      {clampedWhy !== '' && (
        <p className="text-[11px] leading-snug text-needswork">{clampedWhy}</p>
      )}
    </div>
  );
}

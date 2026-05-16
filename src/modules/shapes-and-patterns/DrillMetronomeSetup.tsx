/**
 * Inline metronome setup for the drill modals (DrillSession,
 * Scales, VoiceLeading). Sits alongside the duration picker in the
 * setup phase so the user can configure tempo, groove, and toggle
 * the click without leaving the modal.
 *
 * All state lives in the global metronome singleton: every change
 * flows through `metronome.update({ bpm | groove })` and the on/off
 * toggle uses the `'user'` driver — same source of truth as the
 * banner MetronomeControl, and the `metronomeBpm` / `metronomeGroove`
 * Dexie prefs that MetronomeControl persists. The setup widget here
 * just surfaces the controls in a second location; nothing else.
 *
 * The metronome doesn't auto-start when this component mounts.
 * Toggle is user-initiated (preview before drilling). When the user
 * taps "start drill", the modal calls `metronome.start('drill')` on
 * top of any active `'user'` driver — both stack cleanly per the
 * driver-stack rule (metronome.ts:303-316).
 */
import {
  GROOVE_LABEL,
  metronome,
  type GrooveId,
} from '../../lib/metronome';
import { useMetronomeState } from '../../lib/useMetronome';

const GROOVE_IDS: GrooveId[] = [
  'click', 'drum-basic', 'gospel', 'rnb-neosoul', 'jazz-swing', 'hip-hop', 'shuffle',
];

const BPM_MIN = 40;
const BPM_MAX = 220;
const BPM_PRESETS = [60, 75, 90, 110, 130, 160] as const;

function clampBpm(v: number): number {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, v));
}

export default function DrillMetronomeSetup() {
  const state = useMetronomeState();
  const toggle = () => {
    if (state.playing) metronome.stop('user');
    else void metronome.start('user');
  };
  return (
    <div className="space-y-2 rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
      <div className="flex items-center justify-between">
        <span className="text-neutral-500 uppercase tracking-wide text-xs">metronome</span>
        <button
          type="button"
          onClick={toggle}
          aria-label={state.playing ? 'stop metronome' : 'start metronome'}
          className={`px-2 py-0.5 rounded text-xs font-medium transition ${
            state.playing
              ? 'bg-fluent text-white'
              : 'border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
          }`}
        >
          {state.playing ? '■ stop' : '▶ preview'}
        </button>
      </div>

      {/* BPM slider + readout + ± steppers + presets */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-neutral-500 text-[11px]">tempo</span>
          <span className="font-mono tabular-nums text-sm">
            {state.bpm}<span className="text-neutral-400 ml-1 text-[10px] uppercase">bpm</span>
          </span>
        </div>
        <input
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          step={1}
          value={state.bpm}
          onChange={e => metronome.update({ bpm: Number(e.target.value) })}
          className="w-full accent-fluent"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => metronome.update({ bpm: clampBpm(state.bpm - 1) })}
            aria-label="decrease bpm by 1"
            className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent text-[10px] font-mono"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => metronome.update({ bpm: clampBpm(state.bpm + 1) })}
            aria-label="increase bpm by 1"
            className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent text-[10px] font-mono"
          >
            +
          </button>
          {BPM_PRESETS.map(b => (
            <button
              key={b}
              type="button"
              onClick={() => metronome.update({ bpm: b })}
              className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${
                state.bpm === b
                  ? 'bg-fluent text-white border-fluent'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Groove selector */}
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-neutral-500">groove</span>
        <select
          value={state.groove}
          onChange={e => metronome.update({ groove: e.target.value as GrooveId })}
          className="flex-1 ml-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
        >
          {GROOVE_IDS.map(g => (
            <option key={g} value={g}>{GROOVE_LABEL[g]}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

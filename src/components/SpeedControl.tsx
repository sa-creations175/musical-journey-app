import { useId } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPref, setPref } from '../lib/userPrefs';
import { defaultSpeed, speedPrefKey } from '../lib/goalConfig';

interface Props {
  moduleId: string;
  /** Override the userPrefs key this control reads/writes. Useful when
      a module needs multiple independent speed sliders — e.g. Scales &
      Modes keeps separate defaults for scale playback and modal vamps. */
  prefKeyOverride?: string;
  /** Override the fallback speed used when nothing is stored yet. */
  fallbackOverride?: number;
}

const MIN = 0.5;
const MAX = 2.0;
const STEP = 0.05;
const SNAP_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

function pct(v: number): number {
  return ((v - MIN) / (MAX - MIN)) * 100;
}

function snap(v: number): number {
  const clamped = Math.min(MAX, Math.max(MIN, v));
  const snapped = Math.round(clamped / STEP) * STEP;
  return Math.round(snapped * 100) / 100;
}

// Per-module playback speed control. Reads + writes userPrefs[speed<Module>]
// via useLiveQuery; changes take effect on the next playback. Pass
// `prefKeyOverride` / `fallbackOverride` for sub-tab scoping.
export default function SpeedControl({ moduleId, prefKeyOverride, fallbackOverride }: Props) {
  const listId = useId();
  const fallback = fallbackOverride ?? defaultSpeed(moduleId);
  const key = prefKeyOverride ?? speedPrefKey(moduleId);
  const speed = useLiveQuery(
    async () => getPref<number>(key, fallback),
    [key, fallback],
  ) ?? fallback;

  const set = async (v: number) => {
    await setPref(key, snap(v));
  };

  return (
    <div className="w-full max-w-[360px] text-xs">
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-neutral-500">playback speed</span>
        <div className="flex items-center gap-1">
          <span className="font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
            {speed.toFixed(2)}×
          </span>
          <button
            type="button"
            onClick={() => set(fallback)}
            aria-label="reset playback speed to default"
            title={`reset to ${fallback.toFixed(2)}×`}
            className="text-neutral-400 hover:text-fluent shrink-0"
          >
            ↻
          </button>
        </div>
      </div>

      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={speed}
        list={listId}
        onChange={e => set(Number(e.target.value))}
        aria-label="playback speed"
        className="block w-full accent-fluent h-2 cursor-pointer"
      />
      <datalist id={listId}>
        {SNAP_PRESETS.map(v => <option key={v} value={v} />)}
      </datalist>

      {/* Tick marks + endpoint/center labels, percentage-positioned so
          they stay aligned with the slider track at any width. */}
      <div className="relative h-4 mt-1">
        {SNAP_PRESETS.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => set(v)}
            aria-label={`set playback speed to ${v}×`}
            style={{ left: `${pct(v)}%`, transform: 'translateX(-50%)' }}
            className="absolute top-0 w-2.5 h-3 flex items-start justify-center -mt-0.5"
          >
            <span className="w-px h-1.5 bg-neutral-300 dark:bg-neutral-600" aria-hidden />
          </button>
        ))}
        <span className="absolute bottom-0 left-0 text-[10px] text-neutral-400 tabular-nums">
          0.5×
        </span>
        <span
          className="absolute bottom-0 text-[10px] text-neutral-400 tabular-nums"
          style={{ left: '50%', transform: 'translateX(-50%)' }}
        >
          1×
        </span>
        <span className="absolute bottom-0 right-0 text-[10px] text-neutral-400 tabular-nums">
          2×
        </span>
      </div>
    </div>
  );
}

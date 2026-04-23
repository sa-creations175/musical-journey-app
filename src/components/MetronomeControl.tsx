import { useEffect, useRef, useState } from 'react';
import {
  GROOVE_LABEL,
  TIME_SIG_BEATS,
  metronome,
  type GrooveId,
  type TimeSig,
} from '../lib/metronome';
import { useMetronomeState } from '../lib/useMetronome';
import { getPref, setPref } from '../lib/userPrefs';

const PREF_BPM = 'metronomeBpm';
const PREF_GROOVE = 'metronomeGroove';
const PREF_TIME_SIG = 'metronomeTimeSig';
const PREF_VOLUME = 'metronomeVolume';

const GROOVE_IDS: GrooveId[] = [
  'click', 'drum-basic', 'gospel', 'rnb-neosoul', 'jazz-swing', 'hip-hop', 'shuffle',
];
const TIME_SIG_IDS: TimeSig[] = ['4/4', '3/4', '6/8', '12/8'];

/**
 * Compact metronome control designed for the app header. Renders as
 * a play/pause pill with the current BPM + groove; click the pill to
 * open a settings popover with groove, time sig, volume, and tap
 * tempo.
 *
 * State persists via userPrefs so the metronome picks up the same
 * BPM / groove / time sig across reloads.
 */
export default function MetronomeControl() {
  const state = useMetronomeState();
  const [expanded, setExpanded] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Hydrate persisted settings once on mount.
  useEffect(() => {
    (async () => {
      const bpm = await getPref<number>(PREF_BPM, 90);
      const groove = await getPref<GrooveId>(PREF_GROOVE, 'click');
      const timeSig = await getPref<TimeSig>(PREF_TIME_SIG, '4/4');
      const volume = await getPref<number>(PREF_VOLUME, 0.5);
      metronome.update({
        bpm: clamp(bpm, 40, 220),
        groove: GROOVE_IDS.includes(groove) ? groove : 'click',
        timeSig: TIME_SIG_IDS.includes(timeSig) ? timeSig : '4/4',
        volume: clamp(volume, 0, 1),
      });
      setPrefsLoaded(true);
    })();
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!prefsLoaded) return;
    void setPref(PREF_BPM, state.bpm);
    void setPref(PREF_GROOVE, state.groove);
    void setPref(PREF_TIME_SIG, state.timeSig);
    void setPref(PREF_VOLUME, state.volume);
  }, [prefsLoaded, state.bpm, state.groove, state.timeSig, state.volume]);

  // Click outside collapses the popover.
  useEffect(() => {
    if (!expanded) return;
    const handle = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [expanded]);

  return (
    <div ref={rootRef} className="relative">
      <div className="inline-flex items-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
        <button
          onClick={() => metronome.toggle()}
          aria-label={state.playing ? 'stop metronome' : 'start metronome'}
          title={state.playing ? 'stop metronome' : 'start metronome'}
          className={`px-2 py-1 text-xs transition ${
            state.playing ? 'bg-fluent text-white' : 'text-neutral-500 hover:text-fluent'
          }`}
        >
          {state.playing ? '■' : '▶'}
        </button>
        <button
          onClick={() => setExpanded(v => !v)}
          className="px-2 py-1 text-xs font-mono tabular-nums text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 border-l border-neutral-200 dark:border-neutral-700"
          aria-expanded={expanded}
          title="metronome settings"
        >
          {state.bpm}
          <span className="text-neutral-400 ml-1">bpm</span>
        </button>
      </div>

      {expanded && (
        <div
          role="dialog"
          aria-label="metronome settings"
          className="absolute right-0 mt-2 z-40 w-72 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-3 space-y-3 text-xs"
        >
          {/* BPM slider + readout */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-neutral-500 uppercase tracking-wide">tempo</span>
              <span className="font-mono tabular-nums text-sm">{state.bpm} <span className="text-neutral-400">bpm</span></span>
            </div>
            <input
              type="range"
              min={40}
              max={220}
              step={1}
              value={state.bpm}
              onChange={e => metronome.update({ bpm: Number(e.target.value) })}
              className="w-full accent-fluent"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {[60, 75, 90, 110, 130, 160].map(b => (
                <button
                  key={b}
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
              <TapTempoButton />
            </div>
          </div>

          {/* Groove selector */}
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500 uppercase tracking-wide">groove</span>
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

          {/* Time signature */}
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500 uppercase tracking-wide">time signature</span>
            <select
              value={state.timeSig}
              onChange={e => metronome.update({ timeSig: e.target.value as TimeSig })}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
            >
              {TIME_SIG_IDS.map(t => (
                <option key={t} value={t}>{t} ({TIME_SIG_BEATS[t]} beats)</option>
              ))}
            </select>
          </label>

          {/* Volume */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-neutral-500 uppercase tracking-wide">volume</span>
              <span className="font-mono tabular-nums">{Math.round(state.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.volume}
              onChange={e => metronome.update({ volume: Number(e.target.value) })}
              className="w-full accent-fluent"
            />
          </div>

          <p className="text-[10px] text-neutral-400 italic">
            drill timers auto-start the metronome with these settings.
          </p>
        </div>
      )}
    </div>
  );
}

function TapTempoButton() {
  const [flash, setFlash] = useState(false);
  return (
    <button
      onClick={() => {
        metronome.tap();
        setFlash(true);
        window.setTimeout(() => setFlash(false), 120);
      }}
      className={`px-2 py-0.5 rounded border text-[10px] font-medium transition ${
        flash
          ? 'bg-fluent text-white border-fluent'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
      }`}
      title="tap repeatedly to set tempo"
    >
      tap
    </button>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

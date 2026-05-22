import { useEffect, useRef, useState } from 'react';
import {
  GROOVE_LABEL,
  PREF_BPM,
  PREF_GROOVE,
  PREF_TIME_SIG,
  PREF_VOLUME,
  TIME_SIG_BEATS,
  metronome,
  type GrooveId,
  type TimeSig,
} from '../lib/metronome';
import { useMetronomeState } from '../lib/useMetronome';
import { getPref, setPref } from '../lib/userPrefs';

const GROOVE_IDS: GrooveId[] = [
  'click', 'drum-basic', 'gospel', 'rnb-neosoul', 'jazz-swing', 'hip-hop', 'shuffle',
];
const TIME_SIG_IDS: TimeSig[] = ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8', '12/8'];

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
          // z-50 keeps the popover above page-level sticky bars,
          // backdrop-blur surfaces, and any transform/filter ancestors
          // that create stacking contexts downstream.
          className="absolute right-0 mt-2 z-50 w-72 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-3 space-y-3 text-xs"
        >
          {/* BPM slider + click-to-edit readout + ± steppers */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-neutral-500 uppercase tracking-wide">tempo</span>
              <BpmEditor
                bpm={state.bpm}
                onCommit={next => metronome.update({ bpm: clamp(next, 40, 220) })}
              />
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
              <button
                onClick={() => metronome.update({ bpm: clamp(state.bpm - 1, 40, 220) })}
                aria-label="decrease bpm by 1"
                title="decrease bpm"
                className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent text-[10px] font-mono"
              >
                −
              </button>
              <button
                onClick={() => metronome.update({ bpm: clamp(state.bpm + 1, 40, 220) })}
                aria-label="increase bpm by 1"
                title="increase bpm"
                className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent text-[10px] font-mono"
              >
                +
              </button>
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
            </div>
            <TapTempoRow currentBpm={state.bpm} />
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

/**
 * Click-to-edit BPM readout. Shows as a button with the current BPM;
 * clicking swaps to a numeric input that commits on Enter or blur and
 * discards on Escape. Validates 40-220 and silently reverts invalid
 * input — the slider + steppers handle finer control for users who
 * prefer them.
 */
function BpmEditor({
  bpm,
  onCommit,
}: {
  bpm: number;
  onCommit: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(bpm));
  const inputRef = useRef<HTMLInputElement>(null);

  const begin = () => {
    setDraft(String(bpm));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseInt(draft.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 40 && parsed <= 220 && parsed !== bpm) {
      onCommit(parsed);
    }
    // Invalid or out-of-range: silently revert by not calling onCommit.
    setEditing(false);
  };

  const cancel = () => {
    setDraft(String(bpm));
    setEditing(false);
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <span className="inline-flex items-baseline gap-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          inputMode="numeric"
          aria-label="bpm"
          className="w-14 rounded border border-fluent/50 bg-white dark:bg-neutral-900 px-1 py-0.5 font-mono tabular-nums text-sm text-right focus:outline-none focus:border-fluent"
        />
        <span className="text-neutral-400 text-[10px] uppercase">bpm</span>
      </span>
    );
  }

  return (
    <button
      onClick={begin}
      title="click to type a BPM (40-220)"
      className="font-mono tabular-nums text-sm hover:text-fluent transition-colors cursor-text"
    >
      {bpm} <span className="text-neutral-400">bpm</span>
    </button>
  );
}

/**
 * Tap tempo UI. Counts user taps, flashes on each, and after four
 * (a steady pulse the algorithm can trust) surfaces a small inline
 * confirmation ("Set to 84 BPM from your taps"). Includes an info
 * popover explaining the feature — the raw "tap" button never made
 * its purpose obvious.
 */
function TapTempoRow({ currentBpm }: { currentBpm: number }) {
  const [flash, setFlash] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [confirmedBpm, setConfirmedBpm] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
  }, []);

  const handleTap = () => {
    metronome.tap();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 150);

    // Reset the tap streak if the user pauses for > 3 s (matches
    // the 3-second window inside metronome.tap).
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setTapCount(0);
      setConfirmedBpm(null);
    }, 3200);

    const nextCount = tapCount + 1;
    setTapCount(nextCount);

    // At 4+ taps the algorithm has a stable average — surface the
    // confirmation. Read the BPM AFTER the metronome has processed
    // the tap so the confirmed value matches what got set.
    if (nextCount >= 4) {
      // metronome.tap() is sync, so state.bpm in this closure is the
      // pre-tap value. Pull from the singleton directly for the fresh
      // post-tap reading.
      window.setTimeout(() => {
        setConfirmedBpm(metronome.state.bpm);
      }, 10);
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = window.setTimeout(() => {
        setConfirmedBpm(null);
      }, 2500);
    }
  };

  return (
    <div className="space-y-1 pt-1">
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleTap}
          title="Tap this button in rhythm to set the BPM. Tap at least 4 times in a steady pulse."
          className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition ${
            flash
              ? 'bg-fluent text-white border-fluent scale-[1.04]'
              : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent'
          }`}
        >
          tap tempo
        </button>
        <button
          onClick={() => setShowInfo(v => !v)}
          aria-label="what is tap tempo?"
          title="what is tap tempo?"
          className="w-5 h-5 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-fluent hover:border-fluent text-[10px] leading-none flex items-center justify-center"
        >
          ?
        </button>
        {tapCount > 0 && tapCount < 4 && (
          <span className="text-[10px] text-neutral-500 italic">
            {tapCount} tap{tapCount === 1 ? '' : 's'} · keep going
          </span>
        )}
      </div>

      {showInfo && (
        <div className="rounded-md border border-fluent/30 bg-fluent/5 p-2 text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
          <strong className="text-fluent">Tap Tempo:</strong> listen to a song
          or imagine a rhythm, then tap this button in time with the beat.
          After 4+ taps, the metronome calculates the BPM and sets itself to
          that tempo.
        </div>
      )}

      {confirmedBpm !== null && (
        <div className="text-[11px] text-fluent font-medium">
          ✓ set to {confirmedBpm} bpm from your taps
        </div>
      )}

      {/* Keep the current-bpm reference visible when the tap bar isn't
          announcing a change — reassures the user that their input
          actually landed. */}
      {confirmedBpm === null && tapCount === 0 && (
        <div className="text-[10px] text-neutral-400">
          currently {currentBpm} bpm
        </div>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

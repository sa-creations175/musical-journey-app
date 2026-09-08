/**
 * One chord movement: hear it, transpose it, press its notes.
 *
 * =====================================================================
 * BUILT FROM THE SIGNED-OFF PROTOTYPE
 * (`docs/chord-movement-playback-prototype_1.html`), top to bottom, in
 * its order. Every label here is transcribed from it and is listed as
 * provisional in `docs/WHOLE_SONG_TEST_COPY.md` — Silas has not done
 * the naming pass, and nothing on this screen was written.
 *
 * =====================================================================
 * THE SPELLING CONTROL CHANGES THE GLOBAL SETTING. It is the same one
 * Settings changes and NOT a per-movement override. `useSpelling`
 * writes through `userPrefs`, so flipping it here re-spells every open
 * screen — which is the point of putting it beside the key, where the
 * question "is that a G♭ or an F♯" actually arises.
 *
 * =====================================================================
 * A KEY MUST BE SET BEFORE IT PLAYS (ruling 10). Every pressed note is
 * a distance from a chord root, and a root resolves from key + degree —
 * so with no key there is nothing to anchor to. The control explains
 * that rather than guessing a key, because a movement played in a key
 * nobody chose is a movement nobody can trust.
 * =====================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import PianoKeyboard from '../../../components/PianoKeyboard';
import ChordVoicingPanel from '../../../components/ChordVoicingPanel';
import { db, type ChordPlacement, type VoicingHand } from '../../../lib/db';
import { ensureRunning, midiToFreq, playNote, playSeqChords, type PlaybackHandle } from '../../../lib/audio';
import { useSpelling } from '../../../lib/spellingPref';
import { useNotationMode } from '../../../lib/notationPref';
import type { CopiedVoicing } from '../../../lib/voicingClipboard';
import { chordToDisplay } from '../../repertoire/chordFunction';
import { chordRootNote, sanitizeVoicing } from '../../repertoire/voicingHelpers';
import { pitchClassOf } from '../../repertoire/chordParser';
import { parseTimeSignature } from '../../repertoire/barGrid';
import { normalizeVoicing } from '../../../lib/voicingColors';
import { KEYS } from '../catalog';
import { movementBarCount, updateMovement } from './movementStore';
import { movementDegreeName } from './movementLabels';
import { toPlayableMovement, voicingForPlacement } from './movementPlayback';

const NO_KEY = '__none__';

/** How long a single previewed note or chord rings for. */
const PREVIEW_SECONDS = 1.2;
const PRESS_SECONDS = 0.9;

export default function MovementScreen() {
  const { movementId } = useParams<{ movementId: string }>();
  const movement = useLiveQuery(
    async () => (movementId ? db.chordMovements.get(movementId) : undefined),
    [movementId],
  );

  const [spelling, setSpelling] = useSpelling();
  const [notationMode] = useNotationMode();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [soundingId, setSoundingId] = useState<string | null>(null);
  const [showNoKey, setShowNoKey] = useState(false);
  const [clipboard, setClipboard] = useState<CopiedVoicing | null>(null);
  const handle = useRef<PlaybackHandle | null>(null);

  const placements = useMemo(() => movement?.placements ?? [], [movement]);
  const { beatsPerBar } = parseTimeSignature(movement?.timeSignature);
  const barCount = movement ? movementBarCount(movement) : 1;

  const ordered = useMemo(
    () => [...placements].sort((a, b) =>
      (a.barIndex - b.barIndex)
      || (a.beatPos - b.beatPos)
      || (Number(a.offbeat ?? false) - Number(b.offbeat ?? false))),
    [placements],
  );

  // THE FIRST CHORD OPENS ALREADY SELECTED (ruling 16). DERIVED rather
  // than set in an effect: a default that is computed cannot race the
  // reader's own pick, and there is no frame where the panel is absent.
  const selectedId = pickedId ?? ordered[0]?.id ?? null;

  // A movement that stops being played, or a screen that goes away,
  // takes its scheduled notes with it.
  useEffect(() => () => { handle.current?.stop(); }, []);

  const selected = ordered.find(p => p.id === selectedId) ?? null;
  const playable = movement
    ? toPlayableMovement({
      placements: ordered,
      key: movement.key,
      timeSignature: movement.timeSignature,
    })
    : null;

  if (!movement) {
    return <div className="p-6 text-sm text-neutral-500">Loading…</div>;
  }

  const rootPcOf = (chord: ChordPlacement['chord']) =>
    movement.key ? pitchClassOf(chordRootNote(movement.key, chord.function, spelling)) : -1;

  const save = (changes: Parameters<typeof updateMovement>[1]) =>
    void updateMovement(movement.id, changes);

  const savePlacement = (id: string, patch: Partial<ChordPlacement>) =>
    save({ placements: placements.map(p => (p.id === id ? { ...p, ...patch } : p)) });

  const stop = () => {
    handle.current?.stop();
    handle.current = null;
    setPlaying(false);
    setSoundingId(null);
  };

  const play = () => {
    if (!playable) { setShowNoKey(true); return; }
    setShowNoKey(false);
    setPlaying(true);
    void (async () => {
      handle.current = await playSeqChords(
        playable.chords, playable.rootMidi, movement.playbackBpm,
        {
          loop: loop ? 'untilStopped' : 1,
          bassBalance: movement.bassBalance,
          onStep: i => setSoundingId(playable.placements[i]?.placementId ?? null),
        },
      );
      if (!loop) {
        const beats = playable.placements.reduce((s, p) => s + p.beats, 0);
        window.setTimeout(
          () => stop(),
          (beats * 60 / movement.playbackBpm) * 1000 + 200,
        );
      }
    })();
  };

  /** Sound one chord where it sits, without touching the transport. */
  const previewChord = (placement: ChordPlacement) => {
    const one = toPlayableMovement({
      placements: [placement], key: movement.key, timeSignature: movement.timeSignature,
    });
    if (!one) { setShowNoKey(true); return; }
    void (async () => {
      const ctx = await ensureRunning();
      const at = ctx.currentTime + 0.02;
      one.chords[0].intervals.forEach(iv => {
        playNote(midiToFreq(one.rootMidi + iv), at, PREVIEW_SECONDS, ctx, 0.18);
      });
    })();
  };

  /** Ruling 17: a key sounds as it is pressed. */
  const soundPressedNote = (offset: number, hand: VoicingHand) => {
    if (!selected || !movement.key) return;
    const semi = toPlayableMovement({
      placements: [{ ...selected, voicing: [{ offset, hand }] }],
      key: movement.key, timeSignature: movement.timeSignature,
    });
    if (!semi) return;
    void (async () => {
      const ctx = await ensureRunning();
      playNote(
        midiToFreq(semi.rootMidi + semi.chords[0].intervals[0]),
        ctx.currentTime + 0.01, PRESS_SECONDS, ctx, 0.18,
      );
    })();
  };

  const sounding = ordered.find(p => p.id === soundingId) ?? null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
        <Link to="/shapes-and-patterns" className="hover:text-fluent">Shapes &amp; Patterns</Link>
        <span className="mx-1.5">›</span>
        <span className="text-neutral-800 dark:text-neutral-100 font-semibold">
          Chord Movements &amp; Passes
        </span>
      </div>

      <input
        type="text"
        aria-label="Movement name"
        data-testid="movement-name"
        value={movement.name}
        placeholder="Name this movement"
        onChange={e => save({ name: e.target.value })}
        className="block w-full max-w-xl bg-transparent border-0 border-b border-dashed border-neutral-400 dark:border-neutral-600 text-2xl font-semibold py-1 focus:outline-none focus:border-fluent"
      />

      <textarea
        rows={3}
        aria-label="Movement description"
        data-testid="movement-description"
        value={movement.description}
        placeholder="How you see and think about this movement. Where it comes from, what the bass is doing, where it lands."
        onChange={e => save({ description: e.target.value })}
        className="block w-full max-w-xl rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-2 text-sm"
      />

      {/* --- transport ------------------------------------------- */}
      <div
        data-testid="movement-transport"
        className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3"
      >
        <button
          type="button"
          data-testid="movement-play"
          onClick={() => (playing ? stop() : play())}
          className="min-w-[6rem] rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3.5 py-2 text-sm font-medium"
        >
          {playing ? 'Stop' : 'Play'}
        </button>

        <button
          type="button"
          data-testid="movement-loop"
          aria-pressed={loop}
          onClick={() => setLoop(v => !v)}
          className={loop
            ? 'rounded-lg border border-fluent bg-fluent/10 text-fluent px-3.5 py-2 text-sm'
            : 'rounded-lg border border-neutral-300 dark:border-neutral-700 px-3.5 py-2 text-sm'}
        >
          {loop ? 'Loop on' : 'Loop off'}
        </button>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">Key</span>
          <select
            data-testid="movement-key"
            value={movement.key ?? NO_KEY}
            onChange={e => {
              stop();
              setShowNoKey(false);
              save({ key: e.target.value === NO_KEY ? undefined : e.target.value });
            }}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
          >
            {KEYS.map(k => (
              <option key={k} value={k}>{chordToDisplay({ function: '1', quality: '' }, 'concrete', k, spelling)}</option>
            ))}
            <option value={NO_KEY}>No key</option>
          </select>
        </label>

        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">Spelling</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
            <button
              type="button"
              data-testid="spelling-flat"
              aria-pressed={spelling === 'flat'}
              onClick={() => void setSpelling('flat')}
              className={spelling === 'flat'
                ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm'
                : 'px-3 py-1.5 text-sm'}
            >
              ♭
            </button>
            <button
              type="button"
              data-testid="spelling-sharp"
              aria-pressed={spelling === 'sharp'}
              onClick={() => void setSpelling('sharp')}
              className={spelling === 'sharp'
                ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm'
                : 'px-3 py-1.5 text-sm'}
            >
              ♯
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">Bass</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
            <button
              type="button"
              data-testid="bass-forward"
              aria-pressed={movement.bassBalance === 'forward'}
              onClick={() => save({ bassBalance: 'forward' })}
              className={movement.bassBalance === 'forward'
                ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm'
                : 'px-3 py-1.5 text-sm'}
            >
              Forward
            </button>
            <button
              type="button"
              data-testid="bass-even"
              aria-pressed={movement.bassBalance === 'even'}
              onClick={() => save({ bassBalance: 'even' })}
              className={movement.bassBalance === 'even'
                ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm'
                : 'px-3 py-1.5 text-sm'}
            >
              Even
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">BPM</span>
          <input
            type="range"
            min={30}
            max={160}
            data-testid="bpm-slider"
            value={movement.playbackBpm}
            onChange={e => save({ playbackBpm: Number(e.target.value) })}
            className="w-28"
          />
          <input
            type="number"
            min={30}
            max={160}
            data-testid="bpm-number"
            value={movement.playbackBpm}
            onChange={e => save({ playbackBpm: clampBpm(e.target.value) })}
            className="w-16 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm font-mono tabular-nums"
          />
        </label>
      </div>

      {showNoKey && (
        <p
          data-testid="movement-no-key"
          className="rounded-lg border border-needswork bg-needswork/10 px-3.5 py-2.5 text-sm"
        >
          Set a key first. The pressed notes are stored as distances from the
          key&rsquo;s root, so without a key there is nothing to anchor them to.
        </p>
      )}

      <h2 className="text-base font-semibold">
        Select a chord to create, edit or review its voicing.
      </h2>

      {/* --- the bar grid ----------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-3" data-testid="movement-grid">
        {Array.from({ length: barCount }).map((_, bar) => (
          <div
            key={bar}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5"
          >
            <div className="flex justify-between text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">
              <span>Bar {bar + 1}</span>
              <span>{movement.timeSignature}</span>
            </div>
            <div className="relative grid gap-1" style={{ gridTemplateColumns: `repeat(${beatsPerBar}, 1fr)` }}>
              {Array.from({ length: beatsPerBar }).map((_, slot) => (
                <div
                  key={slot}
                  className="h-16 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 px-1 text-[10px] text-neutral-400"
                >
                  {slot + 1}
                </div>
              ))}
              {ordered.filter(p => p.barIndex === bar).map(p => {
                const width = 100 / beatsPerBar;
                const derived = normalizeVoicing(p.voicing).length === 0;
                const name = movementDegreeName(p.chord, spelling);
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`movement-chord-${p.id}`}
                    data-sounding={soundingId === p.id ? 'true' : 'false'}
                    data-derived={derived ? 'true' : 'false'}
                    onClick={() => setPickedId(p.id)}
                    style={{ left: `${p.beatPos * width}%`, width: `calc(${p.beats * width}% - 4px)` }}
                    className={boxClass(derived, soundingId === p.id, selectedId === p.id)}
                  >
                    <span className="text-sm font-semibold leading-tight truncate w-full text-left">
                      {name.degree}
                      {name.raised ? <sup>{name.quality}</sup> : name.quality}
                      {name.bass ? `/${name.bass}` : ''}
                    </span>
                    <span className="text-[11px] text-neutral-500 truncate w-full text-left">
                      {chordToDisplay(p.chord, notationMode === 'numbers' ? 'concrete' : notationMode, movement.key, spelling)}
                      {derived ? ' · filled in' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* --- the shared editor ------------------------------------ */}
      {selected && (
        <div
          data-testid="movement-editor"
          className="rounded-lg border border-fluent bg-white dark:bg-neutral-900"
        >
          <ChordVoicingPanel
            chord={selected.chord}
            voicing={selected.voicing}
            rootPc={rootPcOf(selected.chord)}
            preferFlats={spelling === 'flat'}
            keyIsSet={Boolean(movement.key)}
            liveEditing
            derivedNote="Filled in from the chord symbol"
            onPreviewChord={() => previewChord(selected)}
            onNotePressed={soundPressedNote}
            clipboard={{ copied: clipboard, onCopy: setClipboard }}
            onVoicingChange={v =>
              savePlacement(selected.id, { voicing: sanitizeVoicing(v) })}
          />
        </div>
      )}

      {/* --- what is sounding ------------------------------------- */}
      <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2.5">
          <h2 className="text-sm font-semibold">What is sounding</h2>
          <span className="text-[13px] text-neutral-500">
            Colour is the interval from the chord root, as on the lead sheet. Left hand is dimmer.
          </span>
        </div>
        <div data-testid="movement-sounding">
          <PianoKeyboard
            rootPc={sounding ? rootPcOf(sounding.chord) : 0}
            voicing={sounding ? voicingForPlacement(sounding) : []}
            preferFlats={spelling === 'flat'}
            faint={!sounding}
            octaves={4}
            absoluteOffsets
          />
        </div>
      </div>
    </div>
  );
}

function clampBpm(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 72;
  return Math.min(160, Math.max(30, Math.round(n)));
}

/** WHOLE LITERALS, never assembled. Tailwind only sees class names it
 *  can read in the source, so a class built from a variable is a class
 *  that is not in the built CSS. */
function boxClass(derived: boolean, sounding: boolean, selected: boolean): string {
  const base = 'absolute top-0 h-16 rounded-md border px-1.5 py-1 flex flex-col justify-between overflow-hidden text-left';
  const skin = sounding
    ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/40'
    : derived
      ? 'border-dashed border-neutral-400 bg-neutral-100 dark:bg-neutral-800'
      : 'border-neutral-400 dark:border-neutral-600 bg-white dark:bg-neutral-900';
  const ring = selected ? 'ring-2 ring-fluent' : '';
  return `${base} ${skin} ${ring}`;
}

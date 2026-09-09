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
 *
 * =====================================================================
 * THE GRID IS THE LEAD SHEET'S OWN (ruling 18). `BarGridView`, the same
 * component the song lead sheet renders, driven by the movement's own
 * placements through `movementGrid`'s view of them. Tap-to-add with the
 * numbers parser and its preview, Paste chord, the Length rules, drag a
 * chord, drag bars, "+ bar" and delete bar all arrive with it and not
 * one of them is written here.
 *
 * WHAT IS ALLOWED TO DIFFER BETWEEN A SONG SECTION'S GRID AND A
 * MOVEMENT'S, AND WHY. Anything not on this list may not differ. If a
 * difference is needed that is not here, it goes on this list with its
 * reason or it does not happen.
 *
 *  1. NO LYRICS, NO PHRASE LINES, NO LYRIC STAGING. A movement has no
 *     words. Every lyric prop is optional on the grid and none is
 *     passed, so the lyric row, the tray and the syllable popovers
 *     never render — nothing was switched off, they simply have no
 *     data.
 *
 *  2. NO PER-SONG SPELLING OVERRIDE. A movement follows the global
 *     setting only. It is not a song and has no override to resolve;
 *     the grid already reads `useSpelling` directly, so this is a
 *     difference in what EXISTS rather than in what is read.
 *
 *  3. THE CHORD BOXES LEAD WITH THE SCALE-DEGREE NUMBER, name beneath,
 *     and the number re-spells with the global setting (ruling 14).
 *     `chordToDisplay`'s `numbers` mode cannot do it — it prints the
 *     stored ASCII degree, `b6dim`, and ignores the spelling — so the
 *     cell takes a `chordCellLead` line from its host. A variant of the
 *     cell, not a second cell.
 *
 *  4. TAPPING A CHORD SELECTS IT IN THE INLINE EDITOR AND OPENS NO
 *     POPOVER. The movement carries the shared voicing panel below the
 *     grid, permanently; opening the grid's popover as well would put
 *     two editors on one chord from one tap. Silas ruled on this
 *     directly. Length, Copy chord and Delete chord live in the inline
 *     editor's header instead, which is what the signed-off entry
 *     prototype draws — and Copy chord fills the same clipboard the
 *     grid's add box reads for Paste chord, so nothing is lost.
 *
 *  5. THE PLAY HIGHLIGHT. The lead sheet has no playback, so it has no
 *     sounding chord to mark. The mark is on the movement's own layer
 *     over the grid rather than inside the cell, because "which chord
 *     is sounding" is not a fact about a chord.
 *
 *  6. THE "FILLED IN" MARKING on a chord with nothing pressed (ruling
 *     11). A movement is about to PLAY that guess and says so; a lead
 *     sheet plays nothing and has nothing to disclose. Same reason as
 *     the voicing panel's own item 6.
 *
 * Everything else — the slots, the add box and its parser, the
 * durations, the drag targets, the bar header, the empty-bar delete —
 * is the lead sheet's, unchanged.
 * =====================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import PianoKeyboard from '../../../components/PianoKeyboard';
import ChordVoicingPanel from '../../../components/ChordVoicingPanel';
import { db, type ChordFunction, type ChordPlacement, type VoicingHand } from '../../../lib/db';
import { ensureRunning, midiToFreq, playNote, playSeqChords, type PlaybackHandle } from '../../../lib/audio';
import { useSpelling } from '../../../lib/spellingPref';
import { resolveSpelling, type Spelling } from '../../../lib/spelling';
import type { CopiedVoicing } from '../../../lib/voicingClipboard';
import { chordToDisplay } from '../../repertoire/chordFunction';
import { chordRootNote, sanitizeVoicing } from '../../repertoire/voicingHelpers';
import { pitchClassOf } from '../../repertoire/chordParser';
import BarGridView, { parseSlotDropId } from '../../repertoire/BarGridView';
import { KEYS } from '../catalog';
import { updateMovement } from './movementStore';
import { movementDegreeName } from './movementLabels';
import {
  addBar, addChord, deleteBar, deleteChord, moveChord, movementGridView,
  reorderBars, setChordLength, swapChords, type MovementPatch,
} from './movementGrid';
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

  const [globalSpelling] = useSpelling();
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** The whole-chord clipboard the grid's add box reads for its Paste
   *  option. Filled by Copy chord in the editor header below, since the
   *  grid's own popover never opens here — allowed-to-differ item 4. */
  const [copiedChord, setCopiedChord] = useState<ChordFunction | null>(null);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [soundingId, setSoundingId] = useState<string | null>(null);
  const [showNoKey, setShowNoKey] = useState(false);
  const [clipboard, setClipboard] = useState<CopiedVoicing | null>(null);
  const handle = useRef<PlaybackHandle | null>(null);

  /**
   * What this screen spells in — the movement's own opinion where it
   * has one (ruling 23).
   *
   * THE SAME RULE A SONG FOLLOWS, through the same `resolveSpelling`.
   * `undefined` means no opinion and tracks the global, which is why
   * nothing writes a default into the field.
   */
  const spelling = resolveSpelling(movement?.spelling, globalSpelling);

  const placements = useMemo(() => movement?.placements ?? [], [movement]);
  // The grid drags with a pointer sensor and a small activation
  // distance, the way the lead sheet's does — without one, a tap to
  // select a chord registers as a drag of zero length.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

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

  /** Every grid gesture goes through `movementGrid`, which goes through
   *  `barGrid.ts`. Nothing about a placement is decided here. */
  const apply = (patch: MovementPatch) => {
    if (Object.keys(patch).length > 0) save(patch);
  };

  const grid = movementGridView(movement);

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    // The lead sheet's own two branches, and none of its lyric ones —
    // a movement has no words to drop.
    if (activeId.startsWith('bar:') && overId.startsWith('bar:')) {
      const from = parseInt(activeId.slice(4), 10);
      const to = parseInt(overId.slice(4), 10);
      if (Number.isFinite(from) && Number.isFinite(to)) {
        apply(reorderBars(movement, from, to));
      }
      return;
    }
    if (!activeId.startsWith('chord:')) return;
    const fromId = activeId.slice('chord:'.length);
    if (overId.startsWith('chord:')) {
      const toId = overId.slice('chord:'.length);
      if (fromId !== toId) apply(swapChords(movement, fromId, toId));
      return;
    }
    if (overId.startsWith('emptybeat:')) {
      const slot = parseSlotDropId(overId);
      if (slot) apply(moveChord(movement, fromId, slot.barIndex, slot.beatPos));
    }
  };

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
    // A CHORD WHOSE DEGREE HAS NO ROOT IS DROPPED BY THE TRANSLATION —
    // `SEMI_BY_DEGREE` knows `b6` and not `#5`, so a chord typed the
    // second way resolves to nothing. There is no sound to make for it
    // and reaching into an empty list would throw on a keystroke.
    if (one.chords.length === 0) return;
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

        {/* THE SONG'S OWN CONTROL, NOT A NEW ONE (ruling 23). It was a
            two-way ♭/♯ that wrote the GLOBAL setting; a movement has
            its own override now, exactly as a song does, and this is
            the select a song's detail page uses for it — word for word.

            THREE OPTIONS, NOT TWO, and that is the reason to reuse it
            rather than keep the toggle: a two-way control cannot show
            that a movement is INHERITING, only which side is lit. The
            global still lives in Settings, where a song's does. */}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            shows as
          </span>
          <select
            data-testid="movement-spelling"
            value={movement.spelling ?? 'inherit'}
            onChange={e => {
              const v = e.target.value;
              save({ spelling: v === 'inherit' ? undefined : (v as Spelling) });
            }}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            title="how this movement's key and chord names are spelled. changes names only — no practice data moves."
          >
            <option value="inherit">
              follow global ({globalSpelling === 'flat' ? 'flats' : 'sharps'})
            </option>
            <option value="flat">Always Flats</option>
            <option value="sharp">Always Sharps</option>
          </select>
        </label>

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

      {/* --- the bar grid: the lead sheet's own ------------------- */}
      <div data-testid="movement-grid" data-sounding={soundingId ?? ''}>
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <BarGridView
            song={grid.song}
            section={grid.section}
            activeArrangementId={grid.arrangementId}
            chordsAreSortable
            onChordAdd={(barIndex, beatPos, chord, offbeat) => {
              // THE PROTOTYPE'S STEP 1: it lands one position long, it
              // opens in the editor, and it sounds once. The id is
              // minted here rather than inside `addChord` so the chord
              // that was just made is the one that gets selected and
              // heard — reading it back off the list afterwards would
              // be finding it by guesswork.
              const id = crypto.randomUUID();
              apply(addChord(movement, barIndex, beatPos, chord, offbeat, id));
              setPickedId(id);
              previewChord({
                id, arrangementId: 'movement', barIndex, beatPos, beats: 1, chord,
                ...(offbeat ? { offbeat: true } : {}),
              });
              // A chord is a NUMBER and needs no key to be stored, so
              // this does not refuse. What it cannot do without one is
              // be voiced or heard, and that is what the message says.
              if (!movement.key) setShowNoKey(true);
            }}
            onChordSelect={setPickedId}
            onAddBar={() => apply(addBar(movement))}
            onDeleteBar={barIndex => apply(deleteBar(movement, barIndex))}
            onBarReorder={(from, to) => apply(reorderBars(movement, from, to))}
            copiedChord={copiedChord}
            highlightPlacementId={soundingId}
            markUnvoiced
            spelling={spelling}
            /* THE LEAD (ruling 14) — the degree, re-spelled with the
               global setting, above the chord name the cell already
               draws. See allowed-to-differ item 3. */
            chordCellLead={chord => {
              const name = movementDegreeName(chord, spelling);
              return (
                <>
                  {name.degree}
                  {name.raised ? <sup>{name.quality}</sup> : name.quality}
                  {name.bass ? `/${name.bass}` : ''}
                </>
              );
            }}
          />
        </DndContext>
      </div>

      {/* --- the shared editor ------------------------------------ */}
      {selected && (
        <div
          data-testid="movement-editor"
          className="rounded-lg border border-fluent bg-white dark:bg-neutral-900"
        >
          {/* LENGTH, COPY CHORD AND DELETE CHORD LIVE HERE, not in the
              grid's popover, which never opens on a movement — see
              allowed-to-differ item 4. This is what the signed-off
              entry prototype draws, and Copy chord fills the same
              clipboard the grid's add box reads for Paste chord.

              THE RULES ARE THE GRID'S. `setChordLength` clamps to the
              room a bar offers and cascades the chords after it, both
              through `barGrid.ts` — nothing about a duration is
              decided on this screen. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 px-2 py-1.5 text-[11px]">
            <span className="text-neutral-500">Length</span>
            <button
              type="button"
              data-testid="length-dec"
              aria-label="shorten chord"
              disabled={selected.beats <= 1}
              onClick={() => apply(setChordLength(movement, selected.id, selected.beats - 1))}
              className="w-6 h-6 leading-none rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-30"
            >
              −
            </button>
            <span data-testid="length-value" className="font-mono tabular-nums w-6 text-center">
              {selected.beats}
            </span>
            <button
              type="button"
              data-testid="length-inc"
              aria-label="lengthen chord"
              disabled={selected.beats >= grid.barSlots}
              onClick={() => apply(setChordLength(movement, selected.id, selected.beats + 1))}
              className="w-6 h-6 leading-none rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-30"
            >
              +
            </button>
            <span className="flex-1" />
            <button
              type="button"
              data-testid="copy-chord"
              onClick={() => setCopiedChord(selected.chord)}
              className="rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 hover:border-fluent hover:text-fluent"
            >
              Copy chord
            </button>
            <button
              type="button"
              data-testid="delete-chord"
              onClick={() => {
                setPickedId(null);
                apply(deleteChord(movement, selected.id));
              }}
              className="rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 hover:border-needswork hover:text-needswork"
            >
              Delete chord
            </button>
          </div>
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



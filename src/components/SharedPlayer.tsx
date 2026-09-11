/**
 * The app's one playback panel.
 *
 * =====================================================================
 * ONE COMPONENT, EVERY SURFACE THAT MAKES A SOUND.
 *
 * It was `PlayItPanel` and it served the six built-answer families;
 * this is the same component grown to the shape Silas signed off in
 * `shared-player-prototype_1.html` on 10 Sep 2026. Ear training, the
 * Shapes & Patterns grids and the harmonic diary move onto it in the
 * commits after this one.
 *
 * WHAT MAY DIFFER BETWEEN SURFACES IS A WRITTEN LIST, and it is short:
 *
 *   · a quiz hides the board before the answer and may play on arrival;
 *     every other surface waits for a tap
 *   · chord recognition never re-voices, and adds "Chord sounds"
 *   · beside a drill the ladder is locked to the row and nothing is
 *     rated
 *   · the melody ring appears only where a surface has a melody line
 *   · "aids before you answer" exist only on quiz surfaces
 *   · chord motion always names the key on the card, because its
 *     question is which degree and not which letter
 *   · chord motion is answered with degree chips or with the piano,
 *     never with chips of chord names
 *   · chord motion's board is visible before the answer only in Piano
 *     keys mode, and unlit until the reader taps
 *   · chord motion adds "Starting note", the one aid no other surface
 *     has, and shows no Compare row
 *
 * Anything else that differs is a bug. A surface chooses which ROWS it
 * shows and never what a row means — the tempo, the lift, the hands and
 * the colours are this component's, so two screens cannot come to
 * disagree about what "up an octave" does.
 *
 * =====================================================================
 * IT OWNS THE PLAYING, WHICH IS WHY PAUSE WORKS.
 *
 * The old panel took an `onPlay` callback and each caller ran its own
 * handle. Pause and Resume cannot be right that way: resuming needs to
 * know how far in the sequence had got, and that is one clock, held in
 * one place. So this component calls the player and the caller hands it
 * chords.
 *
 * PAUSE STOPS WHERE IT IS. RESUME PICKS UP FROM THERE. HEAR IT ALWAYS
 * STARTS OVER. The three are different on purpose and the prototype
 * says so on the screen.
 *
 * =====================================================================
 * NOTHING AUTOPLAYS EXCEPT A QUIZ CARD ON ARRIVAL.
 *
 * This component has no effect that starts audio. A quiz that plays as
 * its card arrives does it from its own arrival handler, which is the
 * one allowed difference — everything else waits for a tap.
 * =====================================================================
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import BuiltAnswerKeyboard from './BuiltAnswerKeyboard';
import { THICKNESSES, type Thickness } from '../lib/builtAnswers/chordShapes';
import type { KeyMark } from '../lib/builtAnswers/board';
import type { Move } from '../lib/builtAnswers/voiceLeading';
import type { PlaybackHandle } from '../lib/musicalPlayback';
import { panelBeats, playPanel } from '../lib/builtAnswers/play';
import {
  BPM_MAX, BPM_MIN, LADDER_RUNGS, LOOP_OPTIONS, clampBpm, readSettingsOpen,
  writeSettingsOpen, type ChordAttack, type PlayerSettings,
} from '../lib/player/settings';
import {
  bassDrop, handsForSetting, playerMarks, type PlayerChord,
} from '../lib/player/voices';
import { useInstrument } from '../lib/instrumentContext';
import { useSpelling } from '../lib/spellingPref';
import ChordColorLegend from './ChordColorLegend';
import {
  VISUAL_TIMING_MAX, VISUAL_TIMING_MIN, VISUAL_TIMING_STEP,
  clampVisualTiming, readVisualTiming, writeVisualTiming,
} from '../lib/player/visualTiming';
import type { InKeyRing } from '../lib/player/inKeyColour';
import type { Instrument } from '../lib/audio';

const CHIP = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
const CHIP_OFF = 'border-black/10 dark:border-white/20 bg-black/[0.03] '
  + 'dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/10';
const CHIP_ON = 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 '
  + 'text-white dark:bg-neutral-100 dark:text-neutral-900';

function Chip({
  on, onClick, children, testId, disabled,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={testId}
      disabled={disabled === true}
      onClick={onClick}
      className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF} `
        + 'disabled:opacity-40 disabled:cursor-default'}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** A direction row: the chord names with a tappable arrow between. */
interface DirectionRow {
  /** The moves as the reader has set them; `'auto'` where they have
   *  not touched it. Index i is the move from chord i into chord i+1. */
  value: ReadonlyArray<Move>;
  onChange: (moves: Move[]) => void;
  /** Which way each move ACTUALLY went, once voiced. The arrow shows
   *  this, not the setting, so an untouched row still says what the
   *  bass is doing. */
  effective: ReadonlyArray<'up' | 'down'>;
}

interface SharedPlayerProps {
  /** The chords, voiced and named. */
  chords: ReadonlyArray<PlayerChord>;
  /** Sound a single low tonic in this key first. Omit for none — a
   *  single quiz chord never gets one. */
  orientPc?: number;
  settings: PlayerSettings;
  onSettings: (next: PlayerSettings) => void;

  /** The thickness ladder. Omit for no ladder — a scale has none. */
  thickness?: {
    value: Thickness;
    onChange: (t: Thickness) => void;
    /** Which rungs this surface offers. A triad has one. */
    rungs?: ReadonlyArray<Thickness>;
    /** Beside a drill the rung IS the row, so it is shown and fixed. */
    locked?: boolean;
  };
  /** The Bass direction row. Omit where fewer than two chords move. */
  bassDirection?: DirectionRow;
  /** The Hand direction row, same shape. */
  handDirection?: DirectionRow;

  /**
   * Show the Hands row and the Listen to row.
   *
   * BOTH DEFAULT TO "WHERE THERE IS A BASS TO SEPARATE FROM THE HAND".
   * On a scale card there is no left hand and no bass line, so both
   * rows would be controls that do nothing; on a progression there is,
   * so both appear. A surface can say otherwise — chord recognition
   * hides Hands because one chord has one hand and the inversion is the
   * question, and shows Listen to because "bass only" there means the
   * bottom note alone.
   */
  showHands?: boolean;
  showListen?: boolean;
  /** Show "Chord sounds". Chord recognition only. */
  attack?: { value: ChordAttack; onChange: (a: ChordAttack) => void };
  /**
   * The ring this surface draws on the sounding chord's root, in its
   * degree-of-the-key colour.
   *
   * OMITTED WHERE A SURFACE DRAWS NO RING, and the legend then does not
   * write the line about it — a legend naming a mark that is not on the
   * screen is worse than no legend. Chord Motion is the surface that
   * draws one today.
   */
  ring?: InKeyRing | null;

  /** The board. `false` hides it — a quiz before the answer. A node
   *  replaces it, for a surface whose board is also its input. */
  board?: false | ReactNode;
  /** What the board says it is, for a screen reader. */
  boardLabel?: string;
  /**
   * A line under the board, for a surface with no chord chips.
   *
   * THE CHIPS ARE THE NAMES WHERE THERE ARE CHORDS — one per chord,
   * tappable, which is what "Hear one chord" is. A scale or a key
   * signature has no chords to chip, and still has something to say
   * about what is about to sound.
   */
  caption?: string;
  /** The Compare row and anything else that sits above the ladder. */
  compare?: ReactNode;
  /** Under everything, in small type. */
  children?: ReactNode;

  /** Hide every control of the player's own. A quiz before the answer
   *  drives it from its own Play button and shows nothing here. */
  controls?: boolean;
  /** Fires as each chord starts, so a caller can follow along. */
  onStep?: (index: number) => void;
  /**
   * Which chord the board shows before anything has played.
   *
   * THE FIRST ONE, UNLESS THE CARD'S ANSWER IS A LATER ONE. Chord
   * Motion's reveal is about where the move LANDED, so its board opens
   * on the second chord; a passage's opens on its first. Once playback
   * starts this is replaced by whatever is sounding.
   */
  startLit?: number;
  /** Beats per chord, where a surface wants something other than two. */
  beats?: number;
  /**
   * Sound something that is not a list of chords.
   *
   * =====================================================================
   * THE SCALE CARDS ARE WHY THIS EXISTS, AND IT IS A SEAM, NOT AN
   * ESCAPE HATCH.
   *
   * A scale is a run of single notes over a drone, not chords in a row,
   * so `playPanel` has no shape for it. What it DOES share with every
   * other surface is the transport: one Hear it, one Pause that stops
   * where it is, one Resume that picks up from there. Handing the panel
   * a play function keeps that one clock in one place; a scale card
   * running its own would be the second transport this component exists
   * to prevent.
   *
   * `totalBeats` is what Pause measures against — without it the panel
   * cannot say how far in the sequence had got.
   * =====================================================================
   */
  play?: (opts: { startAtBeat: number }) => Promise<PlaybackHandle>;
  /** How long the custom sequence runs, in beats. */
  totalBeats?: number;
}

/**
 * The chord's root, ringed in its degree-of-the-key colour.
 *
 * ON EVERY OCTAVE OF THE ROOT THAT IS LIT, because the root is the
 * root wherever it sounds — a ring on the bass and not on the hand's
 * own root would read as two different notes.
 */
function ringed(
  marks: Map<number, KeyMark>,
  chord: PlayerChord | null,
  ring: InKeyRing | null | undefined,
): ReadonlyMap<number, KeyMark> {
  // NO RING ON THE 1 — `inKeyRing` returns a null colour for it and the
  // legend says why in words. Nothing to draw, so nothing is drawn.
  if (ring == null || ring.colour === null || chord === null) return marks;
  const out = new Map(marks);
  for (const [midi, mark] of marks) {
    if ((((midi - chord.rootPc) % 12) + 12) % 12 === 0) {
      out.set(midi, { ...mark, ring: ring.colour });
    }
  }
  return out;
}

/** Where the transport is, so Pause knows what to do. */
type Transport = 'stopped' | 'playing' | 'paused';

export default function SharedPlayer({
  chords, orientPc, settings, onSettings, thickness,
  bassDirection, handDirection, showHands, showListen, attack,
  board, boardLabel = 'What is sounding', caption, compare, children,
  controls = true, onStep, beats, play, totalBeats, ring, startLit = 0,
}: SharedPlayerProps) {
  const { currentInstrument, setCurrentInstrument } = useInstrument();
  const [spelling] = useSpelling();
  const [handle, setHandle] = useState<PlaybackHandle | null>(null);
  const [transport, setTransport] = useState<Transport>('stopped');
  const [lit, setLit] = useState<number | null>(null);
  // READ ONCE, AT FIRST RENDER. It is a value this device already
  // holds, not something to synchronise with after the fact.
  const [foldOpen, setFoldOpen] = useState(readSettingsOpen);
  // PER DEVICE, like the fold — see `visualTiming`. The paint loop reads
  // the stored value itself; this copy is only what the dial shows.
  const [visualTiming, setVisualTiming] = useState(readVisualTiming);
  /** Wall-clock start and the beat it started at, for Pause. */
  const clock = useRef<{ at: number; beat: number }>({ at: 0, beat: 0 });

  // Leaving the card mid-playback leaves nothing ringing.
  useEffect(() => () => { handle?.stop(); }, [handle]);

  // THE CHORDS, NOT THEIR COUNT. A broken chord's slot grows to fit its
  // roll, so Pause has to measure against the chords themselves — a
  // count cannot say how many notes each one has.
  const total = totalBeats ?? panelBeats(chords, {
    settings,
    ...(orientPc === undefined ? {} : { orientPc }),
    ...(beats === undefined ? {} : { beats }),
  });

  // THE HANDS ROW, APPLIED ONCE FOR THE WHOLE LIST — see
  // `handsForSetting`. What plays, what lights and what the legend names
  // all read this, so "Root in the right hand" is one voicing everywhere.
  const voiced = useMemo(() => handsForSetting(chords, settings), [chords, settings]);

  const run = (startAtBeat: number) => {
    handle?.stop();
    clock.current = { at: Date.now(), beat: startAtBeat };
    setTransport('playing');
    const started = play !== undefined
      ? play({ startAtBeat })
      : playPanel(voiced, settings, {
        ...(orientPc === undefined ? {} : { orientPc }),
        ...(beats === undefined ? {} : { beats }),
        ...(startAtBeat > 0 ? { startAtBeat } : {}),
        onStep: (i: number) => { setLit(i); onStep?.(i); },
      });
    void started.then(setHandle).catch(() => { setTransport('stopped'); });
  };

  /** How far in the sequence is, in beats. */
  const elapsedBeats = (): number => {
    const seconds = (Date.now() - clock.current.at) / 1000;
    const beat = clock.current.beat + seconds * (settings.bpm / 60);
    // A LOOPING SEQUENCE WRAPS. Resuming a fourth pass at beat 30 of a
    // 6-beat sequence would start past the end and play nothing.
    return total > 0 ? beat % total : 0;
  };

  const hearIt = () => run(0);

  const pauseOrResume = () => {
    if (transport === 'paused') { run(clock.current.beat); return; }
    if (transport !== 'playing') return;
    const at = elapsedBeats();
    handle?.stop();
    setHandle(null);
    clock.current = { at: Date.now(), beat: at };
    setTransport('paused');
  };

  /**
   * One chord alone, from its chip.
   *
   * IT LIGHTS THROUGH THE PAINT LOOP, LIKE HEAR IT. It used to set the
   * board as the chip was tapped and then play, so the keys changed
   * before the chord was heard — on headphones with any delay, and
   * whatever the Visual timing dial said. Now the chord's one step
   * paints when the audio clock reaches it, held by the reported delay
   * and the dial, and the caller hears about it the same way it hears
   * about every step of Hear it — so a surface drawing its own ring
   * follows the chip too.
   */
  const hearOne = (i: number) => {
    const chord = voiced[i];
    if (chord === undefined) return;
    handle?.stop();
    setTransport('playing');
    void playPanel([chord], settings, {
      loop: 1,
      beats: 3,
      onStep: () => { setLit(i); onStep?.(i); },
    })
      .then(setHandle)
      .catch(() => { setTransport('stopped'); });
  };

  const set = (patch: Partial<PlayerSettings>) => onSettings({ ...settings, ...patch });

  const rungs = thickness?.rungs ?? LADDER_RUNGS;
  const hasBass = chords.some(c => c.bass !== null);
  const handsRow = showHands ?? hasBass;
  const listenRow = showListen ?? hasBass;
  // THE LIT KEYS ARE THE SOUNDING KEYS. With Bass on Forward the line
  // drops an octave, and the board follows it down — Silas's law of
  // 10 Sep 2026, for every surface.
  const drop = bassDrop(chords, settings);
  const sounding = voiced[lit ?? startLit] ?? voiced[0] ?? null;
  const marks: ReadonlyMap<number, KeyMark> = ringed(
    playerMarks(sounding, settings, drop), sounding, ring,
  );

  const directionRow = (
    label: string, row: DirectionRow, what: string, testId: string,
  ) => (
    <Row label={label}>
      {chords.map((c, i) => (
        <span key={`${c.name}-${i}`} className="flex items-center gap-1.5">
          <span className={`${CHIP} border-dashed ${CHIP_OFF} font-mono`}>{c.name}</span>
          {i < chords.length - 1 && (
            <button
              type="button"
              data-testid={`${testId}-${i}`}
              title={`${what} moves ${row.effective[i] ?? 'up'} into the next chord. Tap to flip.`}
              onClick={() => {
                const next = [...row.value];
                while (next.length < chords.length - 1) next.push('auto');
                next[i] = (row.effective[i] ?? 'up') === 'down' ? 'up' : 'down';
                row.onChange(next);
              }}
              className={`${CHIP} ${CHIP_OFF}`}
            >
              {(row.effective[i] ?? 'up') === 'down' ? '↓' : '↑'}
            </button>
          )}
        </span>
      ))}
    </Row>
  );

  return (
    <div
      className="space-y-3 rounded-xl border border-black/[0.07] dark:border-white/10 p-3"
      data-testid="shared-player"
    >
      {board !== false && (
        board === undefined
          ? <BuiltAnswerKeyboard marks={marks} label={boardLabel} />
          : board
      )}

      {/* UNDER THE SHARED KEYBOARD, ON EVERY REVEAL. The board has been
          teaching a colour vocabulary nobody wrote down; this names it.
          Closed by default and remembered per device — see
          `ChordColorLegend`. */}
      {board !== false && (
        <ChordColorLegend
          chord={lit === null ? (voiced[0] ?? null) : (voiced[lit] ?? null)}
          settings={settings}
          drop={drop}
          spelling={spelling}
          {...(ring === undefined ? {} : { ring })}
        />
      )}

      {chords.length > 0 && controls && (
        <Row label="Hear one chord">
          {chords.map((c, i) => (
            <Chip
              key={`${c.name}-${i}`}
              on={(lit ?? startLit) === i}
              testId={`hear-one-${i}`}
              onClick={() => hearOne(i)}
            >
              <span className="font-mono">{c.name}</span>
            </Chip>
          ))}
        </Row>
      )}

      {caption !== undefined && (
        <div className="font-mono text-sm" data-testid="play-it-names">{caption}</div>
      )}

      {compare !== undefined && compare}

      {controls && thickness !== undefined && (
        <Row
          label={thickness.locked === true
            ? 'Thickness · locked to this row'
            : 'Thickness'}
        >
          {THICKNESSES.filter(t => rungs.includes(t.id)).map(t => (
            <Chip
              key={t.id}
              on={thickness.value === t.id}
              testId={`thickness-${t.id}`}
              disabled={thickness.locked === true && t.id !== thickness.value}
              onClick={() => thickness.onChange(t.id)}
            >
              {t.label}
            </Chip>
          ))}
        </Row>
      )}

      {controls && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="player-hear"
            onClick={hearIt}
            className={`${CHIP} ${CHIP_ON}`}
          >
            Hear it
          </button>
          <button
            type="button"
            data-testid="player-pause"
            disabled={transport === 'stopped'}
            onClick={pauseOrResume}
            className={`${CHIP} ${CHIP_OFF} disabled:opacity-40 disabled:cursor-default`}
          >
            {transport === 'paused' ? 'Resume' : 'Pause'}
          </button>
          {transport === 'paused' && (
            <span
              className="text-[11px] text-neutral-500 dark:text-neutral-400"
              data-testid="player-paused-note"
            >
              Paused where it was. Resume picks up from here; Hear it starts over.
            </span>
          )}
        </div>
      )}

      {controls && (
        <details
          open={foldOpen}
          data-testid="player-settings"
          onToggle={e => {
            const open = (e.currentTarget as HTMLDetailsElement).open;
            setFoldOpen(open);
            writeSettingsOpen(open);
          }}
          className="rounded-lg border border-dashed border-black/10 dark:border-white/15 px-3 py-2"
        >
          <summary className="cursor-pointer text-xs text-neutral-500 dark:text-neutral-400">
            Settings
          </summary>
          <div className="space-y-3 pt-2">
            {bassDirection !== undefined && chords.length > 1
              && directionRow('Bass direction', bassDirection, 'Bass', 'bass-dir')}
            {handDirection !== undefined && chords.length > 1
              && directionRow('Hand direction', handDirection, 'Right hand', 'hand-dir')}

            {listenRow && (
              <Row label="Listen to">
                <Chip on={settings.listen === 'both'} testId="listen-both" onClick={() => set({ listen: 'both' })}>
                  Bass and chords
                </Chip>
                <Chip on={settings.listen === 'bass'} testId="listen-bass" onClick={() => set({ listen: 'bass' })}>
                  Bass only
                </Chip>
              </Row>
            )}

            {listenRow && (
              <Row label="Bass">
                <Chip on={settings.bass === 'forward'} testId="bass-forward" onClick={() => set({ bass: 'forward' })}>
                  Forward
                </Chip>
                <Chip on={settings.bass === 'blended'} testId="bass-blended" onClick={() => set({ bass: 'blended' })}>
                  Blended
                </Chip>
              </Row>
            )}

            {handsRow && (
              <Row label="Hands">
                {/* TWO RIGHT-HAND VOICINGS over the same bass — see
                    `Hands`. The left hand always plays the bass. */}
                <Chip on={settings.hands === 'rootless'} testId="hands-rootless" onClick={() => set({ hands: 'rootless' })}>
                  Rootless right hand
                </Chip>
                <Chip on={settings.hands === 'root'} testId="hands-root" onClick={() => set({ hands: 'root' })}>
                  Root in the right hand
                </Chip>
              </Row>
            )}

            <Row label="Right hand">
              <Chip on={!settings.octaveUp} testId="hand-written" onClick={() => set({ octaveUp: false })}>
                As voiced
              </Chip>
              <Chip on={settings.octaveUp} testId="hand-up" onClick={() => set({ octaveUp: true })}>
                Up an octave
              </Chip>
            </Row>

            <Row label="Tempo">
              <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <input
                  type="range"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  value={settings.bpm}
                  data-testid="tempo"
                  aria-label="Tempo in beats per minute"
                  onChange={e => set({ bpm: clampBpm(Number(e.target.value)) })}
                  className="w-28 align-middle"
                />
                <input
                  type="number"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  value={settings.bpm}
                  data-testid="tempo-number"
                  aria-label="Tempo, typed"
                  onChange={e => set({ bpm: clampBpm(Number(e.target.value)) })}
                  className="w-14 rounded-md border border-black/10 dark:border-white/20 bg-transparent px-1.5 py-0.5 font-mono tabular-nums"
                />
                bpm
              </label>
            </Row>

            <Row label="Loop">
              {LOOP_OPTIONS.map(o => (
                <Chip
                  key={String(o.id)}
                  on={settings.loop === o.id}
                  testId={`loop-${String(o.id)}`}
                  onClick={() => set({ loop: o.id })}
                >
                  {o.label}
                </Chip>
              ))}
            </Row>

            <Row label="Colours">
              <Chip on={settings.colours === 'plain'} testId="colours-plain" onClick={() => set({ colours: 'plain' })}>
                Plain
              </Chip>
              <Chip on={settings.colours === 'interval'} testId="colours-interval" onClick={() => set({ colours: 'interval' })}>
                By interval
              </Chip>
            </Row>

            <Row label="Instrument">
              {(['piano', 'rhodes', 'organ', 'strings', 'voice'] as const).map(i => (
                <Chip
                  key={i}
                  on={currentInstrument === i}
                  testId={`instrument-${i}`}
                  onClick={() => setCurrentInstrument(i as Instrument)}
                >
                  {i.charAt(0).toUpperCase() + i.slice(1)}
                </Chip>
              ))}
            </Row>

            {/* VISUAL TIMING, for headphones that do not report their
                delay. Negative holds the keys back. Free. */}
            <Row label="Visual timing">
              <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <input
                  type="range"
                  min={VISUAL_TIMING_MIN}
                  max={VISUAL_TIMING_MAX}
                  step={VISUAL_TIMING_STEP}
                  value={visualTiming}
                  data-testid="visual-timing"
                  aria-label="Visual timing in milliseconds"
                  onChange={e => {
                    const ms = clampVisualTiming(Number(e.target.value));
                    setVisualTiming(ms);
                    writeVisualTiming(ms);
                  }}
                  className="w-36 align-middle"
                />
                <span className="font-mono tabular-nums" data-testid="visual-timing-value">
                  {visualTiming}
                </span>
                ms
              </label>
            </Row>
            {/* SILAS'S WORDS, 10 Sep 2026. Left is negative, and negative
                holds the repaint back — `visualTiming` — so the sentence
                is true of the dial above it. */}
            <p className="-mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400" data-testid="visual-timing-help">
              If the keys light up before you hear the chord, slide left until they match. If they light up after, slide right.
            </p>

            {attack !== undefined && (
              <Row label="Chord sounds">
                <Chip on={attack.value === 'blocked'} testId="attack-blocked" onClick={() => attack.onChange('blocked')}>
                  Blocked
                </Chip>
                <Chip on={attack.value === 'broken'} testId="attack-broken" onClick={() => attack.onChange('broken')}>
                  Broken
                </Chip>
              </Row>
            )}
          </div>
        </details>
      )}

      {children}
    </div>
  );
}
